// Integrated production server: Next.js plus the bundle proxy, one process,
// one port. Started via `next-dialect start`.
//
//   * asset requests go to the proxy, which rewrites only chunks that carry
//     strings (see proxy.mjs); everything else is served by Next as usual.
//   * HTML is rewritten as it streams, so Suspense/PPR keep working.
//   * un-prefixed URLs negotiate a locale (cookie -> Accept-Language ->
//     default); with localePrefix 'as-needed' the default locale is served at
//     canonical un-prefixed URLs instead of redirecting.
import { createServer } from 'node:http'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import zlib from 'node:zlib'
import next from 'next'
import { createBundleProxy } from './proxy.mjs'

// Rewrites /_next/static URLs in a streaming HTML response. A fixed tail is
// held back between chunks so a URL split across two writes still matches.
const HOLD = 512

function htmlRewriter(res, locale, proxy, acceptsGzip) {
  let carry = ''
  let isHtmlBody = null
  // Next hands us plaintext (we strip accept-encoding on the way in), so the
  // rewritten HTML is compressed here instead — otherwise the locale rewrite
  // would cost every visitor their gzip.
  let gzip = null
  // Streamed responses arrive as Uint8Array chunks that may split a
  // multi-byte character; StringDecoder holds the partial bytes back.
  const decoder = new StringDecoder('utf8')
  const toText = (chunk) => {
    if (chunk == null || typeof chunk === 'function') return ''
    if (typeof chunk === 'string') return chunk
    if (Buffer.isBuffer(chunk)) return decoder.write(chunk)
    if (ArrayBuffer.isView(chunk)) {
      return decoder.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))
    }
    return String(chunk)
  }
  const origWrite = res.write.bind(res)
  const origEnd = res.end.bind(res)
  const origWriteHead = res.writeHead.bind(res)

  // Only successful HTML bodies are rewritten. Redirects and errors are
  // passed through untouched — they carry no asset URLs, and re-framing a
  // 3xx body breaks keep-alive for the next request on the socket.
  const detect = (headers) => {
    const status = res.statusCode
    if (!(status >= 200 && status < 300)) return false
    // Never touch an encoded body — rewriting gzip bytes as text corrupts
    // the stream. Requests reach Next with accept-encoding stripped, so
    // this is a belt-and-braces guard.
    const enc =
      (headers && (headers['content-encoding'] || headers['Content-Encoding'])) ||
      res.getHeader('content-encoding')
    if (enc && String(enc) !== 'identity') return false
    const type =
      (headers && (headers['content-type'] || headers['Content-Type'])) ||
      res.getHeader('content-type')
    return !!type && String(type).includes('text/html')
  }

  // Starts the gzip stream lazily and wires its output to the real socket.
  const startGzip = () => {
    if (gzip || !acceptsGzip) return gzip
    gzip = zlib.createGzip()
    gzip.on('data', (d) => origWrite(d))
    return gzip
  }

  const prepareHeaders = (headers) => {
    // Length changes as URLs grow and as we compress; stream it instead.
    if (headers) {
      delete headers['content-length']
      delete headers['Content-Length']
      if (acceptsGzip) headers['content-encoding'] = 'gzip'
    } else if (!res.headersSent) {
      res.removeHeader('content-length')
      if (acceptsGzip) res.setHeader('content-encoding', 'gzip')
    }
    if (!res.headersSent) res.setHeader('vary', 'Accept-Encoding')
  }

  res.writeHead = (status, ...rest) => {
    const headers =
      rest.length && typeof rest[rest.length - 1] === 'object' && !Array.isArray(rest[rest.length - 1])
        ? rest[rest.length - 1]
        : undefined
    res.statusCode = status
    isHtmlBody = detect(headers)
    if (isHtmlBody) prepareHeaders(headers)
    return origWriteHead(status, ...rest)
  }

  const emit = (text) => {
    if (!text) return true
    const gz = startGzip()
    return gz ? gz.write(text) : origWrite(text)
  }

  res.write = (chunk, enc, cb) => {
    if (isHtmlBody === null) {
      isHtmlBody = detect()
      if (isHtmlBody) prepareHeaders()
    }
    if (!isHtmlBody) return origWrite(chunk, enc, cb)
    carry += toText(chunk)
    const done = typeof enc === 'function' ? enc : cb
    if (carry.length > HOLD) {
      const cut = carry.length - HOLD
      emit(proxy.rewriteHtml(carry.slice(0, cut), locale))
      carry = carry.slice(cut)
    }
    if (done) done()
    return true
  }

  res.end = (chunk, enc, cb) => {
    if (isHtmlBody === null) {
      isHtmlBody = detect()
      if (isHtmlBody) prepareHeaders()
    }
    if (!isHtmlBody) return origEnd(chunk, enc, cb)
    carry += toText(chunk) + decoder.end()
    // Un-shim first: origEnd's implicit header write re-enters writeHead.
    res.writeHead = origWriteHead
    res.write = origWrite
    const done = typeof chunk === 'function' ? chunk : typeof enc === 'function' ? enc : cb
    const tail = proxy.rewriteHtml(carry, locale)
    if (gzip || acceptsGzip) {
      const gz = startGzip()
      gz.on('end', () => origEnd(undefined, done))
      gz.end(tail)
      return res
    }
    return origEnd(tail, done)
  }
}

