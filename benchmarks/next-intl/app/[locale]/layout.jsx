import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { locales } from '../../i18n/routing.js'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}
export const dynamicParams = false

export default async function RootLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
