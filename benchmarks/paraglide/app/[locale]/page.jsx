import { setRequestLocale } from '../../request-locale.js'
import PageBody from '../../components/PageBody'

export default async function Page({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  return <PageBody />
}
