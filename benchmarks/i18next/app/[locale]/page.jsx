import PageBody from '../../components/PageBody'
import { setServerLocale } from '../../lib/i18n-server'

export default async function Page({ params }) {
  const { locale } = await params
  setServerLocale(locale)
  return <PageBody />
}
