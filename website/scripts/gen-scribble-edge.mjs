// Generates the ragged silhouette for the scribble buttons and writes it into
// app/globals.css (the line after the `scribble-edge` marker).
//
//   node website/scripts/gen-scribble-edge.mjs [seed]
//
// The pseudo-element already overshoots the button by 5–7px, so jittering the
// edge inward by 0–8px makes the fill wander between just past the border and
// just short of it — the way a hand-filled shape actually lands. Amplitude is
// deliberately smaller than the code panels': these boxes are 48px tall, and
// the panel's ~10px bites would eat a button.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SEED = Number(process.argv[2] || 7321)

function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(SEED)
// Mostly shallow wobble, with the occasional deeper bite where a stroke
// stopped short.
const jitter = () => {
  const r = rand()
  return +(r * r * 8 + rand() * 1.6).toFixed(1)
}

const pts = []
for (let x = 0; x <= 100; x += 1.6 + rand() * 1.6) pts.push(`${x.toFixed(1)}% ${jitter()}px`)
for (let y = 3; y <= 100; y += 5 + rand() * 5) pts.push(`calc(100% - ${jitter()}px) ${y.toFixed(1)}%`)
for (let x = 100; x >= 0; x -= 1.6 + rand() * 1.6)
  pts.push(`${x.toFixed(1)}% calc(100% - ${jitter()}px)`)
for (let y = 97; y >= 3; y -= 5 + rand() * 5) pts.push(`${jitter()}px ${y.toFixed(1)}%`)

const edgeCss = `    clip-path: polygon(${pts.join(', ')});`

// --- the reveal mask -------------------------------------------------------
// A single shape sliding across never reads as drawing — it reads as a shape
// sliding across. What we want is the *order the pen visits the area*.
//
// CSS cannot threshold a luminance field at an animated value (there is no
// animatable clamp for mask-mode: luminance, and filter primitives inside a
// data-URI SVG are unreachable from CSS). So the ordering is baked into
// discrete frames instead: the mask is a filmstrip where frame k shows the
// first k strokes of the scribble, and `steps()` walks it. Same control a
// clamp would give — each frame is authored — and it animates natively.
// A straight gradient boundary reads as a wipe. This is a sawtooth instead:
// the edge zigzags up and down while trending diagonally, so the fill arrives
// the way a pen scribbles — back and forth as it advances. Blurred so the
// teeth still fade in rather than snapping.
// The mask is 4x the button wide and 2x tall (see mask-size), so the button
// sees a 75x50 window of this 300x100 viewBox. Keeping the boundary inside
// 75..225 guarantees the button is fully clear at rest and fully filled at
// the end, whatever the vertical offset is doing.
const TEETH = 10
const AMPLITUDE = 24 // horizontal excursion of each tooth, in viewBox units
// NEGATIVE slant: the boundary reaches further right at the TOP, so the top
// rows clear first and the stroke starts in the top-left corner. A positive
// slant fills bottom-first regardless of where the mask is positioned.
const SLANT = -42
const MEAN = 170
// Draw well past the viewBox on all sides. The blur fades alpha near the
// shape's own edges, and if those edges sit at the frame the button never
// reaches full opacity — it finished the animation only half inked.
const OVERDRAW = 120
const Y0 = -20
const Y1 = 120

const FRAME = 100 // each frame is FRAMExFRAME viewBox units, stretched to the button
const NIB = 32 // pen width, in viewBox units

// Strokes must sit on the hatch angle (45deg as rendered). The frame is a
// square stretched onto a wide, short button, so a 45deg rendered stroke is
// much steeper in viewBox units: slope = width/height of the button.
const ASPECT = 118 / 48
// One continuous pen: down-right, up-right, down-right... It never returns to
// ground it has already covered (that would be starting over), but it very
// much reverses vertically — that reversal IS the scribble. Parallel strokes
// laid in order are just a wipe.
//
// The catch is geometric: a full-height stroke at 45deg advances FRAME/ASPECT
// (~41 of 100 units), so only ~2.5 fit across. Wanting several visible
// zigzags means accepting a steeper stroke. STROKES picks that trade:
//   3 -> ~51deg   4 -> ~58deg   6 -> ~68deg   10 -> ~78deg (near vertical)
const STROKES = 8
const OVER = 10 // turn around off-canvas, so the visible stroke is full height
const PAD = 16 // start left of the frame and finish right of it
const ADVANCE = (FRAME + PAD * 2) / STROKES

