// Rich-text evaluator: the same precompiled ICU AST, evaluated into React
// children instead of a string, so `<link>…</link>` tags in a message call
// back into your components.
//
//   t.rich('legal.terms', { link: (c) => <a href="/terms">{c}</a> })
//
// Only pulled into a bundle when t.rich is actually used.
import { createElement, Fragment } from 'react'
import { __fmt, evalNodes, parseAst, pluralChoice, selectChoice } from './format.js'

function evalRich(nodes, params, locale, pound, out) {
  for (const n of nodes) {
    switch (n.type) {
      case 8: {
        const kids = []
        evalRich(n.children || [], params, locale, pound, kids)
        const fn = params ? params[n.value] : undefined
        out.push(
          typeof fn === 'function' ? fn(kids.length === 1 ? kids[0] : kids) : kids
        )
        break
      }
      case 5: {
        const opt = selectChoice(n, params)
        if (opt) evalRich(opt.value, params, locale, pound, out)
        break
      }
      case 6: {
        const { opt, pound: num } = pluralChoice(n, params, locale)
        if (opt) evalRich(opt.value, params, locale, num, out)
        break
      }
      case 1: {
        // A parameter may itself be a React node in rich messages.
        const v = params ? params[n.value] : undefined
        out.push(v == null ? '' : typeof v === 'object' ? v : String(v))
        break
      }
      default:
        out.push(evalNodes([n], params, locale, pound))
    }
  }
  return out
}

export function __icuRich(serialized, params, locale) {
  if (serialized == null) return null
  const ast = Array.isArray(serialized) ? serialized : parseAst(serialized)
  if (!ast) return __fmt(serialized, params)
  const nodes = evalRich(ast, params, locale, undefined, [])
  // Spread as children args so React treats them as static children and
  // does not ask for keys.
  return createElement(Fragment, null, ...nodes)
}