export async function createDialectServer({ port = 3000, dialect, dir = process.cwd() } = {}) {
  const locales = dialect.locales
  const defaultLocale = dialect.defaultLocale
  const prefix = process.env.DIALECT_PREFIX_OVERRIDE || dialect.localePrefix || 'always'
  const cookieName = dialect.detection?.cookie || 'DIALECT_LOCALE'
  const acceptLanguage = dialect.detection?.acceptLanguage !== false

  const proxy = createBundleProxy({
    staticDir: path.join(dir, '.next', 'static'),
    messagesDir: process.env.DIALECT_MESSAGES || path.join(dir, 'messages'),
    locales,
    defaultLocale,
    cookieName,
  })

  function negotiate(req) {
    const m = new RegExp('(?:^|;\\s*)' + cookieName + '=([A-Za-z-]+)').exec(req.headers.cookie || '')
    if (m && locales.includes(m[1])) return m[1]
    if (acceptLanguage) {
      for (const part of String(req.headers['accept-language'] || '').split(',')) {
        const code = part.split(';')[0].trim().toLowerCase()
        if (locales.includes(code)) return code
        const base = code.split('-')[0]
        if (locales.includes(base)) return base
      }
    }
    return defaultLocale
  }

  const app = next({ dev: false, dir })
  const handle = app.getRequestHandler()
  await app.prepare()

  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const segs = pathname.split('/').filter(Boolean)

    // Assets first: the proxy owns locale-prefixed and localized chunks.
    if (proxy.handle(req, res, pathname)) return

    // Shared assets have no locale and must never enter locale negotiation —
    // Next serves them directly, with one cache entry for every locale.
    if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') {
      return handle(req, res)
    }

    let locale = locales.includes(segs[0]) ? segs[0] : null
    if (!locale) {
      const negotiated = negotiate(req)
      if (prefix === 'as-needed' && negotiated === defaultLocale) {
        locale = defaultLocale
        req.url = '/' + defaultLocale + (req.url === '/' ? '' : req.url)
      } else {
        res.writeHead(302, { location: `/${negotiated}${pathname === '/' ? '/' : pathname}` })
        return res.end()
      }
    } else if (prefix === 'as-needed' && locale === defaultLocale && segs[1] !== '_next') {
      const rest = '/' + segs.slice(1).join('/')
      res.writeHead(308, { location: rest === '/' ? '/' : rest })
      return res.end()
    }

    res.setHeader('set-cookie', `${cookieName}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`)
    // The HTML must reach the rewriter as text; we re-compress it ourselves
    // after rewriting, so the visitor still gets gzip.
    const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '')
    delete req.headers['accept-encoding']
    htmlRewriter(res, locale, proxy, acceptsGzip)
    return handle(req, res)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, resolve)
  })
  console.log(
    `next-dialect on http://localhost:${port}/ — ${proxy.localized.size} localized chunk(s), ${locales.length} locales, localePrefix: ${prefix}`
  )
  return server
}
