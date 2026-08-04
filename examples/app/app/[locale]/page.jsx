import { t } from 'next-dialect'
import Demo from '../../components/Demo'

export default function Page() {
  const other = t.locale === 'en' ? 'nl' : 'en'
  return (
    <main>
      <h1>{t('home.title')}</h1>
      <p>{t('home.subtitle')}</p>
      <Demo />
      <p>
        {/* Plain <a>, not <Link>: locale switches cross static trees. */}
        <a href={`/${other}`}>{t('nav.switch')}</a>
        {process.env.DIALECT_SSR === '1' && (
          <>
            {' '}
            <a href={`/${t.locale}/dynamic`}>{t('nav.dynamic')}</a>
          </>
        )}
      </p>
    </main>
  )
}
