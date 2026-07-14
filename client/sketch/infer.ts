// Clay — "What are you drawing?" inference (toggleable).
// This is Clay ASSISTING, never hijacking: it reads the shape of the stroke and
// offers a guess the artist can accept or ignore. Today it's a fast local
// heuristic (no network, no key). Later this becomes an LLM call behind the same
// interface — the toggle and the return shape stay identical.

import type { Vec2 } from './stroke'
import { bounds, signedArea } from './stroke'

export interface Guess {
  label: string // e.g. "spoke", "circle", "5-point star"
  hint: string // friendly one-liner the UI shows
  suggestRadialRepeat: boolean // does this shape want to be repeated around a hub?
}

// Count sharp direction changes to estimate "points"/corners of a shape.
function cornerCount(pts: Vec2[]): number {
  if (pts.length < 5) return 0
  let corners = 0
  const step = Math.max(1, Math.floor(pts.length / 64))
  for (let i = step; i < pts.length - step; i += step) {
    const a = pts[i - step]
    const b = pts[i]
    const c = pts[i + step]
    const v1x = b[0] - a[0]
    const v1y = b[1] - a[1]
    const v2x = c[0] - b[0]
    const v2y = c[1] - b[1]
    const d = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 1e-9)
    if (d < 0.35) corners++ // ~>69 deg turn
  }
  return corners
}

// How "round" is the loop? ratio of area to that of its bounding circle.
function roundness(pts: Vec2[]): number {
  const area = Math.abs(signedArea(pts))
  const b = bounds(pts)
  const r = Math.max(b.w, b.h) / 2
  const circle = Math.PI * r * r
  return circle > 0 ? area / circle : 0
}

export function inferShape(profile: Vec2[]): Guess {
  if (profile.length < 3) {
    return { label: 'stroke', hint: 'Draw a closed shape for a spoke.', suggestRadialRepeat: false }
  }
  const b = bounds(profile)
  const round = roundness(profile)
  const corners = cornerCount(profile)
  const aspect = b.w / (b.h + 1e-9)
  const elongated = aspect > 2.2 || aspect < 0.45

  if (round > 0.82 && corners <= 1) {
    return { label: 'circle', hint: 'Looks like a disc — I can revolve it into a smooth rim.', suggestRadialRepeat: false }
  }
  if (corners >= 4 && round < 0.6) {
    return { label: `${corners}-point star`, hint: `Looks like a star spoke — repeat ${corners} times?`, suggestRadialRepeat: true }
  }
  if (elongated) {
    return { label: 'spoke', hint: 'Looks like a spoke — draw once, I’ll repeat it around the hub.', suggestRadialRepeat: true }
  }
  return { label: 'shape', hint: 'Got it — repeat it around the hub, or keep it freehand.', suggestRadialRepeat: true }
}
