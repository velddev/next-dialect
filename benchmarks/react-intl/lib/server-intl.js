import { cache } from 'react'
import { createIntl, createIntlCache } from '@formatjs/intl'
import en from '../messages/en.json'
import nl from '../messages/nl.json'

// Server-only: these catalogs never reach the client bundle.
const CATALOGS = { en, nl }
export const DEFAULT_LOCALE = 'en'

// Request-scoped locale. React's cache() gives one object per render pass,
// which is how a server component learns the locale without prop drilling
// through the generated component tree.
const store = cache(() => ({ locale: DEFAULT_LOCALE }))

export function setRequestLocale(locale) {
  store().locale = locale
}

export function getRequestLocale() {
  return store().locale
}

// createIntl() parses ICU lazily and memoises inside the shared cache, so one
// IntlShape per locale is enough for the whole build.
const intlCache = createIntlCache()
const shapes = new Map()

export function getIntl(locale = getRequestLocale()) {
  let intl = shapes.get(locale)
  if (!intl) {
    intl = createIntl(
      { locale, defaultLocale: DEFAULT_LOCALE, messages: CATALOGS[locale] },
      intlCache
    )
    shapes.set(locale, intl)
  }
  return intl
}
