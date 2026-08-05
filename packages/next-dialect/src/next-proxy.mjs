// next-dialect/proxy — the whole server story as a Next Proxy handler, so a
// deployment needs no custom server at all. Mount it from the project root:
//
//   // proxy.ts
//   import { createDialectProxy } from 'next-dialect/proxy'
//
//   export const proxy = createDialectProxy()
//   export const config = { matcher: '/((?!_next/image|favicon.ico).*)' }
//
// Then `next build && next start` is the whole deployment, and it works on
// platforms that do not run custom servers.
//
// Two differences from `next-dialect start`, both consequences of Proxy
// running *before* the render rather than around it:
//
//   * There is no HTML rewriting, because there is no response body to
//     rewrite. Localized chunks therefore keep their built URLs and resolve
//     the locale from the cookie, which is already how lazily-loaded chunks
//     work. The cost is `Vary: Cookie` on those chunks instead of a
//     locale-scoped URL — framework and vendor chunks are untouched either
//     way, since they carry no messages.
//   * Nothing strips Accept-Encoding, so Next compresses HTML normally.
//
// Requires the Node.js runtime: Proxy in Next 16 uses it by default, and
// Middleware from 15.5 can opt into it.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import { NextResponse } from 'next/server'

const require_ = createRequire(import.meta.url)
const catalogs = require_('./compiler/catalog.cjs')
const { hasTokens, replaceTokens, jsEscape } = require_('./compiler/tokens.cjs')

const PREFIX = '/_next/static/'
const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}
const COOKIE_MAX_AGE = 31536000

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    e.isDirectory() ? walk(p, out) : out.push(p)
  }
  return out
}

/**
 * @param {object} [options] Overrides for what `withDialect` publishes to the
 *   environment. Supply these when the settings cannot be read at runtime —
 *   a platform that evaluates next.config only at build time, for instance.
 * @param {string[]} [options.locales]
 * @param {string} [options.defaultLocale]
 * @param {'always'|'as-needed'} [options.localePrefix]
 * @param {string} [options.cookie]
 * @param {boolean} [options.acceptLanguage]
 * @param {string} [options.messages]  Catalog directory.
 * @param {string} [options.staticDir] Defaults to `.next/static`.
 */
