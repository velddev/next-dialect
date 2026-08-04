import { cache } from 'react'

// React's cache() gives us a per-request (per-prerender) store, so concurrent
// renders of /en and /nl cannot see each other's locale. The route segment
// seeds it in app/[locale]/page.jsx before PageBody renders.
const store = cache(() => ({ locale: 'en' }))

export function setRequestLocale(locale) {
  store().locale = locale
}

export function currentLocale() {
  return store().locale
}
