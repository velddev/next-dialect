// Permutation test suite for next-static-intl. Requires both builds to
// exist (npm run build && npm run build:ssr); `npm test` does that.
// Covers: per-locale constant inlining, per-bundle isolation (incl. lazy
// chunks), compile-time fallback, no-catalog guarantee, token leaks,
// SSR per-request rendering, ISR revalidation, and locale redirects
// (Accept-Language + sticky cookie) on both servers.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLI = path.join(root, '..', '..', 'node_modules', 'next-dialect', 'bin', 'next-dialect.mjs')
const STATIC_PORT = 4510
const SSR_PORT = 4620
const STATIC_AN_PORT = 4530
const SSR_AN_PORT = 4640
const STATIC = `http://localhost:${STATIC_PORT}`
const SSR = `http://localhost:${SSR_PORT}`
const STATIC_AN = `http://localhost:${STATIC_AN_PORT}`
const SSR_AN = `http://localhost:${SSR_AN_PORT}`
const TOKEN_LEAK = /|\\u0001|\\x01/

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, opts = {}) {
  const res = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    ...opts,
  })
  return { status: res.status, headers: res.headers, body: await res.text() }
}

async function waitReady(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) })
      await res.text() // must drain: an unread body wedges the keep-alive socket
      return
    } catch {
      await sleep(500)
    }
  }
  throw new Error('server did not become ready: ' + url)
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    e.isDirectory() ? walk(p, out) : out.push(p)
  }
  return out
}

function findChunk(dir, needle) {
  const hits = walk(dir).filter(
    (f) => f.endsWith('.js') && fs.readFileSync(f, 'utf8').includes(needle)
  )
  assert.ok(hits.length > 0, `no chunk in ${dir} contains "${needle}"`)
  return hits
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

// ---- start servers -------------------------------------------------------
const servers = [
  spawn(process.execPath, ['scripts/serve.mjs', 'dist'], {
    cwd: root,
    env: { ...process.env, PORT: String(STATIC_PORT) },
    stdio: 'ignore',
  }),
  spawn(process.execPath, [CLI, 'start'], {
    cwd: root,
    env: { ...process.env, PORT: String(SSR_PORT), DIALECT_SSR: '1' },
    stdio: 'ignore',
  }),
  spawn(process.execPath, ['scripts/serve.mjs', 'dist'], {
    cwd: root,
    env: { ...process.env, PORT: String(STATIC_AN_PORT), DIALECT_PREFIX: 'as-needed' },
    stdio: 'ignore',
  }),
  spawn(process.execPath, [CLI, 'start'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(SSR_AN_PORT),
      DIALECT_SSR: '1',
      DIALECT_PREFIX_OVERRIDE: 'as-needed',
    },
    stdio: 'ignore',
  }),
]
await waitReady(STATIC + '/en/')
await waitReady(SSR + '/en/')
await waitReady(STATIC_AN + '/nl/')
await waitReady(SSR_AN + '/nl/')

// ---- artifact-level: per-bundle constants --------------------------------
console.log('\nartifacts (static dist/)')

await test('page chunk is a per-locale variant with inlined constants', () => {
  const [en] = findChunk(path.join(root, 'dist/en/_next'), 'Cycle status')
  const nl = en.replace(path.sep + 'en' + path.sep, path.sep + 'nl' + path.sep)
  const enSrc = fs.readFileSync(en, 'utf8')
  const nlSrc = fs.readFileSync(nl, 'utf8')
  assert.ok(nlSrc.includes('Wissel status'), 'nl variant lacks Dutch strings')
  assert.ok(!enSrc.includes('Wissel status') && !nlSrc.includes('Cycle status'), 'locales bled across variants')
})

await test('compile-time fallback: nl variant carries default-locale string', () => {
  const [nl] = findChunk(path.join(root, 'dist/nl/_next'), 'Wissel status')
  assert.ok(fs.readFileSync(nl, 'utf8').includes('Pending'), 'missing baked-in en fallback for status.pending')
})

