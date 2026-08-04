import { Prata, Lato } from 'next/font/google'
import './globals.css'
import { CARD, SITE_NAME, SITE_URL } from './seo'

const prata = Prata({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-prata',
})

const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-lato',
})

// Site-wide defaults. Each page declares its own title, canonical and og block
// via pageMeta(); what is left here is what does not vary, plus a usable
// fallback for any page that forgets.
export const metadata = {
  // Without this, the relative image and canonical paths every page hands to
  // Next stay relative — and a relative og:image is ignored by every scraper.
  metadataBase: new URL(SITE_URL),
  title: `${SITE_NAME} | zero-overhead i18n for Next.js`,
  description:
    'A single function to localize your entire app. Strings compile to constants at build time — no catalog, no lookups, no runtime.',
  // The file sits in public/, so it needs declaring — only app/icon.png would
  // be picked up by convention.
  icons: { icon: '/icon.png' },
  openGraph: { siteName: SITE_NAME, locale: 'en_US', images: [CARD] },
  twitter: { card: 'summary_large_image', images: [CARD.url] },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${prata.variable} ${lato.variable}`}>
      {/* The ruling image lives in globals.css so it can swap per colour scheme. */}
      <body className="min-h-full bg-paper font-sans text-ink">
        {children}
      </body>
    </html>
  )
}
