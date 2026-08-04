'use client'
import { usePathname } from 'next/navigation'
import InkLink from '../InkLink'
import { DOC_PAGES } from './pages'

// The section index, as a single ruled row rather than a sidebar: five pages
// do not earn a second column, and a rail would cut across the ruling that
// the rest of the page is built on. The current page keeps its stroke drawn.
export default function DocsNav() {
  const here = usePathname().replace(/\/$/, '') || '/docs'
  return (
    <nav className="relative top-[6px] mb-12 flex flex-wrap gap-x-6 text-[15px] leading-6">
      {DOC_PAGES.map(({ href, label }) => {
        const current = here === href
        return (
          <InkLink
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={current ? 'text-ink' : 'text-muted hover:text-ink'}
          >
            {label}
          </InkLink>
        )
      })}
    </nav>
  )
}
