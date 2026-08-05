// next-dialect/proxy: the Next Proxy handler that replaces `next-dialect
// start` for server deployments. Driven against the real SSR build, so what
// is asserted here is the actual emitted chunks, not a fixture.
//
// Requires the SSR build to exist (npm run build:ssr); `npm test` does that.
//
// The custom-server equivalents of these assertions live in run.mjs, against
// live HTTP. This layer is deliberately in-process: it is the only way to
// exercise the handler without a Next 16 runtime, and it keeps the branchy
// negotiation logic honest without booting anything.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

register(new URL('./next-server-hook.mjs', import.meta.url))

const { NextRequest } = await import('next/server')
const { createDialectProxy } = await import('next-dialect/proxy')
const { TOKEN_RE } = (await import('node:module')).createRequire(import.meta.url)(
  '../../../packages/next-dialect/src/compiler/tokens.cjs'
)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticDir = path.join(root, '.next', 'static')
const settings = {
  locales: ['en', 'nl'],
  defaultLocale: 'en',
  messages: path.join(root, 'messages'),
  staticDir,
}

const req = (url, { cookie, acceptLanguage, gzip } = {}) => {
  const headers = new Headers()
  if (cookie) headers.set('cookie', cookie)
  if (acceptLanguage) headers.set('accept-language', acceptLanguage)
  if (gzip) headers.set('accept-encoding', 'gzip, deflate, br')
  return new NextRequest(new URL(url, 'http://localhost:3000'), { headers })
}

const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push([name, null])
    console.log('  ok  ' + name)
  } catch (e) {
    results.push([name, e])
    console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0])
  }
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    e.isDirectory() ? walk(p, out) : out.push(p)
  }
  return out
}

const hasKey = (file, key) => {
  const content = fs.readFileSync(file, 'utf8')
  TOKEN_RE.lastIndex = 0
  return [...content.matchAll(TOKEN_RE)].some((m) => m[1] === key)
}

const jsFiles = walk(staticDir).filter((f) => f.endsWith('.js'))
// home.greeting rather than home.title: title is rendered by a server
// component, so it is never inlined into a client chunk in the SSR flow.
const localized = jsFiles.find((f) => hasKey(f, 'home.greeting'))
const shared = jsFiles.find((f) => {
  TOKEN_RE.lastIndex = 0
  return !TOKEN_RE.test(fs.readFileSync(f, 'utf8'))
})
assert.ok(localized, 'no client chunk carries home.greeting — is the SSR build present?')
assert.ok(shared, 'no message-free chunk found')

const rel = (f) => path.relative(staticDir, f).split(path.sep).join('/')
const proxy = createDialectProxy(settings)
const asset = (file, opts) => proxy(req('/_next/static/' + rel(file), opts))

console.log('next-dialect/proxy')

// ---- localized chunks ------------------------------------------------------
const en = await asset(localized, { cookie: 'DIALECT_LOCALE=en' })
const nl = await asset(localized, { cookie: 'DIALECT_LOCALE=nl' })
const bare = await asset(localized)
const [enBody, nlBody, bareBody] = [await en.text(), await nl.text(), await bare.text()]

await test('a message-bearing chunk is served by the proxy', () =>
  assert.ok(en instanceof Response))
await test('the cookie selects the locale', () => {
  assert.ok(enBody.includes('Hello, {name}!'))
  assert.ok(nlBody.includes('Hallo, {name}!'))
  assert.notEqual(enBody, nlBody)
})
await test('a key missing from nl carries the en string, resolved at build time', () =>
  assert.ok(nlBody.includes('Pending')))
await test('no sentinel token survives substitution', () => {
  TOKEN_RE.lastIndex = 0
  assert.ok(!TOKEN_RE.test(nlBody))
})
await test('no cookie falls back to the default locale', () => assert.equal(bareBody, enBody))
await test('a message-free chunk is passed through to Next', async () =>
  assert.equal(await asset(shared, { cookie: 'DIALECT_LOCALE=nl' }), undefined))
await test('localized chunks vary on Cookie, since the URL has no locale', () =>
  assert.match(nl.headers.get('vary'), /Cookie/i))
await test('localized chunks are immutable for their (locale, url) pair', () =>
  assert.match(nl.headers.get('cache-control'), /immutable/))
await test('content-type follows the extension', () =>
  assert.match(nl.headers.get('content-type'), /javascript/))

const gz = await asset(localized, { cookie: 'DIALECT_LOCALE=nl', gzip: true })
await test('gzip is negotiated and smaller than the raw body', () => {
  assert.equal(gz.headers.get('content-encoding'), 'gzip')
  assert.ok(Number(gz.headers.get('content-length')) < Buffer.byteLength(nlBody))
})

// ---- negotiation, localePrefix: always -------------------------------------
const rootReq = await proxy(req('/'))
await test('/ redirects to the negotiated locale and remembers it', () => {
  assert.equal(rootReq.status, 307)
  assert.match(rootReq.headers.get('location'), /\/en$/)
  assert.match(rootReq.headers.get('set-cookie'), /DIALECT_LOCALE=en/)
})
await test('Accept-Language is honoured', async () => {
  const r = await proxy(req('/', { acceptLanguage: 'nl-NL,nl;q=0.9,en;q=0.8' }))
  assert.match(r.headers.get('location'), /\/nl$/)
})
await test('a sticky cookie beats Accept-Language', async () => {
  const r = await proxy(req('/', { cookie: 'DIALECT_LOCALE=nl', acceptLanguage: 'en-US,en' }))
  assert.match(r.headers.get('location'), /\/nl$/)
})
await test('the query string survives the redirect', async () => {
  const r = await proxy(req('/?q=1'))
  assert.match(r.headers.get('location'), /q=1/)
})
await test('a prefixed URL resets the cookie, so its chunks match the page', async () => {
  const r = await proxy(req('/nl/dynamic', { cookie: 'DIALECT_LOCALE=en' }))
  assert.match(r.headers.get('set-cookie'), /DIALECT_LOCALE=nl/)
})

// ---- negotiation, localePrefix: as-needed ----------------------------------
const asNeeded = createDialectProxy({ ...settings, localePrefix: 'as-needed' })
await test('as-needed: the default locale is rewritten, not redirected', async () => {
  const r = await asNeeded(req('/'))
  assert.equal(r.status, 200)
  assert.match(r.headers.get('x-middleware-rewrite'), /\/en$/)
})
await test('as-needed: the prefixed default locale redirects to the canonical URL', async () => {
  const r = await asNeeded(req('/en/dynamic'))
  assert.equal(r.status, 308)
  assert.match(r.headers.get('location'), /\/dynamic$/)
})
await test('as-needed: a non-default locale keeps its prefix', async () => {
  const r = await asNeeded(req('/nl/dynamic'))
  assert.equal(r.headers.get('location'), null)
})

const failed = results.filter(([, e]) => e)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
