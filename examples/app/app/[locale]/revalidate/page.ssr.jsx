import { t } from 'next-dialect'

// ISR: statically generated, revalidated every 5 seconds. Exists only in
// the SSR flow (*.ssr.jsx via pageExtensions).
export const revalidate = 5

export default function RevalidatePage() {
  return (
    <main>
      <h1>{t('revalidate.title')}</h1>
      <p data-testid="generated-at">{t('revalidate.generatedAt', { time: new Date().toISOString() })}</p>
      <p>
        <a href={`/${t.locale}`}>{t('dynamic.back')}</a>
      </p>
    </main>
  )
}
