// Bundle proxy: takes the single build's chunks, rewrites the ones that
// contain message tokens for the requested locale, and returns them.
//
// This replaces the on-disk N-copy fork for server deployments. Two things
// fall out of it:
//   * only chunks that actually contain strings are locale-specific; React,
//     framework and vendor chunks keep one shared URL and one cache entry,
//     so a locale switch re-downloads kilobytes instead of megabytes.
//   * there is no build step that duplicates the output tree.
//
// Requests are served in two shapes:
//   /<locale>/_next/static/...  entry chunks, referenced from rewritten HTML.
//                               Locale is in the URL: immutable, CDN-friendly.
//   /_next/static/...           lazily-loaded chunks, whose URLs are built by
//                               the webpack runtime with no locale. Localized
//                               ones resolve via the locale cookie and are
//                               served with Vary: Cookie; everything else is
//                               passed through to Next untouched.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const catalogs = require_('./compiler/catalog.cjs')
const { hasTokens, replaceTokens, jsEscape } = require_('./compiler/tokens.cjs')

const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}
const ASSET_RE = /\/_next\/static\/[A-Za-z0-9._%\-/]+/g
const PREFIX = '/_next/static/'

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    e.isDirectory() ? walk(p, out) : out.push(p)
  }
  return out
}

export function createBundleProxy({
  staticDir,
  messagesDir,
  locales,
  defaultLocale,
  cookieName = 'DIALECT_LOCALE',
}) {
  const root = path.resolve(staticDir)
  const catalogCache = new Map()
  const rendered = new Map()

  // One scan at boot: which emitted files carry message tokens?
  const localized = new Set()
  for (const file of walk(root)) {
    if (!/\.(js|css)$/.test(file)) continue
    if (hasTokens(fs.readFileSync(file, 'utf8'))) {
      localized.add(path.relative(root, file).split(path.sep).join('/'))
    }
  }

  function catalogFor(locale) {
    if (!catalogCache.has(locale)) {
      catalogCache.set(locale, catalogs.loadResolved(messagesDir, locale, defaultLocale))
    }
    return catalogCache.get(locale)
  }

  function localeFromCookie(req) {
    const m = new RegExp('(?:^|;\\s*)' + cookieName + '=([A-Za-z-]+)').exec(
      req.headers.cookie || ''
    )
    return m && locales.includes(m[1]) ? m[1] : defaultLocale
  }

  // Rewritten chunks are cached both raw and gzipped: they are immutable for
  // a given (locale, file), so compressing once is free after the first hit.
  function render(locale, rel) {
    const key = locale + ':' + rel
    let entry = rendered.get(key)
    if (entry) return entry
    const file = path.join(root, rel)
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null
    const source = fs.readFileSync(file, 'utf8')
    const { out, errors } = replaceTokens(source, {
      catalog: catalogFor(locale),
      locale,
      escape: jsEscape,
    })
    if (errors.length) {
      console.error(`[next-dialect] ${rel} (${locale}): ${errors.join('; ')}`)
    }
    const raw = Buffer.from(out)
    entry = { raw, gzip: zlib.gzipSync(raw, { level: 9 }) }
    rendered.set(key, entry)
    return entry
  }

  return {
    /** Chunks that carry strings, and therefore need a locale to be served. */
    localized,

    /** Rewrites only localized asset URLs; shared chunks keep one URL. */
    rewriteHtml(html, locale) {
      return html.replace(ASSET_RE, (url) => {
        const rel = decodeURIComponent(url.slice(PREFIX.length))
        return localized.has(rel) ? '/' + locale + url : url
      })
    },

    /**
     * Serves an asset request if this proxy owns it.
     * Returns true when the response has been written.
     */
    handle(req, res, pathname) {
      const segs = pathname.split('/').filter(Boolean)
      let locale = null
      let rel = null

      if (locales.includes(segs[0]) && segs[1] === '_next' && segs[2] === 'static') {
        locale = segs[0]
        rel = segs.slice(3).join('/')
      } else if (pathname.startsWith(PREFIX)) {
        rel = pathname.slice(PREFIX.length)
        // Shared chunk: let Next serve it with its own caching.
        if (!localized.has(rel)) return false
        locale = localeFromCookie(req)
      } else {
        return false
      }

      const entry = render(locale, rel)
      if (!entry) {
        res.writeHead(404)
        res.end('no such asset: ' + pathname)
        return true
      }
      const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '')
      const body = gzip ? entry.gzip : entry.raw
      const headers = {
        'content-type': TYPES[path.extname(rel)] || 'application/octet-stream',
        'content-length': body.length,
        'cache-control': 'public, max-age=31536000, immutable',
      }
      if (gzip) headers['content-encoding'] = 'gzip'
      // Cookie-resolved variants must not be cached across locales.
      const varyOn = ['Accept-Encoding']
      if (!locales.includes(segs[0])) varyOn.push('Cookie')
      headers.vary = varyOn.join(', ')
      res.writeHead(200, headers)
      res.end(body)
      return true
    },
  }
}
