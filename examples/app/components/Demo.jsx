'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { t } from 'next-dialect'

const LazyPanel = dynamic(() => import('./LazyPanel'), { ssr: false })
const STATUSES = ['active', 'pending', 'closed']
const TIERS = ['free', 'pro', 'team']
const ERROR_CODES = ['timeout', 'denied', 'unknown']
const SALE_ENDS = 1780272000000 // fixed date so output is deterministic

export default function Demo() {
  const [name, setName] = useState('Ada')
  const [i, setI] = useState(0)
  const [showLazy, setShowLazy] = useState(false)
  const [count, setCount] = useState(0)
  const [tier, setTier] = useState(0)
  const [err, setErr] = useState(0)
  // A key computed at runtime — the case t() rejects on purpose.
  const errorKey = 'errors.' + ERROR_CODES[err % ERROR_CODES.length]
  const status = STATUSES[i % STATUSES.length]
  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: '1rem' }}>
      {/* literal key + interpolation */}
      <p data-testid="greeting">{t('home.greeting', { name })}</p>
      <input aria-label="name" value={name} onChange={(e) => setName(e.target.value)} />
      {/* template-literal dynamic keys — the one bounded-dynamism mechanism */}
      <p data-testid="status-template">{t(`status.${status}`)}</p>
      <p data-testid="status-dynamic">{t(`status.${STATUSES[i % STATUSES.length]}`)}</p>
      <button onClick={() => setI(i + 1)}>{t('home.cta')}</button>{' '}
      <button onClick={() => setShowLazy(true)}>{t('lazy.toggle')}</button>
      {showLazy && <LazyPanel />}
      <hr />
      {/* ICU: plural with =0 exact match and # */}
      <p data-testid="cart">{t('cart.items', { count })}</p>
      <button data-testid="cart-add" onClick={() => setCount(count + 1)}>
        +1
      </button>{' '}
      <button data-testid="cart-clear" onClick={() => setCount(0)}>
        0
      </button>
      {/* ICU: number percent + date medium */}
      <p data-testid="discount">{t('cart.discount', { pct: 0.25, until: SALE_ENDS })}</p>
      {/* ICU: select */}
      <p data-testid="plan">{t('plan.current', { tier: TIERS[tier % TIERS.length] })}</p>
      <button data-testid="plan-next" onClick={() => setTier(tier + 1)}>
        →
      </button>
      <hr />
      {/* complex ICU: multi-var, offset plural, nested args + #, ordinal, hostile chars */}
      <p data-testid="multi">{t('complex.meet', { a: 'Ann', b: 'Ben', c: 'Chi', place: 'Delft' })}</p>
      <p data-testid="party">{t('complex.party', { host: 'Ada', count })}</p>
      <p data-testid="ordinal">{t('complex.place', { place: count })}</p>
      <p data-testid="inbox">{t('complex.inbox', { name: 'Ada', count, sender: 'Bob' })}</p>
      <p data-testid="escapes">{t('complex.escapes')}</p>
      <hr />
      {/* rich text: ICU tags call back into components */}
      <p data-testid="rich">
        {t.rich('legal.terms', {
          name,
          link: (c) => <a href="/terms">{c}</a>,
          em: (c) => <em>{c}</em>,
        })}
      </p>
      {/* unbounded key: the explicit escape hatch, bounded to errors.* */}
      <p data-testid="dynamic">{t.dynamic(errorKey, undefined, 'errors.')}</p>
      <button data-testid="error-next" onClick={() => setErr(err + 1)}>
        next error
      </button>
    </section>
  )
}
