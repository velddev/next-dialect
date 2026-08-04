import PageBody from '../../components/PageBody'

// Same route shape as every other target, but the text never changes: this
// app has no i18n at all, so /nl renders the same English strings.
export default function Page() {
  return <PageBody />
}