await test('lazy chunk isolation: lazy strings only in the lazy chunk', () => {
  const [lazyEn] = findChunk(path.join(root, 'dist/en/_next'), 'Lazily loaded')
  const [pageEn] = findChunk(path.join(root, 'dist/en/_next'), 'Cycle status')
  assert.notEqual(lazyEn, pageEn, 'lazy strings landed in the main page chunk')
  assert.ok(!fs.readFileSync(pageEn, 'utf8').includes('Lazily loaded'))
  const lazyNl = lazyEn.replace(path.sep + 'en' + path.sep, path.sep + 'nl' + path.sep)
  assert.ok(fs.readFileSync(lazyNl, 'utf8').includes('Lazy geladen'), 'nl lazy variant not localized')
})

await test('complex ICU messages inline as ASTs in the using chunk', () => {
  const [en] = findChunk(path.join(root, 'dist/en/_next'), 'Nobody is coming')
  const src = fs.readFileSync(en, 'utf8')
  assert.ok(src.includes('st place'), 'ordinal branches missing')
  assert.ok(src.includes('guests'), 'offset plural branches missing')
  const nl = en.replace(path.sep + 'en' + path.sep, path.sep + 'nl' + path.sep)
  const nlSrc = fs.readFileSync(nl, 'utf8')
  assert.ok(nlSrc.includes('Er komt niemand'), 'nl offset plural missing')
  assert.ok(nlSrc.includes('don'), 'hostile-chars fallback string missing from nl variant')
})

await test('t.dynamic inlines only its bounded namespace, not the catalog', () => {
  const [en] = findChunk(path.join(root, 'dist/en/_next'), 'The request timed out.')
  const src = fs.readFileSync(en, 'utf8')
  // errors.* is present (the declared bound) ...
  assert.ok(src.includes('You do not have access to that.'), 'bounded namespace missing')
  // ... while unrelated namespaces are not dragged in by t.dynamic.
  assert.ok(!src.includes('Revalidated every 5 seconds'), 't.dynamic pulled in unrelated keys')
})

await test('rich messages inline as ASTs with their tag nodes', () => {
  const [en] = findChunk(path.join(root, 'dist/en/_next'), 'privacy notice')
  const src = fs.readFileSync(en, 'utf8')
  assert.ok(/"type":8/.test(src) || src.includes('link'), 'no tag node in the inlined rich AST')
  const nl = en.replace(path.sep + 'en' + path.sep, path.sep + 'nl' + path.sep)
  assert.ok(fs.readFileSync(nl, 'utf8').includes('privacyverklaring'), 'nl rich variant missing')
})

await test('no global catalog: server-only strings absent from all client JS', () => {
  for (const locale of ['en', 'nl']) {
    for (const f of walk(path.join(root, `dist/${locale}/_next`))) {
      if (!f.endsWith('.js')) continue
      const src = fs.readFileSync(f, 'utf8')
      assert.ok(!src.includes('compiled to constants') && !src.includes('naar constanten'),
        `server-only string leaked into ${f}`)
    }
  }
})

await test('no token leaks anywhere in dist', () => {
  for (const f of walk(path.join(root, 'dist'))) {
    if (!/\.(js|html|txt|css)$/.test(f)) continue
    assert.ok(!TOKEN_LEAK.test(fs.readFileSync(f, 'utf8')), `token survived in ${f}`)
  }
})

// ---- static server -------------------------------------------------------
console.log('\nstatic server (dist/ via serve.mjs)')

await test('pages render locale strings', async () => {
  const en = await get(STATIC + '/en/')
  const nl = await get(STATIC + '/nl/')
  assert.ok(en.body.includes('Ship every locale'))
  assert.ok(nl.body.includes('Lever elke taal'))
  assert.ok(!TOKEN_LEAK.test(en.body) && !TOKEN_LEAK.test(nl.body))
})

await test('redirect: Accept-Language negotiation', async () => {
  const nl = await get(STATIC + '/', { headers: { 'accept-language': 'nl-BE,nl;q=0.9' } })
  assert.equal(nl.headers.get('location'), '/nl/')
  const def = await get(STATIC + '/')
  assert.equal(def.headers.get('location'), '/en/')
})

