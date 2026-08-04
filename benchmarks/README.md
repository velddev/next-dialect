# next-dialect benchmarks

Identical app, five i18n libraries, measured the same way. The question this
suite answers: **how many bytes does a visitor actually download for one
locale, and how many more when they switch locales?**

## The app under test

Every implementation renders the *same* page from the *same* catalog
(`shared/messages/`, 600 messages × 2 locales, ~51 KB per locale as JSON):

| area | rendering | messages used |
| --- | --- | --- |
| header nav | server | `nav.k000`–`nav.k019` (20) |
| article sections | server | `headings.k000`–`k007`, `body.k000`–`k023` (32) |
| 10 × `Popover` | **client** (interactive) | `popover.k000`–`k059` (60) |
| `DataTable` | **client** | `table.k000`–`k039` (40) |
| `SettingsForm` | **client** | `form.k000`–`k039` (40) |
| `Toasts` | **client** | `toast.k000`–`k019` (20) |
| lazy `BillingPanel` | **client, `next/dynamic`** | `billing.k000`–`k039` (40) |

That is 160 eagerly-rendered client messages plus 40 behind a lazy chunk —
deliberately client-heavy, because that is the only place an i18n library can
differ on bytes (server-rendered text ships as text in the RSC payload no
matter which library you use).

Every implementation must:

1. render the same visible text for a given locale,
2. keep the same server/client split (the components marked **client** must
   be `'use client'`),
3. load `BillingPanel` with `next/dynamic` (12 popover blocks were reduced to
   10 so every section fits inside its 60-message budget),
4. use ICU plural/select where the catalog uses it (100 messages) and
   `{name}` interpolation where the catalog uses it (100 messages),
5. build for production and serve on the port in `harness/targets.json`.

## Running it

```bash
node benchmarks/shared/gen-messages.mjs            # regenerate the catalog (deterministic)
node benchmarks/harness/run.mjs                    # build, serve, measure, print the tables
node benchmarks/harness/run-scales.mjs             # the same at 1x / 10x / 100x catalog size
node benchmarks/shared/gen-messages.mjs --scale 10 # or grow the catalog by hand
```

Messages are a pure function of their key, so `k000`–`k059` are byte-identical
at every scale and the runs stay comparable.

The harness drives a real Chromium (Playwright) against each target and sums
**transferred** bytes via CDP `encodedDataLength`, so these are real
over-the-wire sizes and a cache hit correctly counts as zero.

Every target must serve gzip, or the comparison is meaningless — the first
run of this suite had next-dialect looking 30 KB *worse* purely because its
server was stripping `accept-encoding` to get plaintext for rewriting and
never re-compressing. That is now fixed (the server gzips after rewriting and
the proxy caches compressed chunks); if you add a target, check its
`content-encoding` before trusting its numbers.

It reports:

- **first visit (en)** — HTML + JS + JSON needed to render and hydrate
- **locale switch (en → nl)** — bytes fetched that were not already cached
- **lazy open** — bytes fetched when the lazy panel is opened

## Results

600-message catalog, 160 eager client messages + 40 lazy, gzip on for every
target, Chromium, cold cache. KB transferred. Lower is better.

`baseline` is the same app with **no i18n library** — every string
pre-rendered to a literal. It is the floor, and `i18n cost` is the only column
that isolates what a library actually charges you.

| library | first visit | **i18n cost** | of which JS | doc (HTML+RSC) | locale switch | lazy open |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (no i18n) | 114.1 KB | — | 109.3 KB | 4.7 KB | 4.7 KB | 1.2 KB |
| **next-dialect** | 115.8 KB | **+1.8 KB (1.6%)** | 111.1 KB | 4.8 KB | 17.1 KB | 1.4 KB |
| paraglide | 122.3 KB | +8.2 KB (7.2%) | 117.5 KB | 4.7 KB | **4.8 KB** | 3.0 KB |
| next-intl | 131.7 KB | +17.7 KB (15.5%) | 120.2 KB | 11.6 KB | 11.8 KB | 0.8 KB |
| react-intl | 138.8 KB | +24.8 KB (21.7%) | 126.4 KB | 12.4 KB | 12.6 KB | 0.8 KB |
| i18next | 148.9 KB | +34.8 KB (30.5%) | 137.2 KB | 11.6 KB | 12.0 KB | 0.8 KB |

### 0. Does the bill scale with your catalog, or with what you use?

This is the question the whole design rests on. `run-scales.mjs` grows the
catalog by adding **namespaces** (real products grow by adding feature areas)
while the page keeps rendering the same ~200 messages.

