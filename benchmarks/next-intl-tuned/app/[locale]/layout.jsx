import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { locales } from '../../i18n/routing.js'
import { CLIENT_NAMESPACES } from '../../../shared/keys.mjs'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}
export const dynamicParams = false

// The disciplined next-intl configuration: instead of letting the provider
// inherit the whole catalog, ship only the namespaces client components
// actually use. This is the documented "provide only relevant messages"
// pattern, and it is what a competent team would run in production.
function pick(messages, names) {
  const out = {}
  for (const name of names) if (messages[name] !== undefined) out[name] = messages[name]
  return out
}

export default async function RootLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={pick(messages, CLIENT_NAMESPACES)}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
