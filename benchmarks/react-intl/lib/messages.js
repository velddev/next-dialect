// Loaded on the server, then handed to <IntlProvider> as a prop. This is the
// whole flat catalog for the active locale -- react-intl has no notion of
// "only the messages this page uses", and that default is what we measure.
export async function getMessages(locale) {
  return (await import(`../messages/${locale}.json`)).default
}
