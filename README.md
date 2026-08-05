# next-dialect

[![npm](https://img.shields.io/npm/v/next-dialect.svg)](https://www.npmjs.com/package/next-dialect)
[![CI](https://github.com/velddev/next-dialect/actions/workflows/ci.yml/badge.svg)](https://github.com/velddev/next-dialect/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

Zero-overhead i18n for Next.js: localized strings are compiled to **constants inside the chunks that use them**, and only those chunks are locale-specific. No client-side catalog, no runtime lookups, no fallback chains.

```bash
npm install next-dialect
```

Full documentation — getting started, API, configuration, compiler architecture and the proxy — lives in [website/app/docs](website/app/docs), and is served at `/docs`.

## The entire API

One import for component code:

```jsx
import { t } from 'next-dialect'

<h1>{t('home.title')}</h1>
<p>{t('home.greeting', { name })}</p>
<span>{t(`status.${s}`)}</span>              // dynamic key, bounded by the static prefix

t.rich('legal.terms', {                      // ICU tags call back into components
  link: (c) => <a href="/terms">{c}</a>,
})

t.dynamic(keyFromServer, params, 'errors.')  // explicit escape hatch, see below

t.locale                                     // current locale
```

`t` is a plain function, not a hook — the locale is invariant per rendering context, so it works in server components, client components, event handlers and plain helpers alike. The same import resolves to a different implementation per target (`react-server` condition for RSC, a client runtime for the browser, and inlined constants after compilation).

One config wrapper:

```js
// next.config.mjs
import { withDialect } from 'next-dialect/config'

export default withDialect(nextConfig, {
  locales: ['en', 'nl'],
  defaultLocale: 'en',
  messages: './messages',        // JSON catalogs: en.json, nl.json, …
  localePrefix: 'always',        // or 'as-needed' (default locale un-prefixed)
  compiler: 'loader',            // 'loader' (keeps SWC) or 'babel'
  detection: { cookie: 'DIALECT_LOCALE', acceptLanguage: true },
})
```

Plus one build command, `next-dialect build`, and a three-line `proxy.ts` that mounts `next-dialect/proxy`. There is no provider, no `useT`, no `getT(locale)` — the compiler binds the locale from the `[locale]` segment automatically.

```ts
// proxy.ts
import { createDialectProxy } from 'next-dialect/proxy'

export const proxy = createDialectProxy()
export const config = { matcher: '/((?!_next/image|favicon.ico).*)' }
```

## How it works

1. **Compile.** Every `t(...)` call site in a production client bundle is compiled away:
   - static message → bare string literal (a sentinel token, resolved per locale later)
   - `{arg}` message → `__fmt(token, params)` (~5-line runtime)
   - ICU message → `__icu(token, params, locale)` where the token becomes a precompiled AST
   - `t.rich(...)` → `__icuRich(...)`, which evaluates the same AST into React children
   - `t(\`prefix.${x}\`)` → an object literal containing only `prefix.*`
   - `t.dynamic(key, params, 'ns.')` → an object literal of the declared namespace, with a build-time log of what that costs. Without a bound it inlines the whole catalog — deliberately explicit.
   - unbounded `t(expr)` → **compile error** pointing at the two supported forms

   Locale fallbacks resolve at compile time (a key missing from `nl.json` gets the default locale's string baked into the `nl` output), and the build prints which keys fell back.

   Two front-ends share one transform: a **loader** (default — Next keeps using SWC, so builds stay fast and Turbopack remains reachable) and a **Babel plugin** for projects already running Babel.

2. **ICU.** Full MessageFormat — plurals with `offset:`, ordinals, selects, number/date skeletons, and tags for rich text. The formatjs parser runs at build time only; the browser gets a compact AST and a ~70-line walker over native `Intl`.

3. **Serve.**
   - **Server deployments**: mount [`next-dialect/proxy`](packages/next-dialect/src/next-proxy.mjs) in a `proxy.ts` and keep plain `next build` / `next start`. It finds the chunks that actually contain message tokens and rewrites *only those* per request (cached, raw and gzipped); framework and vendor chunks keep a single shared URL and a single cache entry for every locale, so switching language re-downloads kilobytes rather than the whole app. Needs the Node runtime — Next 16, or 15.5 as `middleware.ts`.
   - **Static export**: no request-time hook exists, so `next-dialect build` forks the export into one complete site per locale under `dist/<locale>/`.
   - Both paths negotiate un-prefixed URLs (sticky cookie → `Accept-Language` → default) and support `localePrefix: 'as-needed'`.

Dev mode skips compilation entirely: runtime lookup with HMR, same evaluator.

## Repo layout

- [packages/next-dialect](packages/next-dialect) — compiler (`src/compiler/`), runtimes, the proxy, CLI
- [examples/app](examples/app) — App Router demo (en/nl) in two flows:
  - static: `npm run build` then `npm run serve` → http://localhost:4321/
  - server: `npm run build:ssr` then `npm run start:ssr` → http://localhost:3100/en
- [benchmarks](benchmarks) — the same 600-message app implemented with no i18n at all (the control), then in next-dialect, Paraglide, next-intl, react-intl and i18next, measured in a real browser. Measured against the no-i18n build, next-dialect's total i18n cost is **+1.8 KB, flat from 600 messages to 60,000**. The honest comparison is against a *correctly configured* competitor, not a default one: next-intl restricted to the namespaces its client components use is also flat, at +14.9 KB (+13.2 KB if you hand-pick the exact keys). So the real margin is **~13 KB, flat** — meaningful but not an order of magnitude, and the durable difference is that a compiler gets there automatically where namespace picking needs discipline that decays. Default-configured runtime libraries do degrade linearly (+819 to +918 KB at 60,000 messages), which is what most apps actually ship. Paraglide lands at +8.6 KB flat but is the only target whose build scales badly: 26 s → 55 s → 120 s. It is also the most expensive on a locale switch (+12.4 KB, because inlining ties strings to the code chunk) — but a visitor has to switch 3 times before next-intl catches up and 6.5 times before i18next does, so that cost only matters for products whose users genuinely change language. Full tables, runtime costs and blind spots in [benchmarks/README.md](benchmarks/README.md).
- [website](website) — the landing page

## Tests

`npm test -w next-dialect` runs the unit layer; `npm test -w example-app` builds both flows and runs the integration layers. Three layers in total:

- [packages/next-dialect/test](packages/next-dialect/test) — 14 unit tests for the pieces a full build hides: escaping in all three JS string contexts, token substitution and its escaped spellings, catalog fallback, ICU plural/select/ordinal semantics, and rejection of sentinel characters in translator content.
- [tests/run.mjs](examples/app/tests/run.mjs) — 22 HTTP/artifact assertions: per-locale constant inlining, per-bundle isolation (including lazy chunks), compile-time fallback, the no-global-catalog guarantee, token-leak scans, `t.rich` and `t.dynamic` output and bounding, `force-dynamic` rendering, ISR, locale negotiation, `localePrefix: 'as-needed'`, and the proxy's selective prefixing (localized chunks locale-scoped, shared chunks shared, cookie-resolved lazy chunks carrying `Vary`).
- [tests/e2e/i18n.spec.mjs](examples/app/tests/e2e/i18n.spec.mjs) — 26 Playwright UX tests against both live servers: hydration and interaction, lazy chunks delivering the right locale, ICU plurals per locale's rules, complex ICU (offset plurals, ordinals, nested args, hostile characters), rich text producing real DOM, dynamic keys with fallback, cross-tree locale navigation, and per-request rendering — every test failing on any browser console error, which is the hydration-mismatch tripwire.

## Status / known limitations

- The streaming HTML rewriter requires plaintext, so the dialect server asks Next not to compress; compression belongs to the CDN in front of it.
- Custom servers do not run on Vercel. There the proxy's two jobs (locale-scoped asset URLs + HTML rewriting) move to edge config, which the build output is already shaped for.
- Localized chunks keep their original content hash, so their source maps drift after substitution. Next disables browser source maps in production by default, so this is inert unless a project sets `productionBrowserSourceMaps: true` — in which case `withDialect` warns.
- No generated TypeScript types yet (a key union plus per-key param types is the obvious next step).
- ICU messages inline as AST JSON, so the browser pays a `JSON.parse` plus an AST walk per message. The benchmark puts this at +8 ms of JS execution versus +4 ms for Paraglide, which compiles messages to plain functions; emitting inline functions instead of JSON would close most of that gap.

## Contributing

Setup, the three test layers, and the two things that will otherwise waste an afternoon are in [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports are most useful with a message, a call site and what ended up in the bundle. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE.md)
