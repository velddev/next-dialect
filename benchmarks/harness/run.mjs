// Builds, serves and measures every benchmark target.
//
//   node benchmarks/harness/run.mjs [--only dialect,next-intl] [--skip-build]
//
// Transfer sizes come from CDP (Network.loadingFinished.encodedDataLength),
// so they are real over-the-wire bytes and a cache hit correctly counts as 0.
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const targets = JSON.parse(fs.readFileSync(path.join(here, 'targets.json'), 'utf8'))

const argv = process.argv.slice(2)
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null
const skipBuild = argv.includes('--skip-build')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitReady(url, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) })
      await res.text()
      return true
    } catch {
      await sleep(500)
    }
  }
  return false
}

function run(cmd, args, cwd, timeoutMs = 12 * 60 * 1000) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  })
  const timedOut = r.error && r.error.code === 'ETIMEDOUT'
  return {
    ok: r.status === 0 && !timedOut,
    timedOut,
    out: (r.stdout || '') + (r.stderr || '') + (timedOut ? '\n[harness] build exceeded timeout' : ''),
  }
}

/** Resident memory of whatever process owns the port (npm spawns a child). */
function rssForPort(port) {
  if (process.platform !== 'win32') {
    const r = spawnSync(
      'sh',
      ['-c', `ps -o rss= -p $(lsof -ti tcp:${port} | head -1) 2>/dev/null`],
      { encoding: 'utf8' }
    )
    const kbs = parseInt((r.stdout || '').trim(), 10)
    return Number.isFinite(kbs) ? kbs * 1024 : null
  }
  const r = spawnSync(
    'powershell',
    [
      '-Command',
      `$p = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ` +
        'Select-Object -ExpandProperty OwningProcess -Unique | Select-Object -First 1; ' +
        'if ($p) { (Get-Process -Id $p).WorkingSet64 }',
    ],
    { encoding: 'utf8' }
  )
  const bytes = parseInt((r.stdout || '').trim(), 10)
  return Number.isFinite(bytes) ? bytes : null
}

async function timed(url, opts) {
  const t0 = performance.now()
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000), ...opts })
  await res.arrayBuffer()
  return { ms: performance.now() - t0, status: res.status }
}

/**
 * Server-side cost: what the origin has to do per request. next-dialect is
 * the only target that rewrites and compresses chunks on demand, so the
 * cold-vs-warm gap on an asset is where that shows up.
 */
async function measureServer(base, port) {
  const page = await fetch(base + '/en', { signal: AbortSignal.timeout(20_000) })
  const html = await page.text()

  // Prefer a locale-scoped chunk (that is the rewritten one for dialect).
  const m =
    /(?:\/[a-z]{2})?\/_next\/static\/chunks\/[A-Za-z0-9._%\-/]+\.js/.exec(html) || []
  const chunkPath = m[0] || null

  let chunkCold = null
  let chunkWarm = null
  if (chunkPath) {
    chunkCold = (await timed(base + chunkPath, { headers: { 'accept-encoding': 'gzip' } })).ms
    chunkWarm = (await timed(base + chunkPath, { headers: { 'accept-encoding': 'gzip' } })).ms
  }

  const pageWarm = (await timed(base + '/en')).ms
  const pageOther = (await timed(base + '/nl')).ms

  return { chunkPath, chunkCold, chunkWarm, pageWarm, pageOther, rss: rssForPort(port) }
}

