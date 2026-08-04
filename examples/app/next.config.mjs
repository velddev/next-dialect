import { withDialect } from 'next-dialect/config'

const ssr = process.env.DIALECT_SSR === '1'

export default withDialect(
  {
    // Two flows from one app:
    //  - default: static export -> per-locale trees in dist/
    //  - DIALECT_SSR=1: server build + `next-dialect start` (bundle proxy);
    //    the *.ssr.jsx pages (force-dynamic, ISR) exist only in this flow.
    output: ssr ? undefined : 'export',
    pageExtensions: ssr ? ['ssr.jsx', 'jsx', 'js'] : ['jsx', 'js'],
  },
  {
    locales: ['en', 'nl'],
    defaultLocale: 'en',
    messages: './messages',
    localePrefix: 'always',
    compiler: 'loader', // keeps Next on SWC; 'babel' also available
  }
)
