// Emits the benchmark app's components for one i18n flavour.
//
// Every implementation calls this with its own `emit` helpers, which
// guarantees all five apps render byte-identical content and keep the same
// server/client split — only the i18n call syntax differs.
import fs from 'node:fs'
import path from 'node:path'
import { LAYOUT, kindOf, argsFor } from './layout.mjs'

const jsArgs = (key) => {
  const a = argsFor(key)
  return a ? JSON.stringify(a).replace(/"(\w+)":/g, '$1: ') : null
}

/**
 * @param {object} o
 * @param {string} o.outDir            app root (contains app/ and components/)
 * @param {string} o.clientImport      import line(s) for client components
 * @param {string} o.serverImport      import line(s) for server components
 * @param {(scope:'client'|'server')=>string} [o.hook]  line(s) inside the component body
 * @param {(key:string, args:string|null)=>string} o.call   the message call expression
 */
export function generateApp({ outDir, clientImport, serverImport, hook = () => '', call }) {
  const comp = path.join(outDir, 'components')
  fs.mkdirSync(comp, { recursive: true })
  const c = (key) => call(key, jsArgs(key))

  const clientHeader = (extra = '') =>
    `'use client'\n${extra ? extra + '\n' : ''}${clientImport}\n`

  // --- 12 popovers, 6 messages each -------------------------------------
  const popovers = LAYOUT.popovers
    .map(
      (keys, i) => `      <div className="popover">
        <button data-testid="pop-${i}" onClick={() => toggle(${i})}>{${c(keys[0])}}</button>
        {open === ${i} && (
          <div role="dialog">
${keys
  .slice(1)
  .map((k) => `            <p>{${c(k)}}</p>`)
  .join('\n')}
          </div>
        )}
      </div>`
    )
    .join('\n')

  fs.writeFileSync(
    path.join(comp, 'Popovers.jsx'),
    `${clientHeader("import { useState } from 'react'")}
export default function Popovers() {
  const [open, setOpen] = useState(null)
  const toggle = (i) => setOpen((v) => (v === i ? null : i))
${hook('client')}
  return (
    <section data-testid="popovers">
${popovers}
    </section>
  )
}
`
  )

  // --- data table --------------------------------------------------------
  fs.writeFileSync(
    path.join(comp, 'DataTable.jsx'),
    `${clientHeader()}
export default function DataTable() {
${hook('client')}
  return (
    <table data-testid="table">
      <tbody>
${LAYOUT.table.map((k) => `        <tr><td>{${c(k)}}</td></tr>`).join('\n')}
      </tbody>
    </table>
  )
}
`
  )

  // --- settings form -----------------------------------------------------
  fs.writeFileSync(
    path.join(comp, 'SettingsForm.jsx'),
    `${clientHeader("import { useState } from 'react'")}
export default function SettingsForm() {
  const [v, setV] = useState('')
${hook('client')}
  return (
    <form data-testid="form">
${LAYOUT.form
  .map(
    (k, i) =>
      `      <label>{${c(k)}}<input name="f${i}" value={v} onChange={(e) => setV(e.target.value)} /></label>`
  )
  .join('\n')}
    </form>
  )
}
`
  )

  // --- toasts ------------------------------------------------------------
  fs.writeFileSync(
    path.join(comp, 'Toasts.jsx'),
    `${clientHeader()}
export default function Toasts() {
${hook('client')}
  return (
    <ul data-testid="toasts">
${LAYOUT.toast.map((k) => `      <li>{${c(k)}}</li>`).join('\n')}
    </ul>
  )
}
`
  )

  // --- lazily loaded billing panel ---------------------------------------
  fs.writeFileSync(
    path.join(comp, 'BillingPanel.jsx'),
    `${clientHeader()}
export default function BillingPanel() {
${hook('client')}
  return (
    <div data-testid="billing">
${LAYOUT.billing.map((k) => `      <p>{${c(k)}}</p>`).join('\n')}
    </div>
  )
}
`
  )

  // --- client area: composes the above, lazy-loads billing ---------------
  fs.writeFileSync(
    path.join(comp, 'ClientArea.jsx'),
    `'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import Popovers from './Popovers'
import DataTable from './DataTable'
import SettingsForm from './SettingsForm'
import Toasts from './Toasts'

const BillingPanel = dynamic(() => import('./BillingPanel'), { ssr: false })

export default function ClientArea() {
  const [billing, setBilling] = useState(false)
  return (
    <div>
      <Popovers />
      <DataTable />
      <SettingsForm />
      <Toasts />
      <button data-testid="open-billing" onClick={() => setBilling(true)}>
        billing
      </button>
      {billing && <BillingPanel />}
    </div>
  )
}
`
  )

  // --- server-rendered page body ----------------------------------------
  const nav = LAYOUT.nav.map((k) => `        <a href="#">{${c(k)}}</a>`).join('\n')
  const sections = LAYOUT.headings
    .map(
      (h, i) => `      <section>
        <h2>{${c(h)}}</h2>
${LAYOUT.body
  .slice(i * 3, i * 3 + 3)
  .map((k) => `        <p>{${c(k)}}</p>`)
  .join('\n')}
      </section>`
    )
    .join('\n')

  fs.writeFileSync(
    path.join(comp, 'PageBody.jsx'),
    `${serverImport}
import ClientArea from './ClientArea'

export default function PageBody() {
${hook('server')}
  return (
    <main>
      <nav data-testid="nav">
${nav}
      </nav>
${sections}
      <ClientArea />
    </main>
  )
}
`
  )

  return {
    files: [
      'Popovers.jsx',
      'DataTable.jsx',
      'SettingsForm.jsx',
      'Toasts.jsx',
      'BillingPanel.jsx',
      'ClientArea.jsx',
      'PageBody.jsx',
    ],
  }
}