async function measure(base) {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Performance.enable')

  let bytes = 0
  const byType = new Map()
  const seen = new Map()
  cdp.on('Network.responseReceived', (e) => seen.set(e.requestId, e.type))
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength
    // CDP resource type: Document is the HTML (which for RSC apps carries the
    // flight payload, i.e. where runtime catalogs actually ride).
    const kind = (seen.get(e.requestId) || 'Other').toLowerCase()
    byType.set(kind, (byType.get(kind) || 0) + e.encodedDataLength)
  })

  const reset = () => {
    bytes = 0
    byType.clear()
  }
  const snapshot = () => ({
    total: bytes,
    js: byType.get('script') || 0,
    doc: (byType.get('document') || 0) + (byType.get('fetch') || 0) + (byType.get('xhr') || 0),
  })

  // 1. cold first visit
  reset()
  await page.goto(base + '/en', { waitUntil: 'networkidle' })
  const first = snapshot()

  // Client-side cost of that load: how much JS actually ran, and how much
  // heap the page holds afterwards (runtime catalogs stay resident).
  await page.waitForTimeout(600)
  const { metrics } = await cdp.send('Performance.getMetrics')
  const metric = (n) => (metrics.find((x) => x.name === n) || {}).value || 0
  const client = {
    scriptMs: metric('ScriptDuration') * 1000,
    taskMs: metric('TaskDuration') * 1000,
    heap: metric('JSHeapUsedSize'),
    nodes: metric('Nodes'),
  }

  // 2. open the lazy panel (warm caches otherwise)
  reset()
  const lazyBtn = page.getByTestId('open-billing')
  let lazy = { total: 0, js: 0, json: 0 }
  if (await lazyBtn.count()) {
    await lazyBtn.first().click()
    await page.waitForTimeout(1200)
    lazy = snapshot()
  }

  // 3. switch locale with warm caches
  reset()
  await page.goto(base + '/nl', { waitUntil: 'networkidle' })
  const localeSwitch = snapshot()

  const text = await page.evaluate(() => document.body.innerText.length)
  await browser.close()
  return { first, lazy, localeSwitch, client, textLen: text }
}

const results = []
for (const t of targets) {
  if (only && !only.includes(t.name)) continue
  const dir = path.join(root, t.dir)
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    results.push({ ...t, skipped: 'not implemented' })
    console.log(`- ${t.name}: skipped (no package.json in benchmarks/${t.dir})`)
    continue
  }

  if (!fs.existsSync(path.join(dir, 'node_modules'))) {
    console.log(`  ${t.name}: installing…`)
    const i = run('npm', ['install', '--no-audit', '--no-fund'], dir)
    if (!i.ok) {
      results.push({ ...t, skipped: 'install failed' })
      console.log(`- ${t.name}: install failed\n${i.out.slice(-600)}`)
      continue
    }
  }

  let buildMs = null
  if (!skipBuild) {
    console.log(`  ${t.name}: building…`)
    const started = Date.now()
    const b = run('npm', ['run', 'build'], dir)
    buildMs = Date.now() - started
    if (!b.ok) {
      const why = b.timedOut ? `build timed out after ${(buildMs / 1000).toFixed(0)}s` : 'build failed'
      results.push({ ...t, skipped: why, buildMs })
      console.log(`- ${t.name}: ${why}\n${b.out.slice(-800)}`)
      continue
    }
  }

  console.log(`  ${t.name}: serving on ${t.port}…`)
  const bootStart = Date.now()
  const server = spawn('npm', ['start'], {
    cwd: dir,
    env: { ...process.env, PORT: String(t.port) },
    stdio: 'ignore',
    shell: true,
    detached: false,
  })
  const base = `http://localhost:${t.port}`
  const up = await waitReady(base + '/en')
  const bootMs = Date.now() - bootStart
  if (!up) {
    server.kill()
    results.push({ ...t, skipped: 'server did not start' })
    console.log(`- ${t.name}: server did not start`)
    continue
  }

  try {
    // Server-side first: the chunk fetch must be cold for the proxy.
    const s = await measureServer(base, t.port)
    const m = await measure(base)
    results.push({ ...t, ...m, server: s, buildMs, bootMs })
    console.log(
      `- ${t.name}: first ${(m.first.total / 1024).toFixed(1)}KB, ` +
        `switch ${(m.localeSwitch.total / 1024).toFixed(1)}KB, ` +
        `script ${m.client.scriptMs.toFixed(0)}ms, ` +
        `chunk ${s.chunkCold == null ? '—' : s.chunkCold.toFixed(0) + '/' + s.chunkWarm.toFixed(0) + 'ms'}, ` +
        `rss ${s.rss == null ? '—' : (s.rss / 1048576).toFixed(0) + 'MB'}`
    )
  } catch (e) {
    results.push({ ...t, skipped: 'measure failed: ' + e.message })
    console.log(`- ${t.name}: measure failed: ${e.message}`)
  } finally {
    server.kill()
    // `npm start` spawns a grandchild that outlives the kill above; free the
    // port directly so the next target can bind (no network round-trip).
    if (process.platform === 'win32') {
      spawnSync(
        'powershell',
        [
          '-Command',
          `Get-NetTCPConnection -State Listen -LocalPort ${t.port} -ErrorAction SilentlyContinue | ` +
            'Select-Object -ExpandProperty OwningProcess -Unique | ' +
            'ForEach-Object { Stop-Process -Id $_ -Force }',
        ],
        { stdio: 'ignore' }
      )
    } else {
      spawnSync('sh', ['-c', `lsof -ti tcp:${t.port} | xargs -r kill -9`], { stdio: 'ignore' })
    }
    await sleep(800)
  }
}

