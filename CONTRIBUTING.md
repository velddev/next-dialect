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
npm test                 # everything
npm run test:unit        # compiler unit tests only — fast
npm run test:example     # both builds, then the HTTP and Playwright layers
```

Three layers, and they check genuinely different things:

- **`packages/next-dialect/test`** — the pieces a full build hides: escaping in
  all three JS string contexts, token substitution and its escaped spellings,
  catalog fallback, ICU plural/select/ordinal semantics, and rejection of
  sentinel characters in translator content.
- **`examples/app/tests/run.mjs`** — HTTP and artifact assertions against both
  live flows: per-locale inlining, per-bundle isolation including lazy chunks,
  the no-global-catalog guarantee, token-leak scans, `force-dynamic`, ISR,
  locale negotiation and the proxy's selective prefixing.
- **`examples/app/tests/e2e`** — Playwright, against both servers. Every test
  fails on any browser console error, which is the hydration-mismatch
  tripwire — so a passing e2e run is also a statement that server and client
  rendered the same thing.

CI runs all three on every pull request.

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
```

If you add a library, it has to render the same visible text from the same
catalog with the same server/client split — otherwise the numbers are not
comparable, which is the only thing the suite is for.

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
