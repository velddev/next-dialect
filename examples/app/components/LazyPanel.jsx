'use client'
import { t } from 'next-dialect'

// Loaded via next/dynamic — its strings must land in this component's own
// lazy chunk (per locale), never in the main page chunk.
export default function LazyPanel() {
  return (
    <aside
      data-testid="lazy-panel"
      style={{ marginTop: '1rem', padding: '0.75rem', background: '#f4f4f4', borderRadius: 6 }}
    >
      <strong>{t('lazy.title')}</strong>
      <p>{t('lazy.body')}</p>
    </aside>
  )
}
