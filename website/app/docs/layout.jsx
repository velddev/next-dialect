import SiteFooter from '../SiteFooter'
import SiteHeader from '../SiteHeader'
import DocsNav from './DocsNav'
import DocsPager from './DocsPager'

// No metadata here on purpose: every docs page declares its own through
// pageMeta(), and a title on the layout would only ever apply to a page that
// forgot one — which the root layout already covers.
export default function DocsLayout({ children }) {
  return (
    <div className="mx-auto max-w-[820px] px-6">
      <SiteHeader />
      <main className="pt-24 text-ink/90">
        <DocsNav />
        {children}
        <DocsPager />
      </main>
      <SiteFooter />
    </div>
  )
}
