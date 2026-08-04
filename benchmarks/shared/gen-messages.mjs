// Generates the shared benchmark catalog.
//
//   node benchmarks/shared/gen-messages.mjs [--scale 1|10|100]
//
// Scale multiplies the CATALOG only. The page always renders the same keys
// (k000–k059 per section, see layout.mjs), so usage density falls as scale
// rises — which is the whole point: runtime libraries ship the catalog, a
// compiler ships only what is referenced.
//
// Every message is a pure function of its key, so k000–k059 are byte-identical
// at every scale and the three runs stay comparable.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'messages')
const argv = process.argv.slice(2)
const SCALE = argv.includes('--scale') ? Number(argv[argv.indexOf('--scale') + 1]) : 1

function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// FNV-1a: the seed depends only on the key, never on iteration order.
function rngFor(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return mulberry32(h >>> 0)
}

const EN_WORDS =
  'dashboard project member invoice report setting billing usage export archive workspace team channel message draft template webhook token limit region backup preview release audit metric alert schedule policy license contract renewal'.split(
    ' '
  )
const NL_WORDS =
  'dashboard project lid factuur rapport instelling facturering verbruik export archief werkruimte team kanaal bericht concept sjabloon webhook token limiet regio back-up voorbeeld release audit meetwaarde melding planning beleid licentie contract verlenging'.split(
    ' '
  )

// The namespaces the benchmark page actually renders. These exist at every
// scale and always hold the same 60 keys, so the rendered page is identical.
const USED_SECTIONS = [
  'nav',
  'headings',
  'body',
  'popover',
  'table',
  'form',
  'empty',
  'toast',
  'settings',
  'billing',
]
const PER_SECTION = 60

// Scale grows the number of NAMESPACES, not the keys inside them — real
// products grow by adding feature areas, and any one page touches a few of
// them. Growing keys-per-namespace instead would quietly make namespace
// splitting useless and flatter compile-time approaches for the wrong reason.
const SECTIONS = [
  ...USED_SECTIONS,
  ...Array.from(
    { length: USED_SECTIONS.length * (SCALE - 1) },
    (_, i) => 'feature' + String(i).padStart(4, '0')
  ),
]

function sentence(words, n, r) {
  const out = []
  for (let i = 0; i < n; i++) out.push(words[Math.floor(r() * words.length)])
  const s = out.join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function messagesFor(key) {
  const shape = rngFor(key) // decides structure; shared by both locales
  const len = 3 + Math.floor(shape() * 9)
  const roll = shape()
  const en = rngFor(key + ':en')
  const nl = rngFor(key + ':nl')

  if (roll < 1 / 12) {
    return {
      en: `{count, plural, =0 {No ${sentence(EN_WORDS, 2, en).toLowerCase()}} one {# ${sentence(EN_WORDS, 2, en).toLowerCase()}} other {# ${sentence(EN_WORDS, 3, en).toLowerCase()}}}`,
      nl: `{count, plural, =0 {Geen ${sentence(NL_WORDS, 2, nl).toLowerCase()}} one {# ${sentence(NL_WORDS, 2, nl).toLowerCase()}} other {# ${sentence(NL_WORDS, 3, nl).toLowerCase()}}}`,
    }
  }
  if (roll < 2 / 12) {
    return {
      en: `{state, select, active {${sentence(EN_WORDS, len, en)} is active} paused {${sentence(EN_WORDS, len, en)} is paused} other {${sentence(EN_WORDS, len, en)} is unknown}}`,
      nl: `{state, select, active {${sentence(NL_WORDS, len, nl)} is actief} paused {${sentence(NL_WORDS, len, nl)} is gepauzeerd} other {${sentence(NL_WORDS, len, nl)} is onbekend}}`,
    }
  }
  if (roll < 5 / 12) {
    return {
      en: `${sentence(EN_WORDS, len, en)} for {name}`,
      nl: `${sentence(NL_WORDS, len, nl)} voor {name}`,
    }
  }
  return { en: sentence(EN_WORDS, len, en), nl: sentence(NL_WORDS, len, nl) }
}

const en = {}
const nl = {}
for (const section of SECTIONS) {
  en[section] = {}
  nl[section] = {}
  for (let i = 0; i < PER_SECTION; i++) {
    const short = 'k' + String(i).padStart(3, '0')
    const m = messagesFor(`${section}.${short}`)
    en[section][short] = m.en
    nl[section][short] = m.nl
  }
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? prefix + '.' + k : k
    if (v && typeof v === 'object') flatten(v, full, out)
    else out[full] = v
  }
  return out
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'en.json'), JSON.stringify(en, null, 2))
fs.writeFileSync(path.join(OUT, 'nl.json'), JSON.stringify(nl, null, 2))
fs.writeFileSync(path.join(OUT, 'en.flat.json'), JSON.stringify(flatten(en), null, 2))
fs.writeFileSync(path.join(OUT, 'nl.flat.json'), JSON.stringify(flatten(nl), null, 2))
fs.writeFileSync(
  path.join(OUT, 'scale.json'),
  JSON.stringify({
    scale: SCALE,
    namespaces: SECTIONS.length,
    perNamespace: PER_SECTION,
    total: SECTIONS.length * PER_SECTION,
  })
)

const size = fs.statSync(path.join(OUT, 'en.json')).size
console.log(
  `scale ${SCALE}x: ${SECTIONS.length} namespaces x ${PER_SECTION} keys = ` +
    `${SECTIONS.length * PER_SECTION} messages x 2 locales, en.json ${(size / 1024).toFixed(0)}KB`
)
