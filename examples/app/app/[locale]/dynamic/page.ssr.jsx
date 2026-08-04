import { headers } from 'next/headers'
import { t } from 'next-dialect'
import Demo from '../../../components/Demo'

// Rendered per request — proves the SSR flow: server strings come from
// runtime JSON lookups, client chunks are pre-generated locale variants.
export const dynamic = 'force-dynamic'

export default async function DynamicPage() {
  const h = await headers()
  const other = t.locale === 'en' ? 'nl' : 'en'
  return (
    <main>
      <h1>{t('dynamic.title')}</h1>
      <p>{t('dynamic.renderedAt', { time: new Date().toISOString() })}</p>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        UA: {h.get('user-agent')?.slice(0, 60)}
      </p>
      <Demo />
      <p>
        <a href={`/${t.locale}`}>{t('dynamic.back')}</a>{' '}
        <a href={`/${other}/dynamic`}>{t('nav.switch')}</a>
      </p>
    </main>
  )
}