Crucially, next-intl appears three times, because *how you configure it
dominates the result*:

- **next-intl** — the documented default: the provider inherits the whole
  catalog.
- **next-intl-tuned** — ships only the 5 namespaces client components use.
  This is the documented best practice and what a competent team runs.
- **next-intl-exact** — ships the exact ~200 keys rendered. No team maintains
  this by hand; it is a runtime library's theoretical floor.

**i18n cost (first visit minus the no-i18n baseline), KB gzip:**

| library | 1× (600 msg) | 10× (6,000) | 100× (60,000) |
| --- | --- | --- | --- |
| **next-dialect** | **+1.8** | **+1.8** | **+1.8** |
| paraglide | +8.6 | +8.6 | — |
| next-intl-exact | +13.2 | +13.2 | +13.2 |
| next-intl-tuned | +14.9 | +14.9 | +14.9 |
| next-intl (default) | +19.3 | +92.7 | +819.4 |
| react-intl (default) | +26.0 | +107.6 | +918.2 |
| i18next (default) | +36.4 | +109.9 | +836.6 |

**Read this carefully, because the obvious conclusion is the wrong one.**

- **Configured correctly, the runtime libraries are flat too.** next-intl with
  namespace picking costs +14.9 KB whether the catalog holds 600 messages or
  60,000. The eye-catching 800 KB numbers are the *default* configuration, not
  a property of the library.
- **Our real advantage over best practice is 13.1 KB** (+1.8 vs +14.9), and
  11.4 KB against their theoretical floor. Flat, but small. It does not on its
  own justify a custom server and a bespoke serving layer.
- **The defensible claim is ergonomic, not architectural.** next-intl reaches
  flatness only while someone keeps the namespace list correct as the app
  grows; a compiler reaches it because it cannot do otherwise. Automatic
  versus disciplined — worth something, but not an order of magnitude.
- **The default matters more than it should.** Every default-configured
  library degrades linearly, and defaults are what most apps ship. That is a
  real-world observation about ecosystems, not evidence about ours.

**Build time is where the approaches genuinely differ:**

| library | 1× | 10× | 100× |
| --- | --- | --- | --- |
| next-dialect | 9 s | 9 s | 10 s |
| next-intl (any config) | 9 s | 10 s | 11 s |
| react-intl / i18next | 13 s | 14 s | 14–15 s |
| **paraglide** | 26 s | 55 s | **120 s** |

Paraglide is the only target doing real per-message codegen, and it pays for
it: 8–12× everyone else at scale, plus one hard build failure at 60,000
messages (it recovered after deleting its generated output, so treat that as
an implementation limit, not a design verdict).

### 1. How much does i18n actually cost?

Against a no-i18n build of the identical app, next-dialect adds **1.8 KB
(1.6%)** for 600 translated messages. Default-configured runtime libraries add
10–19× more (next-intl +17.7 KB, react-intl +24.8 KB, i18next +34.8 KB) — but
see section 0: a *correctly configured* next-intl costs +14.9 KB, so the
honest margin over best practice is ~13 KB, not an order of magnitude.

The `doc` column shows exactly where that goes. next-dialect and Paraglide
keep the document at the baseline's 4.7 KB; the runtime libraries push it to
11.6–12.4 KB because the locale's whole catalog rides in the RSC payload —
including the 40 messages belonging to a lazy panel the visitor may never
open.

### 2. Where next-dialect loses

- **Locale switching is our most expensive path — but it is an unhappy path,
  and the break-even says so.** Switching costs 17.1 KB against a 4.7 KB
  baseline navigation (+12.4 KB of i18n) because strings are baked into the
  code chunk, so changing locale re-downloads the code with them. What matters
  is how often that has to happen before it erases the first-visit win:

  | switches in one session | 0 | 1 | 2 | 3 |
  | --- | --- | --- | --- | --- |
  | **next-dialect** | **115.8** | **132.9** | **149.9** | 167.0 |
  | paraglide | 122.3 | **127.1** | **131.9** | **136.6** |
  | next-intl | 131.7 | 143.5 | 155.3 | 167.1 |
  | react-intl | 138.8 | 151.4 | 164.0 | 176.6 |
  | i18next | 148.9 | 160.8 | 172.8 | 184.8 |

  A visitor must switch **3 times** before next-intl catches us, **5.2** for
  react-intl, **6.5** for i18next. Real sessions switch zero times, or once
  when negotiation guessed wrong and the cookie then pins it. These bytes also
  land inside a navigation the user just triggered, not on the critical path
  to first paint — so a KB here is worth less than a KB on first load.

  **Paraglide is the real exception**: it ships every locale up front (hence
  a 6.5 KB heavier first visit) and switches for free, so it overtakes us at
  **0.5 switches** — i.e. from the first one. If your product has a language
  picker people genuinely use, that is the trade to weigh.
