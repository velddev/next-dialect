// The next-dialect transform, shared by both compiler front-ends
// (src/babel-plugin.cjs and src/loader.cjs). Nothing here is Next-specific
// beyond the [locale] segment convention.
//
// Client production bundles — call sites compile to sentinel tokens that the
// bundle proxy (or the static fork) resolves per locale:
//   static message           -> "key"                (bare literal)
//   simple {arg} message     -> __fmt("key", params)
//   ICU (plural/select/...)  -> __icu("key", params, "@locale")
//   t.rich(...)              -> __icuRich(..., params, "@locale")  -> React nodes
//   t(`status.${s}`)         -> object literal bounded by the static prefix
//   t.dynamic(expr)          -> object literal of the whole catalog (opt-in)
//   t.locale                 -> "@locale" (a constant per locale)
//   t(unboundedExpr)         -> compile error
//
// Server layer — entries under [locale] are wrapped so the request locale is
// bound before render; t stays a runtime lookup there, so server-rendered
// HTML always contains real strings (required for streaming, ISR and
// force-dynamic).
const path = require('node:path')
const { loadResolved } = require('./catalog.cjs')
const { analyze } = require('./icu.cjs')
const { TOK, LOCALE_TOK } = require('./tokens.cjs')

const PKG = 'next-dialect'

