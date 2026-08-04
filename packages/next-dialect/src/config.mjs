// withDialect(nextConfig, dialectConfig): the only configuration surface.
// Publishes settings via env (read by the compiler, runtimes, proxy and CLI)
// and wires the chosen compiler front-end.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LOADER = fileURLToPath(new URL('./loader.cjs', import.meta.url))

export function withDialect(nextConfig = {}, dialect = {}) {
  const d = {
    locales: dialect.locales || [],
    defaultLocale: dialect.defaultLocale || (dialect.locales && dialect.locales[0]) || 'en',
    messages: dialect.messages || './messages',
    localePrefix: dialect.localePrefix || 'always', // 'always' | 'as-needed'
    localeParam: dialect.localeParam || 'locale',
    // 'loader' keeps Next on SWC (recommended); 'babel' suits projects that
    // already run Babel and want the plugin in their own pipeline.
    compiler: dialect.compiler || 'loader',
    detection: { cookie: 'DIALECT_LOCALE', acceptLanguage: true, ...(dialect.detection || {}) },
  }
  if (!d.locales.length) throw new Error('[next-dialect] withDialect: `locales` is required.')

  process.env.DIALECT_MESSAGES = path.resolve(d.messages)
  process.env.DIALECT_DEFAULT = d.defaultLocale
  process.env.DIALECT_LOCALES = d.locales.join(',')
  process.env.DIALECT_PARAM = d.localeParam
  process.env.DIALECT_PREFIX = d.localePrefix
  process.env.DIALECT_COOKIE = d.detection.cookie

  // Substituting messages changes string lengths after the bundle (and its
  // map) were generated, so any client source map is stale for localized
  // chunks. Next disables browser maps in production by default; warn only
  // when a project has deliberately turned them on.
  if (nextConfig.productionBrowserSourceMaps) {
    console.warn(
      '[next-dialect] productionBrowserSourceMaps is enabled: source maps for chunks that ' +
        'contain messages will not line up, because message text is substituted after bundling.'
    )
  }

  const cfg = {
    ...nextConfig,
    transpilePackages: [...new Set([...(nextConfig.transpilePackages || []), 'next-dialect'])],
  }

  if (d.compiler === 'loader') {
    const userWebpack = nextConfig.webpack
    cfg.webpack = (config, ctx) => {
      config.module.rules.push({
        test: /\.(m?[jt]sx?)$/,
        exclude: /node_modules/,
        enforce: 'pre', // run before Next's SWC loader, on original source
        use: [{ loader: LOADER }],
      })
      return userWebpack ? userWebpack(config, ctx) : config
    }
  }

  // Non-enumerable so Next's config validation does not warn about it.
  Object.defineProperty(cfg, '__dialect', { value: d, enumerable: false })
  return cfg
}