export function createDialectProxy(options = {}) {
  const locales =
    options.locales || (process.env.DIALECT_LOCALES || '').split(',').filter(Boolean)
  const defaultLocale = options.defaultLocale || process.env.DIALECT_DEFAULT || locales[0]
  const prefixMode =
    options.localePrefix || process.env.DIALECT_PREFIX_OVERRIDE || process.env.DIALECT_PREFIX || 'always'
  const cookieName = options.cookie || process.env.DIALECT_COOKIE || 'DIALECT_LOCALE'
  const acceptLanguage = options.acceptLanguage !== false
  const messagesDir =
    options.messages || process.env.DIALECT_MESSAGES || path.join(process.cwd(), 'messages')
  const staticDir = options.staticDir || path.join(process.cwd(), '.next', 'static')

  if (!locales.length) {
    throw new Error(
      '[next-dialect] createDialectProxy: no locales. withDialect publishes them via ' +
        'DIALECT_LOCALES when next.config is evaluated; if that does not happen in your ' +
        'runtime, pass { locales, defaultLocale } explicitly.'
    )
  }

  // Which emitted files carry message tokens. Scanned once, on the first
  // request rather than at module load, so importing this file stays cheap
  // and a missing build directory is not a startup crash.
  let localized = null
  function getLocalized() {
    if (localized) return localized
    localized = new Set()
    for (const file of walk(staticDir)) {
      if (!/\.(js|css)$/.test(file)) continue
      if (hasTokens(fs.readFileSync(file, 'utf8'))) {
        localized.add(path.relative(staticDir, file).split(path.sep).join('/'))
      }
    }
    return localized
  }

  const catalogCache = new Map()
  function catalogFor(locale) {
    if (!catalogCache.has(locale)) {
      catalogCache.set(locale, catalogs.loadResolved(messagesDir, locale, defaultLocale))
    }
    return catalogCache.get(locale)
  }

  // Substituted chunks are immutable for a (locale, file) pair, so both the
  // raw and gzipped bytes are worth keeping after the first hit.
  const rendered = new Map()
  function render(locale, rel) {
    const key = locale + ':' + rel
    const hit = rendered.get(key)
    if (hit) return hit
    const file = path.join(staticDir, rel)
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null
    const { out, errors } = replaceTokens(fs.readFileSync(file, 'utf8'), {
      catalog: catalogFor(locale),
      locale,
      escape: jsEscape,
    })
    if (errors.length) console.error(`[next-dialect] ${rel} (${locale}): ${errors.join('; ')}`)
    const raw = Buffer.from(out)
    const entry = { raw, gzip: zlib.gzipSync(raw, { level: 9 }) }
    rendered.set(key, entry)
    return entry
  }

  function cookieLocale(request) {
    const value = request.cookies.get(cookieName)?.value
    return value && locales.includes(value) ? value : defaultLocale
  }

  function negotiate(request) {
    const fromCookie = request.cookies.get(cookieName)?.value
    if (fromCookie && locales.includes(fromCookie)) return fromCookie
    if (acceptLanguage) {
      for (const part of (request.headers.get('accept-language') || '').split(',')) {
        const code = part.split(';')[0].trim().toLowerCase()
        if (locales.includes(code)) return code
        const base = code.split('-')[0]
        if (locales.includes(base)) return base
      }
    }
    return defaultLocale
  }

  function remember(response, locale) {
    response.cookies.set(cookieName, locale, {
      path: '/',
      maxAge: COOKIE_MAX_AGE,
      sameSite: 'lax',
    })
    return response
  }

  return function proxy(request) {
    // Cloning nextUrl carries the query string along, so redirects and
    // rewrites below only ever have to touch the pathname.
    const { pathname } = request.nextUrl

    // ---- assets -----------------------------------------------------------
    if (pathname.startsWith(PREFIX)) {
      const rel = decodeURIComponent(pathname.slice(PREFIX.length))
      // A chunk with no messages in it is the same file for every locale;
      // let Next serve it, with one cache entry for all of them.
      if (!getLocalized().has(rel)) return
      const entry = render(cookieLocale(request), rel)
      if (!entry) return

      const gzip = /\bgzip\b/.test(request.headers.get('accept-encoding') || '')
      const body = gzip ? entry.gzip : entry.raw
      const headers = {
        'content-type': TYPES[path.extname(rel)] || 'application/octet-stream',
        'content-length': String(body.length),
        'cache-control': 'public, max-age=31536000, immutable',
        // The URL is locale-free, so the cookie is part of the cache key.
        vary: 'Accept-Encoding, Cookie',
      }
      if (gzip) headers['content-encoding'] = 'gzip'
      return new Response(body, { headers })
    }

    // ---- pages ------------------------------------------------------------
    const segments = pathname.split('/').filter(Boolean)
    const prefixed = locales.includes(segments[0]) ? segments[0] : null

    if (!prefixed) {
      const locale = negotiate(request)
      if (prefixMode === 'as-needed' && locale === defaultLocale) {
        // The default locale is canonical at un-prefixed URLs; rewrite rather
        // than redirect so the address bar keeps the short form.
        const url = request.nextUrl.clone()
        url.pathname = '/' + defaultLocale + (pathname === '/' ? '' : pathname)
        return remember(NextResponse.rewrite(url), locale)
      }
      const url = request.nextUrl.clone()
      url.pathname = '/' + locale + (pathname === '/' ? '' : pathname)
      return remember(NextResponse.redirect(url, 307), locale)
    }

    if (prefixMode === 'as-needed' && prefixed === defaultLocale) {
      const rest = '/' + segments.slice(1).join('/')
      const url = request.nextUrl.clone()
      url.pathname = rest === '/' ? '/' : rest
      return remember(NextResponse.redirect(url, 308), prefixed)
    }

    // Already on a locale-prefixed URL: make the cookie agree, so the chunks
    // this page is about to request resolve to the same locale. This is the
    // step that replaces rewriting asset URLs into the HTML.
    return remember(NextResponse.next(), prefixed)
  }
}

export default createDialectProxy
