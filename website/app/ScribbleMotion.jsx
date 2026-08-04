'use client'
import { useEffect } from 'react'

// Drives the scribble fill with the Web Animations API rather than a CSS
// transition.
//
// The mask is a filmstrip, so only positions that land exactly on a frame
// boundary render a valid picture. A CSS transition divides whatever range is
// left when it starts, so interrupting a hover halfway steps from (say) 48% to
// 0% in 25 slices that fall between frames — you see two half-frames at once.
//
// WAAPI keeps one timeline with the easing applied across the full duration,
// so flipping playbackRate resumes backwards from the current time and every
// value stays on the same step grid. Interrupting mid-stroke simply un-draws
// from wherever the pen got to.
const FRAMES = 25
const DURATION = 1008

export default function ScribbleMotion() {
  useEffect(() => {
    if (typeof Element === 'undefined' || !Element.prototype.animate) return
    const teardown = []

    for (const fill of document.querySelectorAll('.scribble-fill')) {
      const button = fill.closest('.scribble')
      if (!button) continue

      const anim = fill.animate(
        [
          { maskPosition: '0% 0%', WebkitMaskPosition: '0% 0%' },
          { maskPosition: '100% 0%', WebkitMaskPosition: '100% 0%' },
        ],
        { duration: DURATION, easing: `steps(${FRAMES}, jump-none)`, fill: 'both' }
      )
      anim.pause()

      const draw = () => {
        anim.playbackRate = 1
        anim.play()
      }
      const undraw = () => {
        anim.playbackRate = -1
        anim.play()
      }

      button.addEventListener('mouseenter', draw)
      button.addEventListener('focus', draw)
      button.addEventListener('mouseleave', undraw)
      button.addEventListener('blur', undraw)

      teardown.push(() => {
        button.removeEventListener('mouseenter', draw)
        button.removeEventListener('focus', draw)
        button.removeEventListener('mouseleave', undraw)
        button.removeEventListener('blur', undraw)
        anim.cancel()
      })
    }

    return () => teardown.forEach((fn) => fn())
  }, [])

  return null
}
