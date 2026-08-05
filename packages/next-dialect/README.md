# next-dialect

Zero-overhead i18n for Next.js. Localized strings are compiled to **constants
inside the chunks that use them**, and only those chunks are locale-specific.
No client-side catalog, no runtime lookups, no fallback chains.

Measured against a no-i18n build of the same app, the total i18n cost is
**+1.8 KB, flat from 600 messages to 60,000**.

```bash
npm install next-dialect
```

Requires Next 15+ on the App Router, and React 19.

## The entire API

```jsx
import { t } from 'next-dialect'

<h1>{t('home.title')}</h1>
<p>{t('home.greeting', { name })}</p>
<span>{t(`status.${s}`)}</span>              // dynamic key, bounded by the static prefix

t.rich('legal.terms', {                      // ICU tags call back into components
  link: (c) => <a href="/terms">{c}</a>,
})

t.dynamic(keyFromServer, params, 'errors.')  // explicit escape hatch

t.locale                                     // current locale
```

`t` is a plain function, not a hook — the locale is invariant per rendering
context, so it works in server components, client components, event handlers
and plain helpers alike. There is no provider, no `useT` and no `getT(locale)`:
the compiler binds the locale from the `[locale]` segment.

Plus one config wrapper:

```js
// next.config.mjs
import { withDialect } from 'next-dialect/config'

export default withDialect(nextConfig, {
  locales: ['en', 'nl'],
  defaultLocale: 'en',
  messages: './messages',        // JSON catalogs: en.json, nl.json, …
})
```

…and one build command, `next-dialect build`.

## How it works

1. **Compile.** Every `t(...)` call site in a production client bundle is
   replaced by its result: a bare literal for static text, a five-line
   formatter for `{arg}` messages, a precompiled ICU tree for the rest. A key
   the compiler cannot bound is a build error, not a silent catalog import.
2. **ICU.** Full MessageFormat — plurals with `offset:`, ordinals, selects,
   number/date skeletons, and tags for rich text. The parser runs at build time
   only; the browser gets a compact AST and a small walker over native `Intl`.
3. **Serve.** On a server, mount `next-dialect/proxy` in a `proxy.ts` and keep
   plain `next build` / `next start`; it rewrites only the chunks that actually
   contain messages, per request, while framework and vendor chunks keep one
   shared URL for every locale. On a static host, the build forks the export
   into one complete site per locale instead.

```ts
// proxy.ts
import { createDialectProxy } from 'next-dialect/proxy'

export const proxy = createDialectProxy()

export const config = {
  matcher: '/((?!_next/image|favicon.ico).*)',
}
```

Dev mode skips compilation entirely: runtime lookup with HMR, same evaluator.

## Documentation

Full docs — getting started, API, configuration, compiler architecture and the
proxy — live in
[the repository](https://github.com/velddev/next-dialect#readme).

## License

[MIT](./LICENSE.md)
