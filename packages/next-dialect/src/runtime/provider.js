'use client'
// Internal context provider, injected by the compiler around the [locale]
// layout. Carries the locale (a tiny string) into the client tree; in dev
// it also carries the precompiled catalog for HMR-friendly runtime lookup.
import { createElement } from 'react'
import { __Ctx, __setClientState } from './t.client.js'

export default function DialectProvider({ locale, messages, children }) {
  if (typeof window !== 'undefined') __setClientState(locale, messages)
  return createElement(__Ctx.Provider, { value: { locale, messages: messages || null } }, children)
}
