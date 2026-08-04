// Browser + SSR-of-client-components implementation of t.
//
// In production browsers every t(...) call site is compiled away, so the
// lookup path below runs only in dev (catalog via provider) and during SSR
// (locale via context, catalog via the server-populated registry). In the
// browser the locale is invariant per document, so t needs no hooks and works
// in event handlers and plain functions.
import { createContext, useContext } from 'react'
import { __fmt, __icu } from './format.js'
import { __icuRich } from './rich.js'

export const __Ctx = createContext({ locale: '', messages: null })

let clientState = null
export function __setClientState(locale, messages) {
  clientState = { locale, messages: messages || null }
}

function env() {
  if (typeof window === 'undefined') {
    // SSR render: per-request locale from the injected provider.
    const ctx = useContext(__Ctx)
    if (!ctx.locale) {
      throw new Error('[next-dialect] t used outside a locale-bound tree.')
    }
    const reg = globalThis.__DIALECT_MSGS__
    return { locale: ctx.locale, messages: ctx.messages || (reg && reg[ctx.locale]) || null }
  }
  if (clientState) return clientState
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : ''
  return { locale: lang, messages: null }
}

export function t(key, params) {
  const { locale, messages } = env()
  const entry = messages ? messages[key] : undefined
  if (entry == null) return key
  return Array.isArray(entry) ? __icu(entry, params, locale) : __fmt(entry, params)
}

// Same message, evaluated into React children so tag callbacks can wrap them.
t.rich = (key, params) => {
  const { locale, messages } = env()
  const entry = messages ? messages[key] : undefined
  if (entry == null) return key
  return __icuRich(entry, params, locale)
}

// Escape hatch for unbounded keys. At runtime it is just t(); the difference
// is at build time, where the compiler inlines the bounded catalog.
t.dynamic = (key, params) => t(key, params)

Object.defineProperty(t, 'locale', { get: () => env().locale })