await test('redirect: sticky locale cookie wins', async () => {
  const page = await get(STATIC + '/nl/')
  assert.match(page.headers.get('set-cookie') || '', /DIALECT_LOCALE=nl/)
  const back = await get(STATIC + '/', {
    headers: { cookie: 'DIALECT_LOCALE=nl', 'accept-language': 'en' },
  })
  assert.equal(back.headers.get('location'), '/nl/')
})

// ---- localePrefix: 'as-needed' -------------------------------------------
console.log("\nlocalePrefix 'as-needed' (static + ssr)")

await test('as-needed: default locale serves at canonical un-prefixed URLs', async () => {
  const staticRoot = await get(STATIC_AN + '/')
  assert.equal(staticRoot.status, 200)
  assert.ok(staticRoot.body.includes('Ship every locale'))
  const ssrRoot = await get(SSR_AN + '/')
  assert.equal(ssrRoot.status, 200)
  assert.ok(ssrRoot.body.includes('Ship every locale'))
})

await test('as-needed: prefixed default-locale URLs canonicalize away', async () => {
  const s = await get(STATIC_AN + '/en/')
  assert.equal(s.status, 308)
  assert.equal(s.headers.get('location'), '/')
  const d = await get(SSR_AN + '/en/dynamic')
  assert.equal(d.status, 308)
  assert.equal(d.headers.get('location'), '/dynamic')
})

await test('as-needed: non-default locales stay prefixed; negotiation still redirects', async () => {
  const nl = await get(STATIC_AN + '/nl/')
  assert.equal(nl.status, 200)
  assert.ok(nl.body.includes('Lever elke taal'))
  const negotiated = await get(SSR_AN + '/', { headers: { 'accept-language': 'nl' } })
  assert.equal(negotiated.headers.get('location'), '/nl/')
  const unprefixedDynamic = await get(SSR_AN + '/dynamic')
  assert.equal(unprefixedDynamic.status, 200)
  assert.ok(unprefixedDynamic.body.includes('Rendered per request'))
})

// ---- SSR server ----------------------------------------------------------
console.log('\nssr server (server.js)')

await test('force-dynamic page renders per request', async () => {
  const a = await get(SSR + '/nl/dynamic')
  await sleep(1100)
  const b = await get(SSR + '/nl/dynamic')
  const stamp = (r) => /gerenderd om ([0-9T:.Z-]+)/.exec(r.body)?.[1]
  assert.ok(stamp(a), 'no dutch render timestamp found')
  assert.notEqual(stamp(a), stamp(b), 'timestamps identical — page is not dynamic')
  assert.ok(!TOKEN_LEAK.test(a.body))
})

