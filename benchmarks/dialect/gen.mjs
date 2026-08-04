import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateApp } from '../shared/gen-app.mjs'

const outDir = path.dirname(fileURLToPath(import.meta.url))
const IMPORT = "import { t } from 'next-dialect'"

generateApp({
  outDir,
  clientImport: IMPORT,
  serverImport: IMPORT,
  // Literal keys are what let the compiler inline the message.
  call: (key, args) => (args ? `t('${key}', ${args})` : `t('${key}')`),
})

console.log('bench-dialect: components generated')
