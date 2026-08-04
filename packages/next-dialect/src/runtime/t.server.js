// Server-components implementation of t (react-server export condition).
// The locale is bound per request by the compiler-injected segment wrapper;
// catalogs are read from disk and precompiled (ICU -> AST) once.
import { cache } from 'react'
import path from 'node:path'
import catalogs_ from '../compiler/catalog.cjs'
import icu from '../compiler/icu.cjs'
import { __fmt, __icu } from './format.js'
import { __icuRich } from './rich.js'

const store = cache(() => ({ locale: null }))
const catalogs = new Map()

function messagesDir() {
  return process.env.DIALECT_MESSAGES || path.join(process.cwd(), 'messages')
}
function defaultLocale() {
  return process.env.DIALECT_DEFAULT || 'en'
}
function knownLocales() {
  return (process.env.DIALECT_LOCALES || '').split(',').filter(Boolean)
}

export function __compiled(locale) {
  if (!catalogs.has(locale)) {
    const raw = catalogs_.loadResolved(messagesDir(), locale, defaultLocale())
    const out = {}
    for (const [key, msg] of Object.entries(raw)) {
      const { kind, ast } = icu.analyze(msg)
      out[key] = kind === 'icu' ? ast : msg
    }
    catalogs.set(locale, out)
  }
  return catalogs.get(locale)
}

export function __bind(locale) {
  const known = knownLocales()
  if (!locale || (known.length && !known.includes(locale))) {
    throw new Error(
      `[next-dialect] Unknown locale "${locale}" from the [${
        process.env.DIALECT_PARAM || 'locale'
      }] segment.`
    )
  }
  store().locale = locale
  // Registry for SSR of client components (separate module graph).
  const reg = (globalThis.__DIALECT_MSGS__ = globalThis.__DIALECT_MSGS__ || {})
  reg[locale] = __compiled(locale)
  return locale
}

function currentLocale() {
  const locale = store().locale
  if (!locale) {
    throw new Error(
      '[next-dialect] t used before a locale was bound — is this route under the [locale] segment?'
    )
  }
  return locale
}

export function t(key, params) {
  const locale = currentLocale()
  const entry = __compiled(locale)[key]
  if (entry == null) return key
  return Array.isArray(entry) ? __icu(entry, params, locale) : __fmt(entry, params)
}

t.rich = (key, params) => {
  const locale = currentLocale()
  const entry = __compiled(locale)[key]
  if (entry == null) return key
  return __icuRich(entry, params, locale)
}

t.dynamic = (key, params) => t(key, params)

Object.defineProperty(t, 'locale', { get: currentLocale })