await test('asset URLs: localized chunks prefixed, shared chunks left shared', async () => {
  const { body } = await get(SSR + '/nl/dynamic')
  // The chunk carrying strings is locale-scoped ...
  assert.match(body, /\/nl\/_next\/static\/chunks\//)
  // ... while framework chunks keep a single URL (one cache entry for all
  // locales). That asymmetry is the point of the proxy.
  assert.match(body, /"\/_next\/static\/chunks\/main-app/)
  assert.ok(!TOKEN_LEAK.test(body), 'token leaked into HTML')
})

await test('proxy: only string-bearing chunks get locale-specific URLs', async () => {
  const { body } = await get(SSR + '/nl')
  const prefixed = [...body.matchAll(/\/nl\/_next\/static\/chunks\/[^"]+/g)].map((m) => m[0])
  const shared = [...body.matchAll(/"\/_next\/static\/chunks\/[^"]+/g)].map((m) => m[0])
  assert.ok(prefixed.length > 0, 'no localized chunk was locale-prefixed')
  assert.ok(shared.length > 0, 'framework chunks should keep one shared URL')
  // The big vendor/framework chunks must not be duplicated per locale.
  assert.ok(shared.some((u) => /chunks\/main-app|chunks\/\d+-/.test(u)))
})

await test('proxy: rewrites the same chunk per locale on demand', async () => {
  const { body } = await get(SSR + '/nl')
  // Exclude backslashes: the same URLs appear escaped inside the RSC payload.
  const rel = /\/nl(\/_next\/static\/chunks\/[^"\\]+)/.exec(body)[1]
  const nl = await get(SSR + '/nl' + rel)
  const en = await get(SSR + '/en' + rel)
  assert.equal(nl.status, 200)
  assert.ok(nl.body.includes('Wissel status'), 'nl chunk not localized')
  assert.ok(en.body.includes('Cycle status'), 'en chunk not localized')
  assert.ok(!nl.body.includes('Cycle status'), 'locales bled across proxy responses')
  assert.match(nl.headers.get('cache-control') || '', /immutable/)
})

await test('proxy: un-prefixed localized chunk resolves via cookie (lazy chunks)', async () => {
  const { body } = await get(SSR + '/nl')
  // Exclude backslashes: the same URLs appear escaped inside the RSC payload.
  const rel = /\/nl(\/_next\/static\/chunks\/[^"\\]+)/.exec(body)[1]
  const viaCookie = await get(SSR + rel, { headers: { cookie: 'DIALECT_LOCALE=nl' } })
  assert.equal(viaCookie.status, 200)
  assert.ok(viaCookie.body.includes('Wissel status'))
  assert.match(viaCookie.headers.get('vary') || '', /Cookie/)
  // A shared chunk is passed through to Next, not the proxy.
  const shared = /"(\/_next\/static\/chunks\/main-app[^"]+)/.exec(body)[1]
  const sharedRes = await get(SSR + shared)
  assert.equal(sharedRes.status, 200)
  // Shared chunks must not vary by locale (Accept-Encoding is Next's own).
  assert.ok(!/cookie/i.test(sharedRes.headers.get('vary') || ''))
})

await test('rich text and dynamic keys render server-side', async () => {
  const nl = await get(SSR + '/nl')
  assert.match(nl.body, /Lees de <a href="\/terms">voorwaarden<\/a> en de <em>/)
  assert.match(nl.body, /data-testid="dynamic">Het verzoek duurde te lang\./)
  const en = await get(SSR + '/en')
  assert.match(en.body, /Read the <a href="\/terms">terms<\/a> and <em>privacy notice<\/em>/)
})

await test('ISR: revalidate=5 caches then regenerates', async () => {
  const stamp = async () => /at ([0-9T:.Z-]+)</.exec((await get(SSR + '/en/revalidate')).body)?.[1]

  // Two requests inside one 5s window must return the same render. A loaded
  // runner can put them either side of the window instead, which is the cache
  // expiring on schedule rather than failing — so only assert equality when the
  // pair demonstrably fits inside a window, and try again when it does not.
  // Asserting on wall-clock luck is what made this flaky in CI.
  const WINDOW_MS = 5000
  let baseline = null
  for (let attempt = 0; attempt < 5 && baseline === null; attempt++) {
    const started = Date.now()
    const t1 = await stamp()
    assert.ok(t1, 'no ISR timestamp found')
    const t2 = await stamp()
    const elapsed = Date.now() - started
    if (t1 === t2) baseline = t2
    else {
      assert.ok(
        elapsed >= WINDOW_MS,
        `ISR page not cached within the window (two requests ${elapsed}ms apart returned different renders)`
      )
    }
  }
  assert.ok(baseline, 'never got two requests inside one revalidate window')

  await sleep(WINDOW_MS + 1000)
  await stamp() // first hit after expiry serves stale, triggers regeneration
  let changed = false
  for (let i = 0; i < 20 && !changed; i++) {
    await sleep(500)
    changed = (await stamp()) !== baseline
  }
  assert.ok(changed, 'ISR page never regenerated')
})

await test('redirect: negotiation + path preserved + sticky cookie', async () => {
  const nl = await get(SSR + '/dynamic', { headers: { 'accept-language': 'nl' } })
  assert.equal(nl.headers.get('location'), '/nl/dynamic')
  const page = await get(SSR + '/nl/dynamic')
  assert.match(page.headers.get('set-cookie') || '', /DIALECT_LOCALE=nl/)
  const back = await get(SSR + '/', {
    headers: { cookie: 'DIALECT_LOCALE=nl', 'accept-language': 'en' },
  })
  assert.equal(back.headers.get('location'), '/nl/')
})

// ---- report --------------------------------------------------------------
for (const s of servers) s.kill()
const failed = results.filter(([, e]) => e)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  for (const [name, e] of failed) console.error(`\nFAIL ${name}\n${e.stack}`)
  process.exit(1)
}
