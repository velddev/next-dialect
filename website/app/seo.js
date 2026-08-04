// Per-page metadata, in one place.
//
// Next does not merge `openGraph` between a layout and a page — a page that
// declares it replaces the parent's outright — so every page that wants a
// correct og:title and og:url has to spell the whole block out. This helper is
// that block, so the pages only carry what actually differs.

export const SITE_URL = 'https://next-dialect.com'
export const SITE_NAME = 'Dialect'

// public/seo-image.png, 1006x552 — near enough the 1.91:1 that X, LinkedIn,
// Slack and iMessage crop their previews to. Width and height are declared so
// a scraper can reserve the space before it has fetched the file.
export const CARD = {
  url: '/seo-image.png',
  width: 1006,
  height: 552,
  alt: 'Dialect | localize your Next.js page with zero bloat',
}

/**
 * @param {object} o
 * @param {string} o.title        Full <title>, used verbatim for og:title too.
 * @param {string} o.description  One sentence; also the og and card description.
 * @param {string} o.path         Absolute path, for the canonical and og:url.
 * @param {'website'|'article'} [o.type]
 */
export function pageMeta({ title, description, path, type = 'article' }) {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      url: path,
      siteName: SITE_NAME,
      locale: 'en_US',
      title,
      description,
      images: [CARD],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [CARD.url],
    },
  }
}
