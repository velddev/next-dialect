import InkLink from './InkLink'
import ScribbleMotion from './ScribbleMotion'
import SiteFooter from './SiteFooter'
import SiteHeader from './SiteHeader'
import { pageMeta, SITE_NAME } from './seo'

export const metadata = pageMeta({
  title: `${SITE_NAME} | zero-overhead i18n for Next.js`,
  description:
    'A single function to localize your entire app. Strings compile to constants at build time — no catalog, no lookups, no runtime.',
  path: '/',
  type: 'website',
})

// Vertical rhythm: everything sits on the 24px ruling — leading-6 (24px),
// leading-[72px], leading-12 (48px); margins in mt-6/12/18/24 steps.
const h2 = 'relative top-[10px] mt-18 mb-6 font-display text-[32px] leading-12'
const para = 'mb-6'

export default function Home() {
  return (
    <div className="mx-auto max-w-[820px] px-6">
      <SiteHeader />

      <main className="pt-36 max-sm:pt-24">
        <h1 className="relative top-[26px] font-display text-[72px] leading-[96px] tracking-[0.005em] max-sm:text-[42px] max-sm:leading-12">
          Localize your Next.js
          <br />
          page with zero bloat
        </h1>
        <div className="relative top-[24px] mt-12 flex gap-4">
          <a
            className="scribble inline-flex h-12 items-center border border-ink/25 px-5 text-[15px] leading-6"
            href="#get-started"
          >
            <span className="scribble-fill" aria-hidden="true" />
            Get Started
          </a>
          <a
            className="scribble inline-flex h-12 items-center border border-ink/25 px-5 text-[15px] leading-6"
            href="https://github.com/velddev/next-dialect"
          >
            <span className="scribble-fill" aria-hidden="true" />
            GitHub
          </a>
        </div>
      </main>

      {/* The button row adds 96px of flow, so the article's own margin drops
          by the same amount to keep it near the fold — and on the grid. */}
      <article className="relative top-[4px] mt-72 text-xl leading-6 text-ink/90 max-sm:mt-36">
        <p className={`${para} drop-cap`}>
          When I was building localization for{' '}
          <InkLink href="https://top.gg">Top.gg</InkLink>, we kept hitting the same wall. Every
          string the site might ever need had to ship in the bundle. Adding one sentence to one
          page meant sending it to everyone, on every page. Each little string turned into a
          decision that mattered at global scale, and it really shouldn&rsquo;t have been.
        </p>
        <p className={para}>
          Most i18n libraries work this way. You ship a catalog, look strings up at runtime, and
          the catalog grows with the product. You can split it into namespaces to keep it in
          check, but that&rsquo;s discipline you have to keep up forever, and it slips.
        </p>
        <p className={para}>
          Dialect does the lookup at build time instead. It reads your JSON, finds every{' '}
          <code className="text-[17px] leading-none">t()</code> call, and writes the string
          straight into the code. By the time the page loads there&rsquo;s nothing left to look
          up.
        </p>

        <h2 className={h2}>One function</h2>
        <p className={para}>
          You import <code className="text-[17px] leading-none">t</code> and call it. That&rsquo;s
          the whole API. No provider to mount, no context to thread through your tree. It works
          the same in server components, client components and event handlers, because it&rsquo;s
          a plain function rather than a hook. The compiler finds each call and swaps in the
          string.
        </p>
        <figure className="relative top-[3px] my-12">
          <pre className="code-panel overflow-x-auto p-6 font-mono text-[15px] leading-6 text-ink">
            <code>
              <span className="tok-kw">import</span>
              {' { '}
              <span className="tok-tag">t</span>
              {' } '}
              <span className="tok-kw">from</span> <span className="tok-str">'next-dialect'</span>
              {'\n\n'}
              <span className="tok-tag">&lt;h1&gt;</span>
              {'{'}
              <span className="tok-tag">t</span>(<span className="tok-str">'checkout.title'</span>)
              {'}'}
              <span className="tok-tag">&lt;/h1&gt;</span>
              {'   '}
              <span className="tok-com">{'//  →  "Afrekenen"'}</span>
            </code>
          </pre>
          <figcaption className="mt-6 text-[14px] italic leading-6 text-muted">
            Fig. 1 — the whole API, and what it compiles to.
          </figcaption>
        </figure>

        <h2 className={h2}>Every locale is its own bundle</h2>
        <p className={para}>
          The build emits one set of chunks per language. Someone in Rotterdam gets the Dutch
          ones and nothing else. Strings sit in the chunk that uses them, so a lazy-loaded panel
          brings its own text along and nobody else pays for it. When a translation is missing,
          the default-locale string is baked in at build time and the build prints which keys
          fell back.
        </p>

        <blockquote className="relative top-[11px] my-12 font-display text-[28px] italic leading-12 text-ink/80">
          <p>
            No matter how many translations you have, the cost per page will always be around
            ~2&nbsp;KB.
          </p>
        </blockquote>

        <h2 className={h2}>Plurals</h2>
        <p className={para}>
          This is usually where things fall apart. One artikel, two artikelen; first place in
          English is 1e plaats in Dutch. Dialect handles full ICU: plurals with offsets,
          ordinals, select, numbers and dates. Each message compiles to a small tree at build
          time and runs on the browser&rsquo;s own{' '}
          <code className="text-[17px] leading-none">Intl</code>, so the ICU parser itself never
          ships.
        </p>

        <h2 className={h2}>The rest of Next.js</h2>
        <p className={para}>
          Static export, server rendering, ISR, lazy loading, locale negotiation with real
          redirects. Server-rendered pages just read the JSON per request, which is dull and
          completely fine, because the server isn&rsquo;t where bytes cost you anything. One
          honest trade: because the strings live inside the code chunks, switching language
          mid-session re-downloads more than a runtime catalog would. If your users flip
          languages constantly, weigh that.
        </p>

        <h2 className={h2} id="get-started">
          Getting started
        </h2>
        <p className={para}>
          Install it, wrap your Next config, and start calling{' '}
          <code className="text-[17px] leading-none">t('hello')</code> where the text used to be.
        </p>
        <figure className="relative top-[3px] my-12">
          <pre className="code-panel overflow-x-auto p-6 font-mono text-[15px] leading-6 text-ink">
            <code>
              <span className="tok-kw">npm</span> install{' '}
              <span className="tok-str">next-dialect</span>
            </code>
          </pre>
          <figcaption className="mt-6 text-[14px] italic leading-6 text-muted">
            Fig. 2 — that’s the install.
          </figcaption>
        </figure>
      </article>

      <SiteFooter />
      <ScribbleMotion />
    </div>
  )
}