- **Lazy open** is 1.4 KB vs 0.8 KB for the runtime libraries — only because
  they already paid for those messages on first load. Summed, next-dialect is
  still ahead; it is not a real loss, but it is not a win either.
- **Build time is a wash** (9–16 s across all targets, within noise on this
  machine) — the loader front-end did not make builds measurably slower.
- **Client CPU: second place.** +8 ms of JS execution over baseline, versus
  Paraglide's +4 ms — see the runtime table below for why.

### 3. Runtime cost — server and browser

Bytes are only half the story. This is what the origin has to do per request,
and what the browser has to do on arrival:

| library | boot | chunk cold | chunk warm | page | server RSS | script | JS heap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 1059 ms | 5 ms | 3 ms | 3 ms | 84 MB | 25 ms | 2.70 MB |
| **next-dialect** | 1044 ms | 5 ms | 3 ms | 3 ms | 86 MB | 33 ms | **2.78 MB** |
| paraglide | 1045 ms | 3 ms | 2 ms | 2 ms | 85 MB | **29 ms** | 2.88 MB |
| next-intl | 1052 ms | 3 ms | 2 ms | 4 ms | 91 MB | 38 ms | 2.85 MB |
| react-intl | 1053 ms | 3 ms | 2 ms | 4 ms | 88 MB | 39 ms | 3.01 MB |
| i18next | 1048 ms | 3 ms | 2 ms | 4 ms | 88 MB | 46 ms | 3.37 MB |

`chunk cold` is the first-ever fetch of an asset (where next-dialect rewrites
and gzips it); `chunk warm` is the second. `script` is JS execution time on
the first load. Timings vary ±3 ms between runs; the table reproduced across
three runs.

Three things this killed, all of which were *speculation on our side before
measuring*:

- **Boot cost is not real.** The proxy scans every emitted chunk at startup
  and still boots in 1044 ms — indistinguishable from an app with no i18n.
- **Per-request rewriting is ~2 ms, once.** Cold chunk 5 ms vs 3 ms for a
  plain static file, warm 3 ms vs 2 ms. After the first hit per (locale,
  chunk) it is a cache read.
- **The in-memory chunk cache costs +2 MB RSS** — less than next-intl's
  +7 MB. Real, bounded by locales × localized chunks, and not the liability
  it looked like.

And one thing it exposed:

- **Client CPU: next-dialect is second, not first.** +8 ms over baseline,
  beating every runtime library (+13 to +21 ms) but losing to Paraglide's
  +4 ms. The cause is our own design: ICU messages inline as **AST JSON**, so
  the browser still runs `JSON.parse` plus an AST walk per message, while
  Paraglide compiles each message to a plain function. Emitting inline
  functions instead of JSON would close most of that gap — the clearest
  actionable finding in this suite.
- **Browser memory** does go our way, modestly: 2.78 MB vs 2.85–3.37 MB, with
  i18next holding the most (it keeps the whole parsed catalog resident).

### 4. Still not measured

- **Serverless/edge deployability** — categorical rather than a metric: the
  proxy needs a custom server, so Vercel needs the equivalent in edge config.
- **Scaling of the proxy cache** beyond 2 locales × 2 localized chunks.
- **Source-map fidelity.** Verified as a non-issue by default: no target ships
  client `.map` files, because Next sets `productionBrowserSourceMaps: false`.
  It only bites if a project opts in, and `withDialect` now warns when it does.
- **INP / interaction latency** after hydration.

Numbers regenerate into `harness/results.json`.

## Implementations

| directory | library | strategy |
| --- | --- | --- |
| `baseline/` | none | strings pre-rendered to literals; the control |
| `dialect/` | next-dialect | compile-time inlining + bundle proxy |
| `next-intl/` | next-intl | runtime catalog per locale |
| `paraglide/` | Paraglide (inlang) | compile-time per-message modules |
| `react-intl/` | react-intl (FormatJS) | runtime catalog + runtime ICU parser |
| `i18next/` | i18next + react-i18next | runtime catalog, namespaces |

Each is a standalone npm project (its own `node_modules`) so no workspace
hoisting can blur the dependency footprint.
