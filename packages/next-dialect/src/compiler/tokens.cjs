// Sentinel tokens and the locale-substitution pass.
//
// The compiler emits `<key>` in place of message text. Whatever
// consumes the build later — the on-disk fork (postbuild) or the request-time
// bundle proxy — replaces those tokens with one locale's content using
// replaceTokens() below, so there is exactly one implementation of the
// substitution rules.
const { analyze } = require('./icu.cjs')

const TOKEN_CHAR = '\u0001'
const TOK = (key) => TOKEN_CHAR + key + TOKEN_CHAR
const LOCALE_KEY = '@locale'
const LOCALE_TOK = TOK(LOCALE_KEY)

// Minifiers re-emit the sentinel as an escape sequence, so match the raw
// control character and both textual spellings.
const TOKEN_RE = /(?:\\u0001|\\x01|\u0001)([@A-Za-z0-9_.$-]+)(?:\\u0001|\\x01|\u0001)/g

function jsEscape(s) {
  // Valid inside double-quoted, single-quoted, and template literals alike.
  return JSON.stringify(s)
    .slice(1, -1)
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/</g, '\\u003c')
}

function htmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function hasTokens(content) {
  TOKEN_RE.lastIndex = 0
  return TOKEN_RE.test(content)
}

// Replaces every token with `catalog`'s content for `locale`. ICU messages
// are emitted as precompiled AST JSON (consumed by __icu/__icuRich);
// everything else is emitted as the message text.
function replaceTokens(content, { catalog, locale, escape = jsEscape, allowIcu = true }) {
  const errors = []
  let count = 0
  const out = content.replace(TOKEN_RE, (match, key) => {
    if (key === LOCALE_KEY) {
      count++
      return escape(locale)
    }
    const msg = catalog[key]
    if (msg === undefined) {
      errors.push(`unknown message key "${key}"`)
      return match
    }
    const { kind, ast } = analyze(msg)
    if (kind === 'icu' && !allowIcu) {
      errors.push(`ICU token "${key}" in a text-only context`)
      return match
    }
    count++
    return escape(kind === 'icu' ? JSON.stringify(ast) : msg)
  })
  return { out, count, errors }
}

module.exports = {
  TOKEN_CHAR,
  TOKEN_RE,
  TOK,
  LOCALE_KEY,
  LOCALE_TOK,
  jsEscape,
  htmlEscape,
  hasTokens,
  replaceTokens,
}
