import I18nProvider from '../../lib/I18nProvider'
import { getMessages, setServerLocale } from '../../lib/i18n-server'
import { locales } from '../../lib/i18n-config'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}
export const dynamicParams = false

export default async function RootLayout({ children, params }) {
  const { locale } = await params
  // Runs before React renders `children`, so server components below can read it.
  setServerLocale(locale)

  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} resources={getMessages(locale)}>
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}
