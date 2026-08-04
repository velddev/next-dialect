import createMDX from '@next/mdx'
import remarkGfm from 'remark-gfm'
import rehypeInkHighlight from './lib/rehype-ink-highlight.mjs'

// remark-gfm is what turns the pipe tables in the docs into real tables —
// MDX on its own is CommonMark, which has none. The highlighter tints code
// blocks with the same .tok-* classes the landing page's figures use.
const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeInkHighlight],
  },
})

/** @type {import('next').NextConfig} */
export default withMDX({
  output: 'export',
  // .mdx joins the page extensions so app/docs/**/page.mdx routes directly.
  pageExtensions: ['jsx', 'js', 'mdx'],
})
