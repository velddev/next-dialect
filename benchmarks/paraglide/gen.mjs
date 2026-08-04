import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateApp } from '../shared/gen-app.mjs'

const outDir = path.dirname(fileURLToPath(import.meta.url))

// Paraglide bundle ids must be valid JS identifiers, so the shared catalog's
// dotted keys are mapped to underscores (see convert-messages.mjs).
const safe = (key) => key.replace(/\./g, '_')

generateApp({
  outDir,
  // Client components read the locale off the route segment; server
  // components read it from the per-request store seeded in page.jsx.
  clientImport: [
    "import { useParams } from 'next/navigation'",
    "import * as m from '../paraglide/messages.js'",
  ].join('\n'),
  serverImport: [
    "import { currentLocale } from '../request-locale.js'",
    "import * as m from '../paraglide/messages.js'",
  ].join('\n'),
  hook: (scope) =>
    scope === 'client'
      ? '  const { locale } = useParams()'
      : '  const locale = currentLocale()',
  // Paraglide resolves the locale through getLocale() by default, which needs
  // AsyncLocalStorage on the server. Passing options.locale explicitly is the
  // documented override and is the only thing that works for both prerendered
  // server components and hydrated client components.
  call: (key, args) => `m.${safe(key)}(${args ?? '{}'}, { locale })`,
})

console.log('bench-paraglide: components generated')
