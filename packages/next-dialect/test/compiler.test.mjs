// Unit tests for the pieces that are hard to exercise through a full Next
// build: escaping, token substitution, catalog fallback, and ICU semantics.
//
//   node --test packages/next-dialect/test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require_ = createRequire(import.meta.url)
const tokens = require_('../src/compiler/tokens.cjs')
const catalogs = require_('../src/compiler/catalog.cjs')
const icu = require_('../src/compiler/icu.cjs')
const { __icu, __fmt } = await import('../src/runtime/format.js')

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const en = catalogs.loadResolved(FIXTURES, 'en', 'en')
const nl = catalogs.loadResolved(FIXTURES, 'nl', 'en')
const TOK = tokens.TOK

// --- catalog ---------------------------------------------------------------

test('catalog: fallbacks resolve at load time', () => {
  assert.equal(nl.plain, 'Hallo wereld')
  // Missing from nl.json -> the default locale's text is baked in.
  assert.equal(nl.onlyInEn, 'English only')
  assert.deepEqual(catalogs.missingKeys(FIXTURES, 'nl', 'en'), ['onlyInEn'])
  assert.deepEqual(catalogs.missingKeys(FIXTURES, 'en', 'en'), [])
})

// --- escaping --------------------------------------------------------------

test('jsEscape output is safe in all three JS string contexts', () => {
  const escaped = tokens.jsEscape(en.hostile)
  for (const wrap of ['"', "'", '`']) {
    const src = `(${wrap}${escaped}${wrap})`
    assert.equal(eval(src), en.hostile, `broken inside ${wrap} quotes`)
  }
})

test('jsEscape neutralises a closing script tag', () => {
  const escaped = tokens.jsEscape(en.script)
  assert.ok(!escaped.includes('</script'), 'raw </script would terminate an inline script')
  assert.equal(eval(`"${escaped}"`), en.script)
})

// --- token substitution ----------------------------------------------------

test('replaceTokens: substitutes text, locale, and reports unknown keys', () => {
  const source = `a=${TOK('plain')};b=${TOK('@locale')}`
  const { out, count, errors } = tokens.replaceTokens(source, { catalog: nl, locale: 'nl' })
  assert.equal(out, 'a=Hallo wereld;b=nl')
  assert.equal(count, 2)
  assert.deepEqual(errors, [])

  const bad = tokens.replaceTokens(TOK('nope'), { catalog: nl, locale: 'nl' })
  assert.equal(bad.errors.length, 1)
  assert.match(bad.errors[0], /unknown message key "nope"/)
  assert.ok(tokens.hasTokens(bad.out), 'unknown tokens must survive so the leak check fires')
})

test('replaceTokens: matches the escaped spellings a minifier emits', () => {
  for (const delim of ['\\u0001', '\\x01']) {
    const source = `x="${delim}plain${delim}"`
    const { out, count } = tokens.replaceTokens(source, { catalog: en, locale: 'en' })
    assert.equal(count, 1, `did not match ${delim} spelling`)
    assert.equal(out, 'x="Hello world"')
  }
})

test('replaceTokens: ICU messages are inlined as precompiled ASTs', () => {
  const { out } = tokens.replaceTokens(`m=${TOK('plural')}`, { catalog: en, locale: 'en' })
  const json = /m=(.*)$/.exec(out)[1]
  const ast = JSON.parse(json.replace(/\\(.)/g, '$1'))
  assert.ok(Array.isArray(ast))
  assert.equal(ast[0].type, 6, 'expected a plural node')

  // A text-only context (HTML) must refuse an AST rather than emit JSON there.
  const html = tokens.replaceTokens(`${TOK('plural')}`, {
    catalog: en,
    locale: 'en',
    escape: tokens.htmlEscape,
    allowIcu: false,
  })
  assert.equal(html.errors.length, 1)
  assert.match(html.errors[0], /text-only context/)
})

test('substituted output round-trips through the escaping it was given', () => {
  const { out } = tokens.replaceTokens(`x="${TOK('hostile')}"`, { catalog: en, locale: 'en' })
  assert.equal(eval(out.slice(2)), en.hostile)
})

// --- ICU analysis and evaluation -------------------------------------------

test('analyze classifies messages into the cheapest runtime', () => {
  assert.equal(icu.analyze(en.plain).kind, 'static')
  assert.equal(icu.analyze(en.params).kind, 'params')
  assert.equal(icu.analyze(en.plural).kind, 'icu')
  assert.equal(icu.analyze(en.select).kind, 'icu')
  assert.equal(icu.analyze(en.rich).kind, 'icu', 'tags need the AST evaluator')
})

const compile = (msg) => JSON.stringify(icu.analyze(msg).ast)

test('plural: exact matches use the raw value, rules and # use the offset', () => {
  const ast = compile(en.plural)
  assert.equal(__icu(ast, { count: 0, host: 'Ada' }, 'en'), 'none')
  assert.equal(__icu(ast, { count: 1, host: 'Ada' }, 'en'), 'only Ada')
  // offset:1 -> count 2 selects 'one'
  assert.equal(__icu(ast, { count: 2, host: 'Ada' }, 'en'), 'Ada and one guest')
  // # renders count - offset
  assert.equal(__icu(ast, { count: 5, host: 'Ada' }, 'en'), 'Ada and 4 guests')
})

test('plural follows the locale, not the default', () => {
  assert.equal(__icu(compile(nl.plural), { count: 2, host: 'Ada' }, 'nl'), 'Ada en één gast')
  assert.equal(__icu(compile(nl.plural), { count: 5, host: 'Ada' }, 'nl'), 'Ada en 4 gasten')
})

test('select falls back to other', () => {
  const ast = compile(en.select)
  assert.equal(__icu(ast, { tier: 'pro' }, 'en'), 'Pro plan')
  assert.equal(__icu(ast, { tier: 'nonsense' }, 'en'), 'Free plan')
})

test('selectordinal uses ordinal plural rules', () => {
  const ast = compile(en.ordinal)
  assert.equal(__icu(ast, { place: 1 }, 'en'), '1st')
  assert.equal(__icu(ast, { place: 2 }, 'en'), '2nd')
  assert.equal(__icu(ast, { place: 3 }, 'en'), '3rd')
  assert.equal(__icu(ast, { place: 11 }, 'en'), '11th')
})

test('__icu accepts a raw pattern too (the dev/runtime path)', () => {
  assert.equal(__icu('Hello, {name}!', { name: 'Ada' }, 'en'), 'Hello, Ada!')
  assert.equal(__fmt('Hello, {name}!', { name: 'Ada' }), 'Hello, Ada!')
  assert.equal(__fmt('no params here', null), 'no params here')
})

// --- the hole this suite exists to catch -----------------------------------

test('catalog content containing the sentinel is rejected, not silently mangled', () => {
  const poisoned = { evil: 'before' + tokens.TOKEN_CHAR + 'plain' + tokens.TOKEN_CHAR + 'after' }
  assert.throws(
    () => catalogs.assertNoSentinel(poisoned, 'xx'),
    /sentinel/i,
    'message text containing U+0001 must fail the build'
  )
  assert.doesNotThrow(() => catalogs.assertNoSentinel({ ok: 'clean text' }, 'xx'))
})
