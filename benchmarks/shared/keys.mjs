// Pure key data — no filesystem access, so app code can import it safely.
// (layout.mjs adds the catalog-reading helpers on top, for generators.)

const range = (section, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${section}.k${String(from + i).padStart(3, '0')}`)

export const LAYOUT = {
  nav: range('nav', 0, 19), // server
  headings: range('headings', 0, 7), // server
  body: range('body', 0, 23), // server
  popovers: Array.from({ length: 10 }, (_, i) => range('popover', i * 6, i * 6 + 5)), // client
  table: range('table', 0, 39), // client
  form: range('form', 0, 39), // client
  toast: range('toast', 0, 19), // client
  billing: range('billing', 0, 39), // client, lazy
}

/**
 * Namespaces rendered by CLIENT components. A disciplined next-intl or
 * i18next user would ship exactly these to the browser and nothing else —
 * this is the list a "tuned" competitor is allowed to know.
 */
export const CLIENT_NAMESPACES = ['popover', 'table', 'form', 'toast', 'billing']

/** The exact keys the page renders — a runtime library's theoretical floor. */
export const CLIENT_KEYS = [
  ...LAYOUT.popovers.flat(),
  ...LAYOUT.table,
  ...LAYOUT.form,
  ...LAYOUT.toast,
  ...LAYOUT.billing,
]
