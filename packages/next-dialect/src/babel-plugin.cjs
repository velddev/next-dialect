// Babel front-end for the next-dialect transform.
//
// Requires a .babelrc, which disables Next's SWC pipeline for the whole app.
// Prefer the loader front-end (compiler: 'loader' in withDialect) unless you
// already run Babel for other reasons; both share src/compiler/transform.cjs.
const createDialectTransform = require('./compiler/transform.cjs')

module.exports = function nextDialectBabelPlugin(api) {
  return createDialectTransform(api)
}
