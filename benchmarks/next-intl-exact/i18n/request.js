import { getRequestConfig } from 'next-intl/server'
import { locales, defaultLocale } from './routing.js'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = locales.includes(requested) ? requested : defaultLocale

  return {
    locale,
    // The shared benchmark catalog, loaded per locale at request time.
    messages: (await import(`../../shared/messages/${locale}.json`)).default,
  }
})
