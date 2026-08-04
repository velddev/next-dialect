import Providers from '../../lib/Providers'
import { getMessages } from '../../lib/messages'
import { setRequestLocale } from '../../lib/server-intl'

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'nl' }]
}
export const dynamicParams = false

export default async function RootLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const messages = await getMessages(locale)
  return (
    <html lang={locale}>
      <body>
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
