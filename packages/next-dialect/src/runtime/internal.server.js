// Imported only by the compiler-injected layout wrapper (RSC layer).
// Not public API.
import { createElement } from 'react'
import { __bind, __compiled } from './t.server.js'

export { createElement as el }
export { default as Provider } from './provider.js'

export function bind(locale) {
  return __bind(locale)
}

// Dev only: the catalog crosses to the client for HMR runtime lookup.
// Prod client bundles get their strings inlined and ship no catalog.
export function dev(locale) {
  return process.env.NODE_ENV === 'development' ? __compiled(locale) : undefined
}
