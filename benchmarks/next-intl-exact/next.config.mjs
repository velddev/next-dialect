import createNextIntlPlugin from 'next-intl/plugin'

// Default request-config location (./i18n/request.js) is auto-detected.
const withNextIntl = createNextIntlPlugin()

export default withNextIntl({})
