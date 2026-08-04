'use client'
import { useState } from 'react'
import { createInstance } from 'i18next'
import ICU from 'i18next-icu'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { initOptions } from './i18n-config'

/**
 * Idiomatic App Router wiring: the server passes the locale's catalog down and
 * the client creates its own i18next instance from it. No hand-tuning of which
 * messages cross the boundary — this is i18next's default behaviour.
 */
export default function I18nProvider({ locale, resources, children }) {
  const [i18n] = useState(() => {
    const inst = createInstance()
    inst
      .use(ICU)
      .use(initReactI18next)
      .init({ ...initOptions(locale, resources), react: { useSuspense: false } })
    return inst
  })

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
