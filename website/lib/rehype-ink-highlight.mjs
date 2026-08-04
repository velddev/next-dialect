// Syntax highlighting for MDX code blocks, in the four colours the site
// already owns: .tok-kw, .tok-str, .tok-tag and .tok-com from globals.css.
//
// The landing page's figures are tinted with those spans by hand. This plugin
// does the same thing for the docs, from the same palette — which is the whole
// reason it is 120 lines of regex instead of a real highlighter: Shiki would
// bring its own themes and inline hex colours, and the paper palette would
// have to be smuggled back in through a custom theme. Four token classes over
// five languages does not need a grammar.

const KEYWORDS = new Set([
  'import', 'export', 'from', 'default', 'const', 'let', 'var', 'function',
  'return', 'async', 'await', 'new', 'type', 'interface', 'extends', 'as',
  'if', 'else', 'for', 'of', 'in', 'class', 'this', 'typeof', 'true', 'false',
  'null', 'undefined',
])

const COMMANDS = new Set([
  'npm', 'npx', 'yarn', 'pnpm', 'node', 'next', 'next-dialect', 'set', 'cd',
])

const JS_RE = new RegExp(
  [
    '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)', // 1 comment
    '(\'(?:\\\\.|[^\'\\\\])*\'|"(?:\\\\.|[^"\\\\])*"|`(?:\\\\.|[^`\\\\])*`)', // 2 string
    '(<\\/?[A-Za-z][\\w.]*(?:\\s*\\/?>)?)', // 3 JSX tag
    '([A-Za-z_$][\\w$]*)', // 4 identifier
  ].join('|'),
  'g'
)

// A string that a `:` follows is a JSON property name, not a value.
function tokenizeJs(src, json) {
  const out = []
  const push = (value, cls) => value && out.push({ value, cls })
  let last = 0
  let m
  JS_RE.lastIndex = 0
  while ((m = JS_RE.exec(src))) {
    push(src.slice(last, m.index), null)
    last = JS_RE.lastIndex
    if (m[1]) push(m[1], 'tok-com')
    else if (m[2]) push(m[2], json && /^\s*:/.test(src.slice(last)) ? 'tok-tag' : 'tok-str')
    else if (m[3]) push(m[3], 'tok-tag')
    else push(m[4], KEYWORDS.has(m[4]) ? 'tok-kw' : null)
  }
  push(src.slice(last), null)
  return out
}

const SH_RE = /(#[^\n]*)|('[^']*'|"[^"]*")|([A-Za-z][\w.-]*)/g

// A word only reads as a command in command position — the start of a line or
// just after &&, ; or a pipe. Otherwise `npm install next-dialect` would tint
// the package name as if it were a second command.
function isCommandPosition(src, index) {
  const before = src.slice(0, index).replace(/[^\S\n]+$/, '')
  return before === '' || /[\n;&|]$/.test(before)
}

function tokenizeShell(src) {
  const out = []
  const push = (value, cls) => value && out.push({ value, cls })
  let last = 0
  let m
  SH_RE.lastIndex = 0
  while ((m = SH_RE.exec(src))) {
    push(src.slice(last, m.index), null)
    last = SH_RE.lastIndex
    if (m[1]) push(m[1], 'tok-com')
    else if (m[2]) push(m[2], 'tok-str')
    else push(m[3], COMMANDS.has(m[3]) && isCommandPosition(src, m.index) ? 'tok-kw' : null)
  }
  push(src.slice(last), null)
  return out
}

const LANGS = {
  js: 'js', jsx: 'js', javascript: 'js', mjs: 'js',
  ts: 'js', tsx: 'js', typescript: 'js',
  json: 'json', jsonc: 'json',
  bash: 'sh', sh: 'sh', shell: 'sh', console: 'sh',
}

function languageOf(node) {
  const classes = node.properties?.className
  const list = Array.isArray(classes) ? classes : classes ? [String(classes)] : []
  for (const c of list) {
    if (String(c).startsWith('language-')) return LANGS[String(c).slice(9)]
  }
  return undefined
}

function text(node) {
  if (node.type === 'text') return node.value
  return (node.children || []).map(text).join('')
}

export default function rehypeInkHighlight() {
  return (tree) => {
    const walk = (node) => {
      for (const child of node.children || []) {
        if (child.type === 'element' && child.tagName === 'code' && node.tagName === 'pre') {
          const lang = languageOf(child)
          if (lang) {
            const src = text(child)
            const tokens = lang === 'sh' ? tokenizeShell(src) : tokenizeJs(src, lang === 'json')
            child.children = tokens.map((t) =>
              t.cls
                ? {
                    type: 'element',
                    tagName: 'span',
                    properties: { className: [t.cls] },
                    children: [{ type: 'text', value: t.value }],
                  }
                : { type: 'text', value: t.value }
            )
          }
          continue
        }
        walk(child)
      }
    }
    walk(tree)
  }
}
