// Clay — analyze_mesh(): Phase 1 "Geometry Intelligence" (the eyes).
// Pure browser math. $0 compute, no server round-trip, no GPU. This is the
// FIRST moment Clay has awareness of what you drew — everything after it
// (repair, remesh, deform, AI tool-calls) needs to be able to "see" the
// object before it can act on it. You can't repair/deform/texture what you
// can't measure.
//
// Reads back, for ANY object currently in the scene:
//  - triangle / vertex counts
//  - watertight (manifold) check + genus, volume, surface area, bounding box
//    (all straight from manifold-3d's own solid — it's the same WASM math
//    that already builds every shape, so this is free)
//  - 2D outline analysis on the DRAWING itself (not the 3D mesh): mirror
//    symmetry (X/Y), sharp-corner count via turning-angle detection,
//    convexity, and an isoperimetric "roundness" score.
//
// Surfaced in the panel as a read-only "Analysis" group of derived rows —
// same mechanism the constraint solver already uses (see semantic/constraints
// solve()), so the existing UI renders this for free.

import type { Param, ParamMap, SemanticObject } from '../semantic/types'
import { num } from '../semantic/types'
import type { Vec2 } from '../sketch/stroke'
import { bounds, signedArea } from '../sketch/stroke'
import { buildExtrudeManifold, normalizedOutline } from '../generators/extrude'
import { buildRevolveManifold, getSilhouette, silhouetteToCrossSection } from '../generators/revolve'

export interface MeshAnalysis {
  triCount: number
  vertCount: number
  watertight: boolean
  genus: number
  volume: number // cubic metres
  surfaceArea: number // square metres
  size: [number, number, number] // bounding-box extent, metres (x, y, z)
  symmetryX: boolean
  symmetryY: boolean
  cornerCount: number
  convex: boolean
  roundness: number // 0..1 isoperimetric quotient (1 = a perfect circle)
}

// ============================================================================
// Pure 2D polygon math — reusable for any drawn outline / cross-section.
// ============================================================================

function polygonArea(pts: Vec2[]): number {
  return Math.abs(signedArea(pts))
}

function polygonPerimeter(pts: Vec2[]): number {
  let p = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    p += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return p
}

// Isoperimetric quotient: 4*pi*Area / Perimeter^2. 1.0 = a perfect circle;
// lower = more irregular/spiky/elongated. A single number that captures "how
// round is this shape" independent of size.
function roundnessOf(pts: Vec2[]): number {
  if (pts.length < 3) return 0
  const area = polygonArea(pts)
  const per = polygonPerimeter(pts)
  if (per <= 0) return 0
  return Math.min(1, (4 * Math.PI * area) / (per * per))
}

// Convex if every turn (cross product of consecutive edges) has the same sign.
function isConvex(pts: Vec2[]): boolean {
  if (pts.length < 4) return true
  let sign = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const c = pts[(i + 2) % n]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-9) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

// Mirror-symmetry test about an axis through the centroid. For each sample
// point we find the nearest point in the set to its mirror image; if the
// average nearest-neighbour error is small relative to the shape's own size,
// call it symmetric. Sampled + capped so it stays instant even on dense
// (heavily-resampled) outlines.
function testMirrorSymmetry(pts: Vec2[], mirror: (p: Vec2) => Vec2, tolFrac = 0.06): boolean {
  if (pts.length < 6) return false
  const b = bounds(pts)
  const scale = Math.max(1e-6, Math.hypot(b.w, b.h))
  const stride = Math.max(1, Math.floor(pts.length / 120))
  let total = 0
  let n = 0
  for (let i = 0; i < pts.length; i += stride) {
    const m = mirror(pts[i])
    let best = Infinity
    for (let j = 0; j < pts.length; j++) {
      const d = Math.hypot(pts[j][0] - m[0], pts[j][1] - m[1])
      if (d < best) best = d
    }
    total += best
    n++
  }
  return total / Math.max(1, n) / scale < tolFrac
}

// Corner / curvature detection via local turning-angle. Compares the
// direction of the segment `stride` points behind vs `stride` points ahead of
// each vertex — a large direction change is a sharp feature. Local maxima are
// merged (non-max suppression over the same window) so one real corner isn't
// counted many times across its densely-resampled neighbourhood.
function countCorners(pts: Vec2[], turnThresholdDeg = 28): number {
  const n = pts.length
  if (n < 8) return 0
  const stride = Math.max(2, Math.round(n / 60))
  const turn = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - stride + n) % n]
    const cur = pts[i]
    const next = pts[(i + stride) % n]
    const v1 = Math.atan2(cur[1] - prev[1], cur[0] - prev[0])
    const v2 = Math.atan2(next[1] - cur[1], next[0] - cur[0])
    let d = v2 - v1
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    turn[i] = Math.abs(d) * (180 / Math.PI)
  }
  let count = 0
  for (let i = 0; i < n; i++) {
    if (turn[i] < turnThresholdDeg) continue
    let isMax = true
    for (let k = -stride; k <= stride; k++) {
      if (k === 0) continue
      if (turn[(i + k + n) % n] > turn[i]) { isMax = false; break }
    }
    if (isMax) count++
  }
  return count
}

