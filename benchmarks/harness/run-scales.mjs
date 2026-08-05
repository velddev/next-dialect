// Runs the whole suite at several catalog scales and prints how each
// library's i18n cost grows.
//
//   node benchmarks/harness/run-scales.mjs [--scales 1,10,100]
//                                          [--only baseline,next-dialect]
//                                          [--out <dir>]
//
// The page always renders the same ~200 messages; only the catalog grows. So
// this isolates the question the whole design rests on: does your i18n bill
// scale with the size of your catalog, or with how much of it you use?
//
// `--only` narrows the target list — CI uses `baseline,next-dialect`, because
// a regression in this repo cannot move the competitors. `--out` redirects the
// per-scale JSON somewhere other than this directory, so a CI run does not
// overwrite the committed numbers the README quotes.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(here, '..', '..')
const argv = process.argv.slice(2)
const flag = (name, fallback) =>
  argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback
const scales = flag('--scales', '1,10,100').split(',').map(Number)
const only = flag('--only', null)
const outDir = path.resolve(repo, flag('--out', here))
fs.mkdirSync(outDir, { recursive: true })

for (const scale of scales) {
  console.log(`\n${'#'.repeat(70)}\n# catalog scale ${scale}x\n${'#'.repeat(70)}`)

  const gen = spawnSync(
    process.execPath,
    [path.join(repo, 'benchmarks', 'shared', 'gen-messages.mjs'), '--scale', String(scale)],
    { stdio: 'inherit', cwd: repo }
  )
  if (gen.status) {
    console.error('message generation failed at scale ' + scale)
    process.exit(1)
  }

  const r = spawnSync(
    process.execPath,
    [path.join(here, 'run.mjs'), ...(only ? ['--only', only] : [])],
    { stdio: 'inherit', cwd: repo }
  )
  if (r.status) console.error(`(scale ${scale}x finished with a non-zero status; partial results)`)

  const src = path.join(here, 'results.json')
  if (fs.existsSync(src)) {
    const dest = path.join(outDir, `results-${scale}x.json`)
    const data = JSON.parse(fs.readFileSync(src, 'utf8'))
    data.scale = scale
    data.catalog = JSON.parse(
      fs.readFileSync(path.join(repo, 'benchmarks', 'shared', 'messages', 'scale.json'), 'utf8')
    )
    fs.writeFileSync(dest, JSON.stringify(data, null, 2))
  }
}

// ---- cross-scale summary ---------------------------------------------------
const runs = scales
  .map((s) => {
    const f = path.join(outDir, `results-${s}x.json`)
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null
  })
  .filter(Boolean)

if (!runs.length) {
  console.log('\nno results to summarise')
  process.exit(0)
}

const kb = (n) => (n / 1024).toFixed(1)
const names = [...new Set(runs.flatMap((r) => r.results.map((x) => x.name)))]

console.log('\n\n' + '='.repeat(84))
console.log('FIRST VISIT (KB transferred, cold cache, /en)')
console.log('-'.repeat(84))
console.log(
  'library'.padEnd(16) + runs.map((r) => `${r.scale}x (${r.catalog.total} msg)`.padStart(20)).join('')
)
for (const name of names) {
  const cells = runs.map((r) => {
    const row = r.results.find((x) => x.name === name)
    if (!row) return '—'.padStart(20)
    if (row.skipped) return row.skipped.slice(0, 18).padStart(20)
    return (kb(row.first.total) + 'KB').padStart(20)
  })
  console.log(name.padEnd(16) + cells.join(''))
}

console.log('\n' + '='.repeat(84))
console.log('i18n COST (first visit minus the no-i18n baseline)')
console.log('-'.repeat(84))
console.log(
  'library'.padEnd(16) + runs.map((r) => `${r.scale}x`.padStart(20)).join('')
)
for (const name of names) {
  if (name === 'baseline') continue
  const cells = runs.map((r) => {
    const base = r.results.find((x) => x.name === 'baseline')
    const row = r.results.find((x) => x.name === name)
    if (!row || !base || row.skipped || base.skipped) {
      return (row && row.skipped ? row.skipped.slice(0, 18) : '—').padStart(20)
    }
    return ('+' + kb(row.first.total - base.first.total) + 'KB').padStart(20)
  })
  console.log(name.padEnd(16) + cells.join(''))
}

console.log('\n' + '='.repeat(84))
console.log('BUILD TIME')
console.log('-'.repeat(84))
console.log('library'.padEnd(16) + runs.map((r) => `${r.scale}x`.padStart(20)).join(''))
for (const name of names) {
  const cells = runs.map((r) => {
    const row = r.results.find((x) => x.name === name)
    if (!row || row.buildMs == null) return (row && row.skipped ? 'timeout/fail' : '—').padStart(20)
    return ((row.buildMs / 1000).toFixed(0) + 's').padStart(20)
  })
  console.log(name.padEnd(16) + cells.join(''))
}
console.log('='.repeat(84))
