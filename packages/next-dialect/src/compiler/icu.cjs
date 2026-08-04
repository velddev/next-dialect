// Build-time / server-side ICU analysis. The formatjs parser runs here
// only — clients receive precompiled ASTs (or plain strings) and never
// ship a parser.
const { parse } = require('@formatjs/icu-messageformat-parser')

const cache = new Map()

function parseMessage(msg) {
  return parse(msg, { requiresOtherClause: false, shouldParseSkeletons: true })
}

// kind: 'static' (pure text) | 'params' (only simple {arg}) | 'icu'
// (plural/select/number/date/time/tag — needs the AST evaluator)
function analyze(msg) {
  let r = cache.get(msg)
  if (r) return r
  try {
    const ast = parseMessage(msg)
    const types = new Set()
    ;(function walk(nodes) {
      for (const n of nodes) {
        types.add(n.type)
        if (n.options) for (const o of Object.values(n.options)) walk(o.value)
        if (n.children) walk(n.children)
      }
    })(ast)
    const kind = [...types].every((t) => t === 0)
      ? 'static'
      : [...types].every((t) => t === 0 || t === 1)
        ? 'params'
        : 'icu'
    r = { kind, ast }
  } catch {
    r = { kind: 'static', ast: null }
  }
  cache.set(msg, r)
  return r
}

module.exports = { parseMessage, analyze }
