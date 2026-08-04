// Converts the shared ICU catalog (../shared/messages/*.flat.json) into the
// inlang message-format v4 storage format that Paraglide compiles.
//
// Two mechanical transforms happen here:
//   1. key mapping   "nav.k000" -> "nav_k000"  (Paraglide bundle ids are JS
//      identifiers, so dots are not allowed)
//   2. ICU -> MessageFormat 2 variants.  Paraglide does not parse ICU strings;
//      plural/select messages have to be expressed as `match` variants with a
//      `plural` selector (Intl.PluralRules) resp. a literal selector.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sharedDir = path.join(here, '..', 'shared', 'messages')
const outDir = path.join(here, 'messages')
const projectDir = path.join(here, 'project.inlang')

export const LOCALES = ['en', 'nl']
export const BASE_LOCALE = 'en'

/** "nav.k000" -> "nav_k000" */
export const safeKey = (key) => key.replace(/\./g, '_')

// The catalog only ever uses these two ICU shapes (verified against the
// generator); anything else must fail loudly rather than be silently dropped.
const PLURAL = /^\{count, plural, =0 \{([^{}]*)\} one \{([^#{}]*(?:#[^#{}]*)*)\} other \{([^#{}]*(?:#[^#{}]*)*)\}\}$/
const SELECT = /^\{state, select, active \{([^{}]*)\} paused \{([^{}]*)\} other \{([^{}]*)\}\}$/

/** ICU `#` inside a plural branch means "the count" -> MF2 `{count}`. */
const hash = (s) => s.replace(/#/g, '{count}')

function convert(key, icu) {
  const plural = PLURAL.exec(icu)
  if (plural) {
    const [, zero, one, other] = plural
    return [
      {
        declarations: ['input count', 'local countPlural = count: plural'],
        selectors: ['count', 'countPlural'],
        // Order matters: Paraglide emits the variants as sequential `if`
        // returns, so the exact-value branch has to come first.
        match: {
          'count=0,countPlural=*': hash(zero),
          'count=*,countPlural=one': hash(one),
          'count=*,countPlural=*': hash(other),
        },
      },
    ]
  }
  const select = SELECT.exec(icu)
  if (select) {
    const [, active, paused, other] = select
    return [
      {
        declarations: ['input state'],
        selectors: ['state'],
        match: {
          'state=active': active,
          'state=paused': paused,
          'state=*': other,
        },
      },
    ]
  }
  if (/[{}]/.test(icu.replace(/\{name\}/g, ''))) {
    throw new Error(`unhandled ICU construct in ${key}: ${icu}`)
  }
  // static text or plain {name} interpolation: identical syntax in MF2
  return icu
}

fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(projectDir, { recursive: true })

let plurals = 0
let selects = 0
let params = 0

for (const locale of LOCALES) {
  const flat = JSON.parse(
    fs.readFileSync(path.join(sharedDir, `${locale}.flat.json`), 'utf8')
  )
  const out = { $schema: 'https://inlang.com/schema/inlang-message-format' }
  for (const [key, icu] of Object.entries(flat)) {
    const value = convert(key, icu)
    if (locale === BASE_LOCALE) {
      if (Array.isArray(value)) (value[0].selectors[0] === 'state' ? selects++ : plurals++)
      else if (/\{name\}/.test(value)) params++
    }
    out[safeKey(key)] = value
  }
  fs.writeFileSync(path.join(outDir, `${locale}.json`), JSON.stringify(out, null, 2))
}

fs.writeFileSync(
  path.join(projectDir, 'settings.json'),
  JSON.stringify(
    {
      $schema: 'https://inlang.com/schema/project-settings',
      baseLocale: BASE_LOCALE,
      locales: LOCALES,
      modules: [
        'https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.4.0/dist/index.js',
      ],
      'plugin.inlang.messageFormat': {
        pathPattern: './messages/{locale}.json',
      },
    },
    null,
    2
  ) + '\n'
)

console.log(
  `bench-paraglide: catalog converted (${plurals} plural, ${selects} select, ${params} {name})`
)