const jit = () => (rand() - 0.5) * 6
const pen = []
for (let i = 0; i <= STROKES; i++) {
  pen.push({
    x: +(-PAD + ADVANCE * i + jit()).toFixed(1),
    y: i % 2 === 0 ? FRAME + OVER : -OVER, // starts bottom-left, heads up-right
  })
}

// Segment lengths, so frames can advance the pen at a constant rate rather
// than jumping a whole stroke at a time.
const segLen = pen.slice(1).map((p, i) => Math.hypot(p.x - pen[i].x, p.y - pen[i].y))
const total = segLen.reduce((a, b) => a + b, 0)

/** Where the nib is after travelling `dist` along the path. */
function pathTo(dist) {
  const out = [pen[0]]
  let left = dist
  for (let i = 0; i < segLen.length; i++) {
    if (left >= segLen[i]) {
      out.push(pen[i + 1])
      left -= segLen[i]
    } else {
      const t = left / segLen[i]
      out.push({
        x: +(pen[i].x + (pen[i + 1].x - pen[i].x) * t).toFixed(1),
        y: +(pen[i].y + (pen[i + 1].y - pen[i].y) * t).toFixed(1),
      })
      break
    }
  }
  return out
}

const SUB = 3 // frames per stroke, so the pen glides instead of teleporting
const FRAMES = STROKES * SUB + 1 // frame 0 is blank: nothing inked yet

// frame k draws pen[0..k]; frame 0 draws nothing
const frames = []
for (let k = 0; k < FRAMES; k++) {
  const pts = k === 0 ? [] : pathTo((total * k) / (FRAMES - 1))
  const drawn =
    pts.length < 2
      ? ''
      : `<polyline points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#fff" stroke-width="${NIB}" stroke-linecap="round" stroke-linejoin="round"/>`
  // Each frame is clipped to its own cell. Without this the blur bleeds
  // across frame boundaries and frame 0 — which must be blank — picks up
  // ink from frame 1, so the button is never truly empty at rest.
  frames.push(
    `<g transform="translate(${k * FRAME},0)" clip-path="url(#cell)">` +
      (drawn ? `<g filter="url(#s)">${drawn}</g>` : '') +
      `</g>`
  )
}

// Blur the zigzag into a gradient, then posterize that gradient: feFuncA
// with type="discrete" quantises the alpha ramp into a handful of steps, so
// the edge arrives as a few hard-edged bands — ink laid down in passes —
// instead of an airbrushed fade. STEPS controls how many passes.
const STEPS = 5
const table = Array.from({ length: STEPS }, (_, i) => (i / (STEPS - 1)).toFixed(2)).join(' ')

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRAMES * FRAME} ${FRAME}" preserveAspectRatio="none">` +
  `<defs>` +
  `<clipPath id="cell"><rect x="0" y="0" width="${FRAME}" height="${FRAME}"/></clipPath>` +
  `<filter id="s" x="-30%" y="-30%" width="160%" height="160%">` +
  `<feGaussianBlur stdDeviation="4"/>` +
  `<feComponentTransfer><feFuncA type="discrete" tableValues="${table}"/></feComponentTransfer>` +
  `</filter>` +
  `</defs>` +
  frames.join('') +
  `</svg>`
const uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
const maskCss = [`    -webkit-mask-image: ${uri};`, `    mask-image: ${uri};`]

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'globals.css')
const lines = fs.readFileSync(file, 'utf8').split('\n')

const edgeMarker = lines.findIndex((l) => l.includes('scribble-edge'))
if (edgeMarker < 0) throw new Error('scribble-edge marker not found in globals.css')
lines[edgeMarker + 1] = edgeCss

const maskMarker = lines.findIndex((l) => l.includes('scribble-mask'))
if (maskMarker < 0) throw new Error('scribble-mask marker not found in globals.css')
lines.splice(maskMarker + 1, 2, ...maskCss)

fs.writeFileSync(file, lines.join('\n'))

console.log(
  `scribble edge: ${pts.length} points (seed ${SEED}); ` +
    `mask: ${FRAMES} frames x ${STROKES} strokes, posterized to ${STEPS} steps`
)
console.log(`  -> set mask-size: ${FRAMES * 100}% 100% and steps(${FRAMES}, jump-none)`)
