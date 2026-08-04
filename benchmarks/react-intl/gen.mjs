import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateApp } from '../shared/gen-app.mjs'

const outDir = path.dirname(fileURLToPath(import.meta.url))
const shared = path.join(outDir, '..', 'shared', 'messages')

// react-intl wants flat, dot-separated message ids -> use the *.flat.json
// catalogs verbatim. Copied in so the Next project stays self-contained.
const messagesDir = path.join(outDir, 'messages')
fs.mkdirSync(messagesDir, { recursive: true })
for (const locale of ['en', 'nl']) {
  fs.copyFileSync(
    path.join(shared, `${locale}.flat.json`),
    path.join(messagesDir, `${locale}.json`)
  )
}

generateApp({
  outDir,
  // Client components read the IntlShape out of the provider.
  clientImport: "import { useIntl } from 'react-intl'",
  // Server components cannot use context, so they build an IntlShape with
  // createIntl() from the request locale.
  serverImport: "import { getIntl } from '../lib/server-intl'",
  hook: (scope) => (scope === 'client' ? '  const intl = useIntl()' : '  const intl = getIntl()'),
  call: (key, args) =>
    args
      ? `intl.formatMessage({ id: '${key}' }, ${args})`
      : `intl.formatMessage({ id: '${key}' })`,
})

console.log('bench-react-intl: components generated')