let catalogCache = null
function getCatalog() {
  if (!catalogCache) {
    const dir = process.env.DIALECT_MESSAGES || path.resolve(process.cwd(), 'messages')
    const def = process.env.DIALECT_DEFAULT || 'en'
    catalogCache = loadResolved(dir, def, def)
  }
  return catalogCache
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Entries under the [locale] segment must be wrapped even when they never
// import `t` themselves — they are where the request locale gets bound.
function segmentEntryRe() {
  const param = process.env.DIALECT_PARAM || 'locale'
  return new RegExp(
    '/app/(?:.*/)?\\[' +
      escapeRe(param) +
      '\\](?:/.*)?/(layout|page|template)(?:\\.[a-z0-9]+)?\\.[jt]sx?$'
  )
}

function isSegmentEntry(filename) {
  return segmentEntryRe().test((filename || '').split('\\').join('/'))
}

module.exports = createDialectTransform
module.exports.isSegmentEntry = isSegmentEntry

function createDialectTransform(api, options = {}) {
  const { types: t } = api
  const isServer =
    options.isServer !== undefined
      ? options.isServer
      : typeof api.caller === 'function'
        ? api.caller((c) => !!(c && c.isServer))
        : false
  const isProduction =
    options.isProduction !== undefined
      ? options.isProduction
      : process.env.NODE_ENV === 'production'

  // ---- server layer: bind the locale on every [locale] segment entry ----
  if (isServer) {
    return {
      name: 'next-dialect',
      visitor: {
        Program: {
          exit(programPath, state) {
            const file = (state.filename || options.filename || '').split('\\').join('/')
            // Segments render independently (a page can execute before its
            // layout), so every segment entry binds the locale itself; only
            // the layout mounts the client provider.
            const m = segmentEntryRe().exec(file)
            if (!m) return
            const isLayout = m[1] === 'layout'
            const param = process.env.DIALECT_PARAM || 'locale'

            const exportPath = programPath
              .get('body')
              .find((p) => p.isExportDefaultDeclaration())
            if (!exportPath) return
            if (programPath.node.__dialectWrapped) return
            programPath.node.__dialectWrapped = true

            const decl = exportPath.node.declaration
            const origExpr =
              t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)
                ? t.toExpression(decl)
                : decl

            const ns = programPath.scope.generateUidIdentifier('dialect')
            const orig = programPath.scope.generateUidIdentifier('DialectOrigEntry')
            const props = t.identifier('props')
            const p = t.identifier('__dialect_params')
            const loc = t.identifier('__dialect_locale')
            const member = (name) => t.memberExpression(t.cloneNode(ns), t.identifier(name))

            const wrapper = t.exportDefaultDeclaration(
              t.functionDeclaration(
                t.identifier('DialectLocaleEntry'),
                [props],
                t.blockStatement([
                  // await tolerates both a promise and a plain params object
                  t.variableDeclaration('const', [
                    t.variableDeclarator(
                      p,
                      t.awaitExpression(
                        t.memberExpression(t.cloneNode(props), t.identifier('params'))
                      )
                    ),
                  ]),
                  t.variableDeclaration('const', [
                    t.variableDeclarator(
                      loc,
                      t.callExpression(member('bind'), [
                        t.logicalExpression(
                          '&&',
                          t.cloneNode(p),
                          t.memberExpression(t.cloneNode(p), t.stringLiteral(param), true)
                        ),
                      ])
                    ),
                  ]),
                  t.returnStatement(
                    isLayout
                      ? t.callExpression(member('el'), [
                          member('Provider'),
                          t.objectExpression([
                            t.objectProperty(t.identifier('locale'), t.cloneNode(loc)),
                            t.objectProperty(
                              t.identifier('messages'),
                              t.callExpression(member('dev'), [t.cloneNode(loc)])
                            ),
                          ]),
                          t.callExpression(member('el'), [t.cloneNode(orig), t.cloneNode(props)]),
                        ])
                      : t.callExpression(member('el'), [t.cloneNode(orig), t.cloneNode(props)])
                  ),
                ]),
                false,
                true // async
              )
            )

            exportPath.replaceWithMultiple([
              t.variableDeclaration('const', [t.variableDeclarator(orig, origExpr)]),
              wrapper,
            ])
            programPath.unshiftContainer(
              'body',
              t.importDeclaration(
                [t.importNamespaceSpecifier(t.cloneNode(ns))],
                t.stringLiteral(PKG + '/internal')
              )
            )
          },
        },
      },
    }
  }

  // ---- client layer: call-site compilation -----------------------------
  function isTImport(name, scope) {
    const b = scope.getBinding(name)
    return (
      !!b &&
      b.path.isImportSpecifier() &&
      b.path.node.imported.name === 't' &&
      b.path.parentPath.node.source.value === PKG
    )
  }

  function ensureImport(callPath, state, exported, localName, source) {
    state.__dialectImports = state.__dialectImports || {}
    if (!state.__dialectImports[exported]) {
      const program = callPath.findParent((pp) => pp.isProgram())
      program.unshiftContainer(
        'body',
        t.importDeclaration(
          [t.importSpecifier(t.identifier(localName), t.identifier(exported))],
          t.stringLiteral(source)
        )
      )
      state.__dialectImports[exported] = localName
    }
    return t.identifier(state.__dialectImports[exported])
  }

  function tokenObject(entries, prefixLen, suffixLen) {
    return t.objectExpression(
      entries.map((k) =>
        t.objectProperty(
          t.stringLiteral(k.slice(prefixLen, suffixLen ? k.length - suffixLen : undefined)),
          t.stringLiteral(TOK(k))
        )
      )
    )
  }

  // Resolves the key argument to { expr, kinds } or throws with guidance.
  function resolveKey(callPath, keyArg, catalog, calleeLabel) {
    if (t.isStringLiteral(keyArg)) {
      const msg = catalog[keyArg.value]
      if (msg === undefined) {
        throw callPath.buildCodeFrameError(
          `[next-dialect] Unknown message key "${keyArg.value}" (checked the default-locale catalog with fallbacks resolved).`
        )
      }
      return { expr: t.stringLiteral(TOK(keyArg.value)), kinds: [analyze(msg).kind] }
    }

    if (t.isTemplateLiteral(keyArg)) {
      if (keyArg.expressions.length !== 1) {
        throw callPath.buildCodeFrameError(
          '[next-dialect] Template keys support exactly one ${...} segment.'
        )
      }
      const pre = keyArg.quasis[0].value.cooked
      const post = keyArg.quasis[1].value.cooked
      if (!pre) {
        throw callPath.buildCodeFrameError(
          '[next-dialect] Template keys need a static prefix (e.g. t(`status.${x}`)) so the compiler can bound the key space.'
        )
      }
      const entries = Object.keys(catalog).filter(
        (k) => k.startsWith(pre) && k.endsWith(post) && k.length > pre.length + post.length
      )
      if (entries.length === 0) {
        throw callPath.buildCodeFrameError(
          `[next-dialect] No message keys match the pattern "${pre}*${post}".`
        )
      }
      return {
        expr: t.memberExpression(
          tokenObject(entries, pre.length, post.length),
          keyArg.expressions[0],
          true
        ),
        kinds: entries.map((k) => analyze(catalog[k]).kind),
      }
    }

    throw callPath.buildCodeFrameError(
      `[next-dialect] ${calleeLabel} needs a statically bounded key: a string literal, or a template literal with a static prefix (e.g. t(\`status.\${x}\`)). For a genuinely unbounded key use t.dynamic(key), which inlines the catalog into this chunk on purpose.`
    )
  }

  return {
    name: 'next-dialect',
    visitor: {
      // t.locale -> a constant per locale
      MemberExpression(mp) {
        if (!isProduction) return
        const n = mp.node
        if (n.computed || !t.isIdentifier(n.property, { name: 'locale' })) return
        if (!t.isIdentifier(n.object) || !isTImport(n.object.name, mp.scope)) return
        mp.replaceWith(t.stringLiteral(LOCALE_TOK))
      },

      CallExpression(callPath, state) {
        if (!isProduction) return
        const node = callPath.node
        const callee = node.callee

        let mode = null
        if (t.isIdentifier(callee)) {
          if (isTImport(callee.name, callPath.scope)) mode = 'plain'
        } else if (
          t.isMemberExpression(callee) &&
          !callee.computed &&
          t.isIdentifier(callee.object) &&
          t.isIdentifier(callee.property) &&
          isTImport(callee.object.name, callPath.scope)
        ) {
          if (callee.property.name === 'rich') mode = 'rich'
          else if (callee.property.name === 'dynamic') mode = 'dynamic'
        }
        if (!mode) return

        const catalog = getCatalog()
        const [keyArg, paramsArg] = node.arguments
        if (!keyArg) return
        const params = paramsArg || t.unaryExpression('void', t.numericLiteral(0))

        // t.rich: always routed through the rich evaluator, which returns
        // React children so tag callbacks can wrap them.
        if (mode === 'rich') {
          const { expr } = resolveKey(callPath, keyArg, catalog, 't.rich')
          const rich = ensureImport(callPath, state, '__icuRich', '__dialect_rich', PKG + '/rich')
          callPath.replaceWith(
            t.callExpression(rich, [expr, params, t.stringLiteral(LOCALE_TOK)])
          )
          return
        }

        // t.dynamic: the documented escape hatch. Bounded by an optional
        // static prefix, otherwise the whole catalog lands in this chunk.
        if (mode === 'dynamic') {
          const prefixArg = node.arguments[2]
          const prefix = t.isStringLiteral(prefixArg) ? prefixArg.value : ''
          const entries = Object.keys(catalog).filter((k) => k.startsWith(prefix))
          if (entries.length === 0) {
            throw callPath.buildCodeFrameError(
              `[next-dialect] t.dynamic: no message keys start with "${prefix}".`
            )
          }
          const bytes = entries.reduce((n, k) => n + k.length + String(catalog[k]).length + 6, 0)
          console.warn(
            `[next-dialect] t.dynamic(${prefix ? `…, "${prefix}"` : '…'}) inlines ${entries.length} messages (~${(
              bytes / 1024
            ).toFixed(1)}KB before compression) into ${
              (state.filename || '').split(/[\\/]/).pop() || 'this chunk'
            }.`
          )
          // Keys stay full so callers pass the same key they would to t().
          const lookup = t.memberExpression(tokenObject(entries, 0, 0), keyArg, true)
          const icu = ensureImport(callPath, state, '__icu', '__dialect_icu', PKG + '/format')
          callPath.replaceWith(
            t.callExpression(icu, [lookup, params, t.stringLiteral(LOCALE_TOK)])
          )
          return
        }

        // plain t(): emit the cheapest runtime the message kinds allow.
        const { expr, kinds } = resolveKey(callPath, keyArg, catalog, 't()')
        if (kinds.includes('icu')) {
          const icu = ensureImport(callPath, state, '__icu', '__dialect_icu', PKG + '/format')
          callPath.replaceWith(
            t.callExpression(icu, [expr, params, t.stringLiteral(LOCALE_TOK)])
          )
        } else if (kinds.includes('params') && paramsArg) {
          const fmt = ensureImport(callPath, state, '__fmt', '__dialect_fmt', PKG + '/format')
          callPath.replaceWith(t.callExpression(fmt, [expr, paramsArg]))
        } else {
          callPath.replaceWith(expr)
        }
      },
    },
  }
}
