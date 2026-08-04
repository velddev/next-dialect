import { setRequestLocale } from '../../lib/server-intl'
import PageBody from '../../components/PageBody'

export default async function Page({ params }) {
  const { locale } = await params
  // Runs before PageBody renders, so the server IntlShape resolves this locale.
  setRequestLocale(locale)
  return <PageBody />
}
