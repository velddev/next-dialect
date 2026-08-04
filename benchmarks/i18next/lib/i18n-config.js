export const locales = ['en', 'nl']
export const defaultLocale = 'en'

/** Shared init options so the server and client instances behave identically. */
export function initOptions(locale, resources) {
  return {
    lng: locale,
    supportedLngs: locales,
    fallbackLng: false,
    // The catalog is a single default namespace of nested keys ("nav.k000").
    ns: ['translation'],
    defaultNS: 'translation',
    resources: { [locale]: { translation: resources } },
    initImmediate: false,
    interpolation: { escapeValue: false },
  }
}
