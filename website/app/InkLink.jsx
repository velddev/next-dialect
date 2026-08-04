// An inline link underlined by a single hand-drawn stroke that draws itself
// on hover.
//
// The stroke is a real <svg> rather than a background image, because drawing
// it means animating stroke-dashoffset — set the dash to the path's length and
// walk the offset from that length to zero and the line appears end to end at
// its true size. Scaling a background instead squashes the wobble as it grows,
// which is what gives the game away.
const POINTS =
  '0,11.4 12.5,11.5 25,13.8 37.5,12.1 50,12.5 62.5,12.7 75,12.2 87.5,12.2 100,14.8 ' +
  '112.5,15.2 125,14.9 137.5,12.1 150,9.3 162.5,13 175,14.2 187.5,15 200,12.6'
const LENGTH = 202.1

export default function InkLink({ href, children, className = '', ...rest }) {
  return (
    <a className={`ink-link ${className}`.trim()} href={href} {...rest}>
      {children}
      <svg
        className="ink-link-stroke"
        viewBox="0 0 200 20"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* The length is handed over as a custom property, not as inline
            stroke-dashoffset: an inline style outranks every stylesheet rule,
            so setting the offset here would make the :hover rule unable to
            move it and the line could never draw. */}
        <polyline
          points={POINTS}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ '--stroke-len': LENGTH }}
        />
      </svg>
    </a>
  )
}
