import InkLink from './InkLink'

export default function SiteFooter() {
  return (
    /* The divider is drawn, not laid out: a bordered box would have to sit
       6px off the ruling to keep the text baseline on it. Out of flow, the
       hairline lands on a rule two rows above the text and the footer stays
       a clean 96px. */
    <footer className="relative top-[7px] mt-24 flex items-baseline justify-between pt-6 pb-12 text-[13px] leading-6 text-muted before:absolute before:inset-x-0 before:-top-[8px] before:h-px before:bg-ink/10">
      <p>© {new Date().getFullYear()} Veld Labs LLC. MIT licensed.</p>
      <nav className="flex gap-6">
        <InkLink className="hover:text-ink" href="/#get-started">
          Get Started
        </InkLink>
        <InkLink className="hover:text-ink" href="/docs">
          Docs
        </InkLink>
        <InkLink className="hover:text-ink" href="https://github.com/velddev/next-dialect">
          GitHub
        </InkLink>
      </nav>
    </footer>
  )
}
