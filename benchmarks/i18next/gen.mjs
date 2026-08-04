import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateApp } from '../shared/gen-app.mjs'

const outDir = path.dirname(fileURLToPath(import.meta.url))

// The shared catalog lives outside this project; copy it in so the bundler
// resolves it from inside the app root. Content is untouched.
const src = path.join(outDir, '..', 'shared', 'messages')
const dst = path.join(outDir, 'messages')
fs.mkdirSync(dst, { recursive: true })
for (const locale of ['en', 'nl']) {
  fs.copyFileSync(path.join(src, `${locale}.json`), path.join(dst, `${locale}.json`))
}

generateApp({
  outDir,
  clientImport: "import { useTranslation } from 'react-i18next'",
  serverImport: "import { getT } from '../lib/i18n-server'",
  hook: (scope) =>
    scope === 'client' ? '  const { t } = useTranslation()' : '  const t = getT()',
  call: (key, args) => (args ? `t('${key}', ${args})` : `t('${key}')`),
})

console.log('bench-i18next: components generated')
