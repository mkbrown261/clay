// Clay — Sketch stroke model + pure geometry helpers.
// A Stroke is what the user DRAWS. It is the source of truth for a drawn object;
// the mesh is DERIVED from it (Clay's core philosophy). All math here is pure and
// framework-free so it can be unit-reasoned and reused by generators.

export type Vec2 = [number, number]

// A raw stroke: ordered points in the DRAW PLANE's local 2D space (metres),
// origin at the wheel centre, +x right, +y up when facing the wheel.
export interface Stroke {
  points: Vec2[]
  closed: boolean
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

// Resample a polyline to roughly-uniform spacing so downstream math is stable.
export function resample(points: Vec2[], spacing: number): Vec2[] {
  if (points.length < 2) return points.slice()
  const out: Vec2[] = [points[0]]
  let prev = points[0]
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    const cur = points[i]
    let segLen = Math.sqrt(dist2(prev, cur))
    if (segLen === 0) continue
    let t = 0
    while (carry + (segLen - t) >= spacing) {
      const need = spacing - carry
      t += need
      const f = t / segLen
      const p: Vec2 = [prev[0] + (cur[0] - prev[0]) * f, prev[1] + (cur[1] - prev[1]) * f]
      out.push(p)
      carry = 0
    }
    carry += segLen - t
    prev = cur
  }
  const last = points[points.length - 1]
  if (dist2(out[out.length - 1], last) > spacing * spacing * 0.25) out.push(last)
  return out
}

// Chaikin smoothing — rounds off hand-jitter without collapsing intent.
export function smooth(points: Vec2[], iterations = 2): Vec2[] {
  let pts = points
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) break
    const next: Vec2[] = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]
      const q = pts[i + 1]
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25])
      next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75])
    }
    next.push(pts[pts.length - 1])
    pts = next
  }
  return pts
}

// Is the stroke effectively a closed loop? (endpoints near each other relative
// to the stroke's own bounding size).
export function looksClosed(points: Vec2[]): boolean {
  if (points.length < 4) return false
  const b = bounds(points)
  const diag = Math.hypot(b.w, b.h)
  const gap = Math.sqrt(dist2(points[0], points[points.length - 1]))
  return gap < diag * 0.22
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  w: number
  h: number
  cx: number
  cy: number
}
export function bounds(points: Vec2[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const w = maxX - minX
  const h = maxY - minY
  return { minX, minY, maxX, maxY, w, h, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

// Signed area (shoelace). Positive = CCW. Used to normalize winding + reject slivers.
export function signedArea(points: Vec2[]): number {
  let a = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

// Ensure counter-clockwise winding (manifold CrossSection wants CCW outer).
export function ensureCCW(points: Vec2[]): Vec2[] {
  return signedArea(points) < 0 ? points.slice().reverse() : points
}

// Turn a raw drawn stroke into a clean, closed, CCW polygon ready for extrusion.
// spacing/smoothIter tuned for wheel-scale drawing (metres).
export function toClosedProfile(raw: Vec2[], spacing = 0.012, smoothIter = 2): Vec2[] {
  if (raw.length < 3) return []
  let pts = smooth(resample(raw, spacing), smoothIter)
  // Drop a duplicate closing point if the user drew back to the start.
  if (pts.length > 2 && dist2(pts[0], pts[pts.length - 1]) < spacing * spacing) pts.pop()
  pts = ensureCCW(pts)
  return pts
}
