import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { locales } from '../../i18n/routing.js'
import { CLIENT_KEYS } from '../../../shared/keys.mjs'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}
export const dynamicParams = false

// A runtime library's theoretical floor: ship the exact keys this page
// renders and nothing else. No real team maintains this by hand — it exists
// to answer "is compile-time inlining better than perfect discipline?"
function pickKeys(messages, dotKeys) {
  const out = {}
  for (const dotted of dotKeys) {
    const parts = dotted.split('.')
    let src = messages
    let dst = out
    for (let i = 0; i < parts.length - 1; i++) {
      src = src?.[parts[i]]
      dst = dst[parts[i]] ??= {}
    }
    const leaf = parts[parts.length - 1]
    if (src?.[leaf] !== undefined) dst[leaf] = src[leaf]
  }
  return out
}

export default async function RootLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={pickKeys(messages, CLIENT_KEYS)}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
