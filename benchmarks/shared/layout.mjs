// The exact key assignment every benchmark implementation must render, plus
// catalog-reading helpers used by the component generators.
//
// App code should import ./keys.mjs instead — this module touches the
// filesystem at import time.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export { LAYOUT, CLIENT_NAMESPACES, CLIENT_KEYS } from './keys.mjs'
import { LAYOUT } from './keys.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const flat = JSON.parse(
  fs.readFileSync(path.join(here, 'messages', 'en.flat.json'), 'utf8')
)

/** Which runtime shape a key needs, derived from the catalog itself. */
export function kindOf(key) {
  const msg = flat[key]
  if (/\{\w+,\s*(plural|select)/.test(msg)) return /plural/.test(msg) ? 'plural' : 'select'
  if (/\{name\}/.test(msg)) return 'param'
  return 'static'
}

/** Params each key needs, so every implementation passes the same values. */
export function argsFor(key) {
  switch (kindOf(key)) {
    case 'plural':
      return { count: 3 }
    case 'select':
      return { state: 'active' }
    case 'param':
      return { name: 'Ada' }
    default:
      return null
  }
}

export const COUNTS = {
  server: LAYOUT.nav.length + LAYOUT.headings.length + LAYOUT.body.length,
  client:
    LAYOUT.popovers.flat().length +
    LAYOUT.table.length +
    LAYOUT.form.length +
    LAYOUT.toast.length,
  lazy: LAYOUT.billing.length,
  total: Object.keys(flat).length,
}
