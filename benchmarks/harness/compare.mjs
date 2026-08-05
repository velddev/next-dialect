// Compares two benchmark runs and reports what a visitor's download changed by.
//
//   node benchmarks/harness/compare.mjs --base <dir> --head <dir>
//                                       [--scales 1,10,100]
//                                       [--target next-dialect]
//                                       [--threshold 512]
//                                       [--markdown out.md]
//
// Exits non-zero if any measured size grew by more than `--threshold` bytes at
// any scale, so it can gate a pull request.
//
// Only transfer sizes are gated. They come from CDP encodedDataLength and are
// deterministic for a given build, so a change in them is a real change. The
// timings in the same results file are not: build and script times swing by
// tens of percent on a shared CI runner, and gating on them would produce
// failures that mean nothing. They are printed as context and never fail.
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const flag = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback)

const baseDir = flag('--base', null)
const headDir = flag('--head', null)
const scales = flag('--scales', '1,10,100').split(',').map(Number)
const target = flag('--target', 'next-dialect')
const threshold = Number(flag('--threshold', 512))
const markdownOut = flag('--markdown', null)

if (!baseDir || !headDir) {
  console.error('usage: compare.mjs --base <dir> --head <dir>')
  process.exit(2)
}

const load = (dir, scale) => {
  const f = path.join(dir, `results-${scale}x.json`)
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null
}

// The number that matters is not what the app weighs, it is what i18n added to
// it — so every size is taken relative to the no-i18n baseline in the same run.
// That also cancels out anything a Next upgrade did to both sides.
function costs(run) {
  if (!run) return null
  const base = run.results.find((r) => r.name === 'baseline')
  const row = run.results.find((r) => r.name === target)
  if (!base || !row || base.skipped || row.skipped) return null
  return {
    firstVisit: row.first.total - base.first.total,
    firstVisitJs: row.first.js - base.first.js,
    lazyChunk: row.lazy.total,
    localeSwitch: row.localeSwitch.total,
    scriptMs: row.client?.scriptMs ?? null,
    buildMs: row.buildMs ?? null,
    catalog: run.catalog?.total ?? null,
  }
}

const METRICS = [
  ['firstVisit', 'First visit', true],
  ['firstVisitJs', 'First visit (JS only)', true],
  ['lazyChunk', 'Lazy chunk', true],
  ['localeSwitch', 'Locale switch', true],
]

const kb = (n) => (n / 1024).toFixed(1) + ' KB'
const delta = (n) => (n === 0 ? '—' : (n > 0 ? '+' : '−') + kb(Math.abs(n)))

const lines = []
const say = (s = '') => {
  lines.push(s)
  console.log(s)
}

let regressed = false
let missing = false

say(`### Benchmark: \`${target}\` vs the no-i18n baseline`)
say()

for (const scale of scales) {
  const base = costs(load(baseDir, scale))
  const head = costs(load(headDir, scale))
  if (!base || !head) {
    missing = true
    say(`**${scale}x** — no comparable result (a target was skipped or failed to build).`)
    say()
    continue
  }

  say(`**${scale}x catalog** (${head.catalog ?? '?'} messages)`)
  say()
  say('| metric | base | this PR | change |')
  say('| --- | --- | --- | --- |')
  for (const [key, label] of METRICS) {
    const d = head[key] - base[key]
    if (d > threshold) regressed = true
    const mark = d > threshold ? ' ⚠️' : ''
    say(`| ${label} | ${kb(base[key])} | ${kb(head[key])} | ${delta(d)}${mark} |`)
  }
  // Informational only — see the header comment on why these never fail.
  const ms = (n) => (n == null ? '—' : n.toFixed(0) + ' ms')
  say(`| _script eval_ | _${ms(base.scriptMs)}_ | _${ms(head.scriptMs)}_ | _not gated_ |`)
  say(`| _build_ | _${ms(base.buildMs)}_ | _${ms(head.buildMs)}_ | _not gated_ |`)
  say()
}

say(
  regressed
    ? `❌ A transfer size grew by more than ${threshold} bytes. If that is intended, say so in the PR.`
    : `✅ No transfer size grew by more than ${threshold} bytes.`
)

if (markdownOut) {
  fs.writeFileSync(markdownOut, lines.join('\n') + '\n')
}

// A missing result is a failed build or a skipped target, which is a problem
// worth failing on even though it is not a regression.
process.exit(regressed || missing ? 1 : 0)
