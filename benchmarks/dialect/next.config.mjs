import { withDialect } from 'next-dialect/config'

export default withDialect(
  {},
  {
    locales: ['en', 'nl'],
    defaultLocale: 'en',
    messages: '../shared/messages',
    localePrefix: 'always',
    compiler: 'loader',
  }
)
