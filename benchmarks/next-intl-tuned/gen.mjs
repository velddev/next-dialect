import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateApp } from '../shared/gen-app.mjs'

const outDir = path.dirname(fileURLToPath(import.meta.url))

// next-intl exposes the same `useTranslations` hook in Server and Client
// Components, so both imports are identical.
const IMPORT = "import { useTranslations } from 'next-intl'"

generateApp({
  outDir,
  clientImport: IMPORT,
  serverImport: IMPORT,
  hook: () => '  const t = useTranslations()',
  call: (key, args) => (args ? `t('${key}', ${args})` : `t('${key}')`),
})

console.log('bench-next-intl: components generated')