// ============================================================================
// Manifold-derived facts. manifold-3d guarantees every result of a boolean /
// extrude / revolve op IS a valid 2-manifold (watertight) unless the op
// failed — that's the entire point of the library — so "watertight" reduces
// to "status() reports no error". Free: same WASM math already used to build
// the shape, just reading its own report card.
// ============================================================================

function analyzeManifoldSolid(
  solid: any
): Pick<MeshAnalysis, 'triCount' | 'vertCount' | 'watertight' | 'genus' | 'volume' | 'surfaceArea' | 'size'> {
  const triCount = solid.numTri ? solid.numTri() : 0
  const vertCount = solid.numVert ? solid.numVert() : 0
  const status = solid.status ? solid.status() : 'NoError'
  const watertight = status === 'NoError'
  const genus = solid.genus ? solid.genus() : 0
  const volume = solid.volume ? solid.volume() : 0
  const surfaceArea = solid.surfaceArea ? solid.surfaceArea() : 0
  let size: [number, number, number] = [0, 0, 0]
  if (solid.boundingBox) {
    const bb = solid.boundingBox()
    size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]]
  }
  return { triCount, vertCount, watertight, genus, volume, surfaceArea, size }
}

// ============================================================================
// Public entry point: analyze_mesh(). Rebuilds the solid + source outline for
// an object and runs every check. Pure: same object -> same report.
// ============================================================================

export function analyzeObject(obj: SemanticObject): MeshAnalysis | null {
  const objectId = String(obj.params['_objectId']?.value ?? obj.id)
  let solid: any
  let outline2D: Vec2[] = []

  if (obj.type === 'extrude') {
    solid = buildExtrudeManifold(objectId, obj.params)
    outline2D = normalizedOutline(objectId, num(obj.params, 'scale'))
  } else if (obj.type === 'revolve') {
    solid = buildRevolveManifold(objectId, obj.params)
    // The 2D cross-section here is the drawn SIDE PROFILE (e.g. straight wall
    // vs curvy vase) — not the horizontal cross-section, which for a solid of
    // revolution is always a circle by construction.
    outline2D = silhouetteToCrossSection(getSilhouette(objectId), num(obj.params, 'scaleR'), num(obj.params, 'scaleH'))
  } else {
    return null
  }
  if (!solid) return null

  const mesh = analyzeManifoldSolid(solid)

  let symmetryX = false
  let symmetryY = false
  let cornerCount = 0
  let convex = true
  let roundness = 0

  if (obj.type === 'revolve') {
    // A solid of revolution is symmetric about ITS axis by construction —
    // report that directly (for a full 360deg sweep) rather than re-deriving
    // it from the profile, and its horizontal cross-section is always a circle.
    const angle = num(obj.params, 'angle')
    symmetryX = angle >= 359
    symmetryY = angle >= 359
    roundness = 1
    if (outline2D.length >= 3) cornerCount = countCorners(outline2D)
  } else if (outline2D.length >= 3) {
    symmetryX = testMirrorSymmetry(outline2D, ([x, y]) => [x, -y])
    symmetryY = testMirrorSymmetry(outline2D, ([x, y]) => [-x, y])
    cornerCount = countCorners(outline2D)
    convex = isConvex(outline2D)
    roundness = roundnessOf(outline2D)
  }

  return { ...mesh, symmetryX, symmetryY, cornerCount, convex, roundness }
}

// Turn a MeshAnalysis report into ParamMap rows the existing panel already
// knows how to render (read-only, group "Analysis"). Values are always
// numbers (booleans/enums encoded as 0/1/bitmask) — formatDerived() in
// semantic/constraints.ts turns them into human text, same convention the
// constraint solver's derived rows already use.
export function analysisParams(a: MeshAnalysis): ParamMap {
  const row = (key: string, label: string, value: number): Param => ({
    key,
    label,
    value: Number.isFinite(value) ? value : 0,
    type: 'number',
    group: 'Analysis',
    derived: true
  })
  const out: ParamMap = {
    an_tris: row('an_tris', 'Triangles', a.triCount),
    an_verts: row('an_verts', 'Vertices', a.vertCount),
    an_watertight: row('an_watertight', 'Watertight', a.watertight ? 1 : 0),
    an_genus: row('an_genus', 'Genus', a.genus),
    an_volume: row('an_volume', 'Volume', a.volume),
    an_area: row('an_area', 'Surface Area', a.surfaceArea),
    an_width: row('an_width', 'Width (X)', a.size[0]),
    an_height: row('an_height', 'Height (Y)', a.size[1]),
    an_depth: row('an_depth', 'Depth (Z)', a.size[2]),
    an_symmetry: row('an_symmetry', 'Symmetry', (a.symmetryX ? 1 : 0) + (a.symmetryY ? 2 : 0)),
    an_corners: row('an_corners', 'Corners', a.cornerCount),
    an_convex: row('an_convex', 'Convexity', a.convex ? 1 : 0),
    an_roundness: row('an_roundness', 'Roundness', Number(a.roundness.toFixed(4)))
  }
  return out
}
