export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'nl' }]
}
export const dynamicParams = false

export default async function RootLayout({ children, params }) {
  const { locale } = await params
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
