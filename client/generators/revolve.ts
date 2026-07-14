// Clay — Revolve generator (DRAWN, not sliders). Milestone 2.
// "The object should always be an idea." You draw a SILHOUETTE (the right-hand
// outline of a vase / bottle / bowl / bolt) and Clay spins it 360° around the
// vertical axis into a real, watertight solid of revolution — a lathe.
//
// The drawn stroke IS the source of truth. The mesh is DERIVED: we fold the
// stroke onto the +X half-plane (x = radius ≥ 0, y = height), turn it into a
// closed cross-section that hugs the axis, then Manifold.revolve() it.
//
// Axis convention matches wheel.ts: CrossSection is (x=radial, y=axial); revolve
// spins it around Y; the resulting solid's axis is Z. We rotate the final solid
// so its axis stands UP (+Y) — a vase should stand on the ground, not lie down.

import * as THREE from 'three'
import type { Generator } from './registry'
import type { Param, ParamMap } from '../semantic/types'
import { num } from '../semantic/types'
import { M, manifoldToGeometry } from './manifold'
import type { Vec2 } from '../sketch/stroke'
import { resample, smooth } from '../sketch/stroke'

// Per-object drawn silhouettes, keyed by object id (ParamMap only carries scalars).
const _silhouettes = new Map<string, Vec2[]>()

export function setSilhouette(objectId: string, pts: Vec2[]): void {
  _silhouettes.set(objectId, pts.slice())
}
export function getSilhouette(objectId: string): Vec2[] {
  return _silhouettes.get(objectId) ?? []
}
export function clearSilhouette(objectId: string): void {
  _silhouettes.delete(objectId)
}

function defaultParams(): ParamMap {
  const p: Param[] = [
    { key: 'angle', label: 'Sweep', value: 360, type: 'number', min: 30, max: 360, step: 5, unit: 'deg', group: 'Revolve' },
    { key: 'segments', label: 'Smoothness', value: 96, type: 'number', min: 12, max: 256, step: 4, group: 'Revolve' },
    { key: 'scaleR', label: 'Radius Scale', value: 1, type: 'number', min: 0.2, max: 3, step: 0.05, unit: '', group: 'Shape' },
    { key: 'scaleH', label: 'Height Scale', value: 1, type: 'number', min: 0.2, max: 3, step: 0.05, unit: '', group: 'Shape' },
    { key: 'wallSolid', label: 'Solid (vs hollow)', value: true, type: 'bool', group: 'Shape' }
  ]
  const map: ParamMap = {}
  for (const item of p) map[item.key] = item
  return map
}

// Turn a raw drawn silhouette into a clean, closed cross-section polygon on the
// +X half-plane, ready for Manifold.revolve. Returns [] if too degenerate.
//
// Steps:
//  1. Clean the stroke (resample + smooth).
//  2. Find the axis: the smallest x in the drawing folds to radius 0. We treat
//     the LEFT edge of the drawing as the spin axis, so the whole silhouette is
//     one side of the object (a true lathe outline).
//  3. Map each point to (radius = x - axisX, height = y), clamp radius ≥ 0.
//  4. Order the outline by height and cap it against the axis (radius 0) at top
//     and bottom, producing a closed loop the revolve can spin into a solid.
export function silhouetteToCrossSection(raw: Vec2[], scaleR: number, scaleH: number): Vec2[] {
  if (raw.length < 3) return []
  const pts = smooth(resample(raw, 0.01), 2)
  if (pts.length < 3) return []

  // Axis = left edge of the drawing (min x). Radius measured from there.
  let minX = Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  // Fold to (radius, height); normalise height to start at 0 (sit on the ground).
  const prof: Vec2[] = pts.map(([x, y]) => [Math.max(0, (x - minX) * scaleR), (y - minY) * scaleH])

  // Order by height so the outline is monotonic-ish bottom→top (a lathe profile).
  prof.sort((a, b) => a[1] - b[1])

  // Build the closed cross-section: up the drawn outline, then straight back
  // down the axis (radius 0) to close it.
  const bottomH = prof[0][1]
  const topH = prof[prof.length - 1][1]
  const loop: Vec2[] = []
  // Start on the axis at the bottom.
  loop.push([0, bottomH])
  // Up the silhouette (outer wall).
  for (const [r, h] of prof) loop.push([Math.max(0.001, r), h])
  // Cap the top back to the axis.
  loop.push([0, topH])
  // (closing edge from [0,topH] -> [0,bottomH] is implicit)

  // Reject slivers: need real radial + vertical extent.
  const maxR = Math.max(...loop.map((p) => p[0]))
  if (maxR < 0.02 || topH - bottomH < 0.02) return []
  return loop
}

// The base (unscaled) silhouette extent — used by drag handles to convert a world
// drag back into a scale multiplier. Returns { maxRadius, height } in metres.
export function silhouetteBase(objectId: string): { maxRadius: number; height: number } {
  const cross = silhouetteToCrossSection(getSilhouette(objectId), 1, 1)
  if (cross.length < 3) return { maxRadius: 0.15, height: 0.4 }
  let maxR = 0
  let minH = Infinity
  let maxH = -Infinity
  for (const [r, h] of cross) {
    if (r > maxR) maxR = r
    if (h < minH) minH = h
    if (h > maxH) maxH = h
  }
  return { maxRadius: Math.max(0.01, maxR), height: Math.max(0.01, maxH - minH) }
}

export function buildRevolveManifold(objectId: string, params: ParamMap): any {
  const { Manifold, CrossSection } = M()
  const sil = getSilhouette(objectId)
  const cross = silhouetteToCrossSection(sil, num(params, 'scaleR'), num(params, 'scaleH'))
  if (cross.length < 3) {
    // Fallback so the object is never empty/broken: a small default cylinder.
    return Manifold.cylinder(0.4, 0.15, 0.15, 64, false)
  }
  const seg = Math.max(12, Math.round(num(params, 'segments')))
  const angle = Math.max(10, Math.min(360, num(params, 'angle')))
  let solid = Manifold.revolve(new CrossSection([cross as any]) as any, seg, angle)
  // Stand it upright: revolve's axis is Z; rotate -90° about X so the axis is +Y.
  solid = solid.rotate([-90, 0, 0])
  return solid
}

function generate(params: ParamMap): THREE.BufferGeometry {
  const objectId = String(params['_objectId']?.value ?? '')
  const solid = buildRevolveManifold(objectId, params)
  return manifoldToGeometry(solid)
}

export const RevolveGenerator: Generator = {
  type: 'revolve',
  label: 'Revolve',
  defaultParams,
  generate
}
