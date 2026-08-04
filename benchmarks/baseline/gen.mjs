// Baseline: the same app with NO i18n library at all — every message is
// pre-rendered to its final English text and emitted as a literal.
//
// This is the floor. Any target's cost minus this is that library's true
// i18n overhead; without it the comparison is mostly React and Next.js.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateApp } from '../shared/gen-app.mjs'
import { flat, argsFor } from '../shared/layout.mjs'

// Minimal ICU renderer covering exactly the shapes the shared catalog uses
// (static text, {name}, plural with =0/one/other, select). Kept local so the
// baseline app depends on nothing but Next and React.
function render(message, args) {
  const params = args || {}

  const plural = /^\{(\w+),\s*plural,\s*([\s\S]*)\}$/.exec(message.trim())
  if (plural) {
    const [, argName, body] = plural
    const n = Number(params[argName])
    const branches = parseBranches(body)
    const chosen =
      branches['=' + n] ?? (n === 1 ? branches.one : undefined) ?? branches.other ?? ''
    return chosen.replaceAll('#', String(n))
  }

  const select = /^\{(\w+),\s*select,\s*([\s\S]*)\}$/.exec(message.trim())
  if (select) {
    const [, argName, body] = select
    const branches = parseBranches(body)
    return branches[params[argName]] ?? branches.other ?? ''
  }

  return message.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m))
}

// "=0 {a} one {b} other {c}" -> { '=0': 'a', one: 'b', other: 'c' }
function parseBranches(body) {
  const out = {}
  let i = 0
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++
    let name = ''
    while (i < body.length && body[i] !== '{') name += body[i++]
    if (body[i] !== '{') break
    let depth = 0
    let value = ''
    do {
      if (body[i] === '{') depth++
      else if (body[i] === '}') depth--
      if (depth > 0 || body[i] !== '{') value += body[i]
      i++
    } while (i < body.length && depth > 0)
    // value is the branch wrapped in its own braces: strip both.
    out[name.trim()] = value.slice(1, -1)
  }
  return out
}

const outDir = path.dirname(fileURLToPath(import.meta.url))

generateApp({
  outDir,
  clientImport: '',
  serverImport: '',
  // No library, no lookup: the finished string is the code.
  call: (key) => JSON.stringify(render(flat[key], argsFor(key))),
})

console.log('bench-baseline: components generated (no i18n library)')
