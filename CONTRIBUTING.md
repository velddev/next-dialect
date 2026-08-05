# Contributing to next-dialect

Thanks for looking. This is a compiler, so the most useful thing you can bring
is a case it gets wrong — a message it mangles, a call form it rejects that it
shouldn't, a bundle that ends up with a string in it that a visitor never asked
for.

## Setup

```bash
git clone https://github.com/velddev/next-dialect.git
cd next-dialect
npm install
```

npm workspaces, so one install at the root covers the package, the example app
and the website. Node 18.18 or newer.

## Layout

| Path | What it is |
| --- | --- |
| `packages/next-dialect` | The package. Compiler in `src/compiler/`, runtimes in `src/runtime/`, plus the bundle proxy, server and CLI. |
| `examples/app` | App Router demo in English and Dutch, and the integration + e2e test host. |
| `benchmarks` | The same 600-message app in five libraries, measured in a real browser. |
| `website` | The landing page and the docs, in MDX. |

## Running things

```bash
npm run dev              # the example app in dev mode (no compilation, HMR)
npm run build            # static export -> examples/app/dist/<locale>/
npm run serve            # serve that at http://localhost:4321/
npm run website          # the docs site at http://localhost:3300/
```

## Tests

```bash
npm test
```

That is the whole suite, and it is what CI runs: unit tests, both example builds,
the HTTP, proxy and Playwright layers, and a website build. It takes a few
minutes, mostly in the two Next builds. Playwright needs its browser once:

```bash
npx playwright install chromium
```

The pieces exist separately for iteration, not because you should have to
remember them — `npm run test:unit` is a tenth of a second, and the three layers
under `examples/app` (`test:http`, `test:proxy`, `test:e2e`) run against a build
you already have rather than making a new one.

Four layers, and they check genuinely different things:

- **`packages/next-dialect/test`** — the pieces a full build hides: escaping in
  all three JS string contexts, token substitution and its escaped spellings,
  catalog fallback, ICU plural/select/ordinal semantics, and rejection of
  sentinel characters in translator content.
- **`examples/app/tests/run.mjs`** — HTTP and artifact assertions against both
  live flows: per-locale inlining, per-bundle isolation including lazy chunks,
  the no-global-catalog guarantee, token-leak scans, `force-dynamic`, ISR,
  locale negotiation and the proxy's selective prefixing.
- **`examples/app/tests/proxy.mjs`** — the `next-dialect/proxy` handler, driven
  in-process against the real SSR build: cookie-resolved chunks, pass-through
  for chunks with no messages, cache headers, and every negotiation branch in
  both prefix modes. In-process because exercising it over HTTP would need a
  Next 16 runtime.
- **`examples/app/tests/e2e`** — Playwright, against both servers. Every test
  fails on any browser console error, which is the hydration-mismatch
  tripwire — so a passing e2e run is also a statement that server and client
  rendered the same thing.

CI runs all of them on every pull request.

## Working on the compiler

Two things will waste an afternoon if nobody tells you:

- **Next's webpack cache does not invalidate when the transform changes.**
  Delete `examples/app/.next` after editing anything under `src/compiler/`, or
  you will be testing the previous version of your code.
- **Segments render independently.** A page can execute before its layout, so
  locale binding is injected into *every* segment entry (`layout`, `page`,
  `template`), including files that never import the package. If you are
  tempted to skip a file for not mentioning `next-dialect`, check whether it
  sits at a `[locale]` boundary first.

The compiler marks message positions with `U+0001`. Minifiers re-emit that as
`\u0001` or `\x01`, so anything matching tokens has to accept all three
spellings — `src/compiler/tokens.cjs` is the single place that does.

## Benchmarks

Every target generates its own app from `benchmarks/shared/gen-app.mjs`, so
`components/` and `messages/` are build output rather than source. Install a
target's dependencies, then:

```bash
node benchmarks/shared/gen-messages.mjs      # regenerate the catalogs
node benchmarks/harness/run.mjs              # measure every target
node benchmarks/harness/run-scales.mjs       # …at 1x, 10x and 100x
```

If you add a library, it has to render the same visible text from the same
catalog with the same server/client split — otherwise the numbers are not
comparable, which is the only thing the suite is for.

### The pull-request check

A PR touching `packages/next-dialect/**` or `benchmarks/**` gets its transfer
sizes measured and compared against the branch it merges into, and the
comparison posted as a comment. It builds only `baseline` and `next-dialect`,
at all three scales — a change here cannot move next-intl or Paraglide, so
building them would triple the runtime to compare two numbers against
themselves. The full field stays a manual run.

Both sides are measured on the same runner in the same job. Comparing against
the committed `results-*x.json` would be cheaper and wrong: those were recorded
on other hardware, with whichever Next version was current.

Only sizes fail the build. They come from CDP `encodedDataLength` and are
deterministic for a given build, so a change in them is a real change. Build
and script times sit in the same results file and swing by tens of percent on a
shared runner — they are reported for context and never gated.

To reproduce what CI does:

```bash
node benchmarks/harness/run-scales.mjs --only baseline,next-dialect --out benchmarks/harness/ci
node benchmarks/harness/compare.mjs --base <other-checkout>/benchmarks/harness/ci --head benchmarks/harness/ci
```

## Pull requests

- One concern per PR.
- New behaviour needs a test in whichever layer actually exercises it. A
  compiler change that only shows up in a real build belongs in the example
  app's suite, not the unit tests.
- Say what you measured, if you changed anything that touches bytes shipped.
- Match the surrounding code. Comments here explain *why* something is the way
  it is, usually because the obvious approach failed; keep that habit.

## Releases

Maintainers only. Bump the version in `packages/next-dialect/package.json`,
then publish a GitHub Release tagged `v<version>`. The release workflow checks
that the tag and the package version agree, runs the unit tests, and publishes
to npm via trusted publishing — there is no token to manage.

## Website

`next-dialect.com` is the static export served by an assets-only Cloudflare
Worker — there is no server, so nothing runs per request. Pushing a change
under `website/` to `main` builds and deploys it.

```bash
npm run website                       # dev, at http://localhost:3300/
npm run preview -w website            # build, then serve it exactly as Cloudflare will
npm run deploy:check -w website       # build + validate the Worker config, deploy nothing
npm run deploy -w website             # build and ship it
```

Reach for `preview` rather than `serve` when you touch routing or headers: it
runs the real asset server, so trailing slashes, the 404 fallback and the
`public/_headers` cache rules behave the way production will.

The Worker answers on the apex only. `www` is handled by a zone-level Redirect
Rule in the Cloudflare dashboard, not by anything in this repository — a
`_redirects` file cannot do it, because the asset server matches those rules on
path and ignores the host.
