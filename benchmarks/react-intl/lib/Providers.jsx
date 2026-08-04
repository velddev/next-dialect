'use client'
import { IntlProvider } from 'react-intl'

export default function Providers({ locale, messages, children }) {
  return (
    <IntlProvider locale={locale} defaultLocale="en" messages={messages}>
      {children}
    </IntlProvider>
  )
}