const kb = (n) => (n / 1024).toFixed(1)
const col = (s, w = 11) => String(s).padStart(w)
const baseline = results.find((r) => r.name === 'baseline' && !r.skipped)

console.log('\n' + '='.repeat(92))
console.log(
  'library'.padEnd(15) +
    col('first') +
    col('i18n cost') +
    col('JS') +
    col('doc') +
    col('switch') +
    col('lazy') +
    col('build')
)
console.log('-'.repeat(92))
for (const r of results) {
  if (r.skipped) {
    console.log(r.name.padEnd(15) + col('SKIPPED: ' + r.skipped, 30))
    continue
  }
  const overhead =
    baseline && r.name !== 'baseline' ? kb(r.first.total - baseline.first.total) : '—'
  console.log(
    r.name.padEnd(15) +
      col(kb(r.first.total)) +
      col(overhead) +
      col(kb(r.first.js)) +
      col(kb(r.first.doc)) +
      col(kb(r.localeSwitch.total)) +
      col(kb(r.lazy.total)) +
      col(r.buildMs == null ? '—' : (r.buildMs / 1000).toFixed(0) + 's')
  )
}
console.log('='.repeat(92))
console.log('KB transferred (gzip). first = cold /en. i18n cost = first - baseline.')
console.log('doc = HTML + RSC payload (where runtime catalogs ride). switch = /nl, warm cache.')

if (baseline) {
  console.log('\ni18n overhead as a share of the app:')
  for (const r of results) {
    if (r.skipped || r.name === 'baseline') continue
    const over = r.first.total - baseline.first.total
    console.log(
      `  ${r.name.padEnd(14)} +${kb(over)}KB  (${((over / baseline.first.total) * 100).toFixed(1)}% on top of a no-i18n build)`
    )
  }
}

// ---- runtime cost: server work and browser work ---------------------------
const ms = (v) => (v == null ? '—' : v.toFixed(0))
const mb = (v, dp = 0) => (v == null ? '—' : (v / 1048576).toFixed(dp))

console.log('\n' + '='.repeat(92))
console.log(
  'library'.padEnd(15) +
    col('boot') +
    col('chunk cold') +
    col('chunk warm') +
    col('page') +
    col('server RSS') +
    col('script') +
    col('JS heap')
)
console.log('-'.repeat(92))
for (const r of results) {
  if (r.skipped) continue
  const s = r.server || {}
  console.log(
    r.name.padEnd(15) +
      col(ms(r.bootMs) + 'ms') +
      col(ms(s.chunkCold) + 'ms') +
      col(ms(s.chunkWarm) + 'ms') +
      col(ms(s.pageWarm) + 'ms') +
      col(mb(s.rss) + 'MB') +
      col(ms(r.client?.scriptMs) + 'ms') +
      col(mb(r.client?.heap, 2) + 'MB')
  )
}
console.log('='.repeat(92))
console.log('boot = spawn to first response. chunk cold/warm = same asset, first vs second fetch')
console.log('(next-dialect rewrites + gzips on the cold one). script = JS executed on first load.')

fs.writeFileSync(
  path.join(here, 'results.json'),
  JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2)
)
console.log('\nwrote benchmarks/harness/results.json')
