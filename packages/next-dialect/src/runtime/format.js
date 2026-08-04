// Message runtimes. Static messages compile to bare literals and never touch
// this file. Parameterized messages use __fmt. ICU messages arrive as
// precompiled ASTs — the evaluator below walks them with native Intl, so no
// ICU parser ever ships to a browser.
export function __fmt(pattern, params) {
  if (pattern == null) return ''
  if (!params) return pattern
  return pattern.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m))
}

const astCache = new Map()
const fmtCache = new Map()

// Compiled call sites pass the inlined per-locale AST JSON; dev/runtime
// lookups may pass a raw pattern instead.
export function parseAst(serialized) {
  if (astCache.has(serialized)) return astCache.get(serialized)
  let ast
  try {
    ast = JSON.parse(serialized)
  } catch {
    ast = null
  }
  if (!Array.isArray(ast)) ast = null
  astCache.set(serialized, ast)
  return ast
}

export function __icu(serialized, params, locale) {
  if (serialized == null) return ''
  if (Array.isArray(serialized)) return evalNodes(serialized, params, locale)
  const ast = parseAst(serialized)
  return ast ? evalNodes(ast, params, locale) : __fmt(serialized, params)
}

export function formatter(kind, locale, style) {
  const skeleton = style && typeof style === 'object' ? style.parsedOptions : undefined
  const key = kind + ':' + locale + ':' + (skeleton ? JSON.stringify(skeleton) : String(style))
  let f = fmtCache.get(key)
  if (!f) {
    if (kind === 'number') {
      f = new Intl.NumberFormat(
        locale,
        skeleton ||
          (style === 'percent'
            ? { style: 'percent' }
            : style === 'integer'
              ? { maximumFractionDigits: 0 }
              : undefined)
      )
    } else if (kind === 'date') {
      f = new Intl.DateTimeFormat(
        locale,
        skeleton || {
          dateStyle: ['short', 'medium', 'long', 'full'].includes(style) ? style : 'medium',
        }
      )
    } else if (kind === 'time') {
      f = new Intl.DateTimeFormat(
        locale,
        skeleton || {
          timeStyle: ['short', 'medium', 'long', 'full'].includes(style) ? style : 'short',
        }
      )
    } else {
      f = new Intl.PluralRules(locale, { type: kind === 'ordinal' ? 'ordinal' : 'cardinal' })
    }
    fmtCache.set(key, f)
  }
  return f
}

// Branch selection, shared with the rich evaluator so both agree on ICU
// semantics (exact =n matches against the raw value; rule selection and #
// against the offset-adjusted value).
export function selectChoice(node, params) {
  const v = params ? params[node.value] : undefined
  return node.options[String(v)] || node.options.other
}

export function pluralChoice(node, params, locale) {
  const raw = Number(params ? params[node.value] : NaN)
  const num = raw - (node.offset || 0)
  const opt =
    node.options['=' + raw] ||
    node.options[
      formatter(node.pluralType === 'ordinal' ? 'ordinal' : 'plural', locale).select(num)
    ] ||
    node.options.other
  return { opt, pound: num }
}

// formatjs AST node types: 0 literal, 1 argument, 2 number, 3 date,
// 4 time, 5 select, 6 plural, 7 pound (#), 8 tag.
export function evalNodes(nodes, params, locale, pound) {
  let out = ''
  for (const n of nodes) {
    switch (n.type) {
      case 0:
        out += n.value
        break
      case 1: {
        const v = params ? params[n.value] : undefined
        out += v == null ? '' : String(v)
        break
      }
      case 2:
        out += formatter('number', locale, n.style).format(Number(params ? params[n.value] : NaN))
        break
      case 3:
        out += formatter('date', locale, n.style).format(new Date(params ? params[n.value] : 0))
        break
      case 4:
        out += formatter('time', locale, n.style).format(new Date(params ? params[n.value] : 0))
        break
      case 5: {
        const opt = selectChoice(n, params)
        if (opt) out += evalNodes(opt.value, params, locale, pound)
        break
      }
      case 6: {
        const { opt, pound: num } = pluralChoice(n, params, locale)
        if (opt) out += evalNodes(opt.value, params, locale, num)
        break
      }
      case 7:
        out += formatter('number', locale).format(pound)
        break
      case 8:
        if (n.children) out += evalNodes(n.children, params, locale, pound)
        break
    }
  }
  return out
}
