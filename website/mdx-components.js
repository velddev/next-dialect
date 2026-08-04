import InkLink from './app/InkLink'

// The prose element map for every .mdx page.
//
// Vertical rhythm, same rules as the landing page: line-heights and margins
// are multiples of 24, and each element carries a `top-[Npx]` nudge that puts
// its *baseline* on the ruling. The nudge is the font's baseline offset inside
// its line box, subtracted from 24 — constant per (family, size, leading)
// pair, which is why it can live in a class instead of being tuned by hand:
//
//   Prata 42/48 -> 11    Prata 28/48 -> 15    Prata 20/24 -> 6
//   Lato  18/24 ->  5    Lato  15/24 ->  6
//
// `relative` shifts render position only, so flow height stays a whole number
// of rows and the elements below keep their own alignment.
// The small-screen size keeps leading-12 but changes the baseline offset, so
// it needs its own nudge — 32px of Prata sits 3px lower in the same box.
const H1 =
  'relative top-[11px] mb-6 font-display text-[42px] leading-12 max-sm:top-[14px] max-sm:text-[32px]'
const H2 = 'relative top-[15px] mt-18 mb-6 font-display text-[28px] leading-12'
const H3 = 'relative top-[6px] mt-12 mb-6 font-display text-[20px] leading-6'
const P = 'relative top-[5px] mb-6 text-[18px] leading-6'
const LI = 'relative top-[5px] text-[18px] leading-6'
// Code panels are pasted-in objects rather than running text, so they keep
// their own internal rhythm — only their outer height stays on the grid.
// Long lines wrap rather than scroll: a horizontal scrollbar is 15px of
// layout on Windows and 0 on a Mac, which would put every row below the panel
// on a different rule depending on the reader's platform.
const PRE =
  'code-panel my-12 p-6 font-mono text-[15px] leading-6 break-words whitespace-pre-wrap text-ink'
const CODE = 'font-mono text-[15px] leading-none'
// Uneven padding on purpose: padding-top plus the 18px baseline offset has to
// land on 24 for the row to sit on a rule, and 5 + 24 + 18 + the 1px rule
// makes the row a whole 48px. border-separate keeps that 1px inside the cell
// instead of splitting it between neighbours.
const CELL = 'border-b border-ink/10 pt-[5px] pb-[18px] pr-6 align-top text-[18px] leading-6'

export function useMDXComponents(components) {
  return {
    h1: (props) => <h1 className={H1} {...props} />,
    h2: (props) => <h2 className={H2} {...props} />,
    h3: (props) => <h3 className={H3} {...props} />,
    p: (props) => <p className={P} {...props} />,
    ul: (props) => <ul className="mb-6 list-disc pl-6 marker:text-muted" {...props} />,
    ol: (props) => <ol className="mb-6 list-decimal pl-6 marker:text-muted" {...props} />,
    li: (props) => <li className={LI} {...props} />,
    a: ({ href, children }) => <InkLink href={href}>{children}</InkLink>,
    strong: (props) => <strong className="font-bold" {...props} />,
    // MDX emits <pre><code>; the panel styling belongs to the <pre>, and the
    // inner <code> must not re-apply the inline size.
    pre: (props) => <pre className={PRE} {...props} />,
    code: ({ className, ...props }) =>
      className ? (
        <code className={className} {...props} />
      ) : (
        <code className={CODE} {...props} />
      ),
    blockquote: (props) => (
      <blockquote
        className="my-12 border-l border-ink/20 pl-6 text-ink/75 [&>p:last-child]:mb-0"
        {...props}
      />
    ),
    table: (props) => (
      <div className="my-12 overflow-x-auto">
        {/* Auto layout squeezes the key column down to whatever the prose
            column leaves it, which breaks short identifiers across two lines
            for no reason. A floor of 12rem clears the longest of them. */}
        <table
          className="w-full border-separate border-spacing-0 text-left [&_td:first-child]:min-w-48 [&_th:first-child]:min-w-48"
          {...props}
        />
      </div>
    ),
    th: (props) => <th className={`${CELL} font-normal text-muted`} {...props} />,
    td: (props) => <td className={CELL} {...props} />,
    // A ruled break with no height of its own, so it cannot knock the page
    // off the grid the way a 1px border in flow would.
    hr: () => (
      <hr className="relative my-12 h-0 border-0 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-ink/10" />
    ),
    ...components,
  }
}
