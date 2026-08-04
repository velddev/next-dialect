// Minimal static server for the per-locale trees — a stand-in for the CDN
// config a real deployment would use. Supports both prefix modes:
//   DIALECT_PREFIX=always     /<locale>/... only; / negotiates + redirects
//   DIALECT_PREFIX=as-needed  default locale at canonical un-prefixed URLs
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const distDir = path.resolve(process.argv[2] || 'dist')
const port = Number(process.env.PORT || 4321)
const locales = fs.readdirSync(distDir)
const defaultLocale = process.env.DIALECT_DEFAULT || 'en'
const prefixMode = process.env.DIALECT_PREFIX || 'always'
const cookieName = process.env.DIALECT_COOKIE || 'DIALECT_LOCALE'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function negotiate(req) {
  const m = new RegExp('(?:^|;\\s*)' + cookieName + '=([A-Za-z-]+)').exec(req.headers.cookie || '')
  if (m && locales.includes(m[1])) return m[1]
  for (const part of String(req.headers['accept-language'] || '').split(',')) {
    const code = part.split(';')[0].trim().toLowerCase()
    if (locales.includes(code)) return code
    const base = code.split('-')[0]
    if (locales.includes(base)) return base
  }
  return defaultLocale
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let segs = url.split('/').filter(Boolean)

    if (!locales.includes(segs[0])) {
      const negotiated = negotiate(req)
      if (prefixMode === 'as-needed' && negotiated === defaultLocale) {
        segs = [defaultLocale, ...segs] // serve default tree at un-prefixed URLs
      } else {
        res.writeHead(302, { location: `/${negotiated}${url === '/' ? '/' : url}` })
        return res.end()
      }
    } else if (prefixMode === 'as-needed' && segs[0] === defaultLocale && segs[1] !== '_next') {
      const rest = '/' + segs.slice(1).join('/')
      res.writeHead(308, { location: rest === '/' ? '/' : rest })
      return res.end()
    }

    let file = path.join(distDir, ...segs)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      for (const candidate of [file + '.html', path.join(file, 'index.html')]) {
        if (fs.existsSync(candidate)) {
          file = candidate
          break
        }
      }
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404)
      return res.end('not found: ' + url)
    }
    const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }
    if (file.endsWith('.html')) {
      headers['set-cookie'] = `${cookieName}=${segs[0]}; Path=/; Max-Age=31536000; SameSite=Lax`
    }
    res.writeHead(200, headers)
    res.end(fs.readFileSync(file))
  })
  .listen(port, () =>
    console.log(`serving ${distDir} on http://localhost:${port}/ (localePrefix: ${prefixMode})`)
  )
