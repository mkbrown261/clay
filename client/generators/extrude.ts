// Clay — Extrude generator. THE core of "draw your own mesh".
// "The object should always be an idea." You draw ANY closed outline — a star, a
// heart, a blob, a gear, the letter S — and it becomes a real 3D solid of EXACTLY
// that shape, with thickness. No inference, no "promote to a preset". The drawn
// outline IS the object; the mesh is DERIVED from it.
//
// Crucially, the outline stays EDITABLE: we keep the drawn polygon as a set of
// control points. Drag a point (see viewport/outline-handles) and the shape
// reshapes live — the drawing is never frozen into dead geometry.
//
// Pipeline: outline polygon (CCW, plane-local metres, XY) -> Manifold.extrude
// along +Z by `depth`, centred on Z -> stand it up so the drawing faces the
// camera (its own XY plane, i.e. no rotation needed; the drawing plane is XY).

import * as THREE from 'three'
import type { Generator } from './registry'
import type { Param, ParamMap } from '../semantic/types'
import { num } from '../semantic/types'
import { M, manifoldToGeometry } from './manifold'
import type { Vec2 } from '../sketch/stroke'
import { signedArea } from '../sketch/stroke'

// Per-object drawn outlines, keyed by object id (ParamMap only carries scalars).
// This is the editable source of truth for the shape.
const _outlines = new Map<string, Vec2[]>()

export function setOutline(objectId: string, pts: Vec2[]): void {
  _outlines.set(objectId, pts.slice())
}
export function getOutline(objectId: string): Vec2[] {
  return _outlines.get(objectId) ?? []
}
export function clearOutline(objectId: string): void {
  _outlines.delete(objectId)
}
// Move a single control point of the outline (used by the drag-a-point handles).
export function moveOutlinePoint(objectId: string, index: number, to: Vec2): void {
  const pts = _outlines.get(objectId)
  if (!pts || index < 0 || index >= pts.length) return
  pts[index] = [to[0], to[1]]
}

function defaultParams(): ParamMap {
  const p: Param[] = [
    { key: 'depth', label: 'Thickness', value: 0.25, type: 'number', min: 0.02, max: 2, step: 0.01, unit: 'm', group: 'Extrude' },
    { key: 'bevel', label: 'Bevel', value: 0, type: 'number', min: 0, max: 0.15, step: 0.005, unit: 'm', group: 'Extrude' },
    { key: 'scale', label: 'Scale', value: 1, type: 'number', min: 0.2, max: 4, step: 0.05, unit: '', group: 'Shape' },
    { key: 'twist', label: 'Twist', value: 0, type: 'number', min: -180, max: 180, step: 5, unit: 'deg', group: 'Shape' }
  ]
  const map: ParamMap = {}
  for (const item of p) map[item.key] = item
  return map
}

// Normalise a raw outline into a clean CCW polygon centred on its own centroid,
// so the object sits at the origin and scale/handles behave predictably.
// Returns the polygon in metres (XY), ready for Manifold.extrude.
export function normalizedOutline(objectId: string, scale = 1): Vec2[] {
  const raw = getOutline(objectId)
  if (raw.length < 3) return []
  // Centre on centroid.
  let cx = 0
  let cy = 0
  for (const [x, y] of raw) { cx += x; cy += y }
  cx /= raw.length
  cy /= raw.length
  let poly: Vec2[] = raw.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale])
  // Manifold CrossSection wants CCW winding.
  if (signedArea(poly) < 0) poly = poly.slice().reverse()
  return poly
}

// The base (unscaled) extent of the outline — used by drag handles to place the
// depth handle and to convert a world drag back into a param value.
export function outlineBase(objectId: string): { halfW: number; halfH: number } {
  const poly = normalizedOutline(objectId, 1)
  if (poly.length < 3) return { halfW: 0.3, halfH: 0.3 }
  let maxX = 0
  let maxY = 0
  for (const [x, y] of poly) {
    if (Math.abs(x) > maxX) maxX = Math.abs(x)
    if (Math.abs(y) > maxY) maxY = Math.abs(y)
  }
  return { halfW: Math.max(0.02, maxX), halfH: Math.max(0.02, maxY) }
}

export function buildExtrudeManifold(objectId: string, params: ParamMap): any {
  const { Manifold, CrossSection } = M()
  const poly = normalizedOutline(objectId, num(params, 'scale'))
  const depth = Math.max(0.02, num(params, 'depth'))
  if (poly.length < 3) {
    // Fallback so the object is never empty/broken.
    return Manifold.cube([0.3, 0.3, depth], true)
  }
  const twist = num(params, 'twist')
  // n divisions only matter if we twist; keep it 1 otherwise (flat prism).
  const nDiv = Math.abs(twist) > 0.5 ? 24 : 1
  const cross = new CrossSection([poly as any])
  // extrude(section, height, nDivisions, twistDegrees, scaleTop)
  let solid = Manifold.extrude(cross as any, depth, nDiv, twist, [1, 1] as any)
  // Extrude grows along +Z from z=0; recentre on Z so the object sits at origin.
  solid = solid.translate([0, 0, -depth / 2])
  return solid
}

function generate(params: ParamMap): THREE.BufferGeometry {
  const objectId = String(params['_objectId']?.value ?? '')
  const solid = buildExtrudeManifold(objectId, params)
  return manifoldToGeometry(solid)
}

export const ExtrudeGenerator: Generator = {
  type: 'extrude',
  label: 'Extrude',
  defaultParams,
  generate
}
