export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'nl' }]
}
export const dynamicParams = false

// No i18n wiring: the next-dialect compiler binds the locale and mounts
// its provider around this layout automatically.
export default async function RootLayout({ children, params }) {
  const { locale } = await params
  return (
    <html lang={locale}>
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: '3rem auto', maxWidth: 640 }}>
        {children}
      </body>
    </html>
  )
}
