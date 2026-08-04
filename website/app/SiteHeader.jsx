import InkLink from './InkLink'

// Shared by the landing page and the docs section, so the links are absolute:
// the Get Started anchor has to reach the landing page from /docs/*.
export default function SiteHeader() {
  return (
    <header className="relative top-[13px] flex h-12 items-baseline justify-between pt-3">
      <a className="font-display text-[22px]" href="/">
        Dialect
      </a>
      <nav className="flex gap-6 text-[13px]">
        <InkLink className="opacity-85 hover:opacity-100" href="/#get-started">
          Get Started
        </InkLink>
        <InkLink className="opacity-85 hover:opacity-100" href="/docs">
          Docs
        </InkLink>
        <InkLink
          className="opacity-85 hover:opacity-100"
          href="https://github.com/velddev/next-dialect"
        >
          GitHub
        </InkLink>
      </nav>
    </header>
  )
}
