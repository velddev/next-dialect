'use client'
import { usePathname } from 'next/navigation'
import InkLink from '../InkLink'
import { DOC_PAGES } from './pages'

// Previous / next, derived from the same ordered list as the nav strip.
export default function DocsPager() {
  const here = usePathname().replace(/\/$/, '') || '/docs'
  const i = DOC_PAGES.findIndex((p) => p.href === here)
  if (i === -1) return null
  const prev = DOC_PAGES[i - 1]
  const next = DOC_PAGES[i + 1]
  return (
    <nav className="relative top-[6px] mt-18 flex justify-between gap-6 text-[15px] leading-6">
      {prev ? (
        <InkLink className="text-muted hover:text-ink" href={prev.href}>
          ← {prev.label}
        </InkLink>
      ) : (
        <span />
      )}
      {next ? (
        <InkLink className="text-muted hover:text-ink" href={next.href}>
          {next.label} →
        </InkLink>
      ) : (
        <span />
      )}
    </nav>
  )
}
