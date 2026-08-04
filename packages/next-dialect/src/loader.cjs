// Webpack/Turbopack-style loader front-end for the next-dialect transform.
//
// Runs as an `enforce: 'pre'` loader on app source only, so Next keeps using
// SWC for the actual compile — unlike the Babel plugin, which forces the
// whole project onto Babel. Files that never mention next-dialect are passed
// through untouched, so the parse cost lands on a handful of modules.
//
// The client/server split comes from the webpack layer Next assigns:
// 'app-pages-browser' is the browser bundle; 'rsc'/'ssr' are server layers.
const createDialectTransform = require('./compiler/transform.cjs')

let babel = null
function getBabel() {
  if (!babel) {
    try {
      babel = require('next/dist/compiled/babel/core')
    } catch {
      babel = require('@babel/core')
    }
  }
  return babel
}

const BROWSER_LAYERS = new Set(['app-pages-browser', 'client', 'pages-dir-browser'])

module.exports = function dialectLoader(source, inputSourceMap) {
  const callback = this.async()
  // Cheap bail-out: modules that neither reference the package nor sit at a
  // [locale] segment boundary cannot need this pass.
  if (
    !source.includes('next-dialect') &&
    !createDialectTransform.isSegmentEntry(this.resourcePath)
  ) {
    return callback(null, source, inputSourceMap)
  }

  const layer = (this._module && this._module.layer) || ''
  const isServer = !BROWSER_LAYERS.has(layer)
  const file = this.resourcePath || ''
  const isTs = /\.[cm]?tsx?$/.test(file)
  const isJsx = /x$/.test(file) || /\.[cm]?jsx?$/.test(file)

  const parserPlugins = []
  if (isTs) parserPlugins.push('typescript')
  if (isJsx || /\.tsx$/.test(file)) parserPlugins.push('jsx')

  try {
    const result = getBabel().transformSync(source, {
      filename: file,
      configFile: false,
      babelrc: false,
      compact: false,
      sourceMaps: false,
      // No presets: syntax is preserved and handed to SWC afterwards; this
      // pass only rewrites t(...) call sites and wraps [locale] entries.
      parserOpts: { sourceType: 'module', plugins: parserPlugins },
      generatorOpts: { jsescOption: { minimal: true } },
      plugins: [
        function dialectPlugin(api) {
          return createDialectTransform(api, { isServer, filename: file })
        },
      ],
    })
    callback(null, result && result.code != null ? result.code : source, inputSourceMap)
  } catch (err) {
    callback(err)
  }
}
