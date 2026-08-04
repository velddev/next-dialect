// Catalog loading: flatten nested JSON to dot-keys and resolve locale
// fallbacks at build time (missing keys are baked in from the default
// locale, so no fallback logic ever runs at runtime).
const fs = require('node:fs')
const path = require('node:path')

function flatten(obj, prefix, out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? prefix + '.' + k : k
    if (v && typeof v === 'object') flatten(v, full, out)
    else out[full] = String(v)
  }
  return out
}

function loadLocale(messagesDir, locale) {
  const file = path.join(messagesDir, locale + '.json')
  return flatten(JSON.parse(fs.readFileSync(file, 'utf8')), '')
}

// The compiler marks messages with U+0001. If message text itself contains
// that character — or the spellings a minifier emits for it — substitution
// would match translator content and corrupt the bundle. Fail the build
// instead of silently producing garbage.
const SENTINEL_FORMS = ['', '\\u0001', '\\x01']

function assertNoSentinel(catalog, locale) {
  for (const [key, value] of Object.entries(catalog)) {
    const text = String(value)
    for (const form of SENTINEL_FORMS) {
      if (text.includes(form)) {
        throw new Error(
          `[next-dialect] ${locale}: message "${key}" contains the compiler sentinel ` +
            `(${JSON.stringify(form)}). Remove it — that character is reserved for marking ` +
            `message positions during compilation.`
        )
      }
    }
  }
  return catalog
}

function loadResolved(messagesDir, locale, defaultLocale) {
  const base = loadLocale(messagesDir, defaultLocale)
  if (locale === defaultLocale) return assertNoSentinel(base, locale)
  return assertNoSentinel({ ...base, ...loadLocale(messagesDir, locale) }, locale)
}

// Keys that fell back to the default locale — surfaced as a build report so
// build-time fallback resolution does not mean silent invisibility.
function missingKeys(messagesDir, locale, defaultLocale) {
  if (locale === defaultLocale) return []
  const base = loadLocale(messagesDir, defaultLocale)
  const own = loadLocale(messagesDir, locale)
  return Object.keys(base).filter((k) => own[k] === undefined)
}

function listLocales(messagesDir) {
  return fs
    .readdirSync(messagesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
}

module.exports = {
  flatten,
  loadLocale,
  loadResolved,
  assertNoSentinel,
  missingKeys,
  listLocales,
}
