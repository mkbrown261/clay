// Clay — Rim generator (DRAWN, not sliders).
// The rim's source of truth is a user-drawn profile (a "spoke" shape) living in
// the wheel's face plane. The mesh is DERIVED: extrude the profile to a metal
// thickness, then either radial-repeat it N times or keep it freehand (the exact
// strokes the artist drew), then union with a hub ring + bead barrel so the rim
// seats the tire. No fake spoke-count sliders — the geometry IS the drawing.

import * as THREE from 'three'
import type { Generator } from './registry'
import type { Param, ParamMap } from '../semantic/types'
import { num } from '../semantic/types'
import { M, manifoldToGeometry } from './manifold'
import type { Vec2 } from '../sketch/stroke'

// The drawn strokes are stashed on a module-level store keyed by object id, because
// ParamMap only carries scalars/enums. Profiles are arrays of Vec2 polygons.
// (This is deliberately simple for the prototype; docs/02_DATA_MODEL records it.)
const _profiles = new Map<string, Vec2[][]>()

export function setRimProfiles(objectId: string, profiles: Vec2[][]): void {
  _profiles.set(objectId, profiles.map((p) => p.slice()))
}
export function getRimProfiles(objectId: string): Vec2[][] {
  return _profiles.get(objectId) ?? []
}
export function clearRimProfiles(objectId: string): void {
  _profiles.delete(objectId)
}

function defaultParams(): ParamMap {
  const p: Param[] = [
    { key: 'seatRadius', label: 'Seat Radius', value: 0.28, type: 'number', min: 0.1, max: 0.6, step: 0.005, unit: 'm', group: 'Fit', locked: true },
    { key: 'depth', label: 'Metal Depth', value: 0.06, type: 'number', min: 0.02, max: 0.2, step: 0.005, unit: 'm', group: 'Rim' },
    { key: 'radialRepeat', label: 'Radial Repeat', value: true, type: 'bool', group: 'Pattern' },
    { key: 'repeatCount', label: 'Repeat Count', value: 5, type: 'number', min: 3, max: 12, step: 1, group: 'Pattern' },
    { key: 'autoConnect', label: 'Auto-connect spokes', value: true, type: 'bool', group: 'Pattern' },
    { key: 'hubRadius', label: 'Hub Radius', value: 0.06, type: 'number', min: 0.02, max: 0.16, step: 0.005, unit: 'm', group: 'Rim' },
    { key: 'lipWidth', label: 'Bead Lip', value: 0.02, type: 'number', min: 0, max: 0.06, step: 0.005, unit: 'm', group: 'Rim' }
  ]
  const map: ParamMap = {}
  for (const item of p) map[item.key] = item
  return map
}

// Extrude a 2D face-plane polygon to a Z-thickness slab, centred on Z=0.
function extrudeProfile(poly: Vec2[], depth: number): any {
  const { Manifold, CrossSection } = M()
  const cs = new CrossSection([poly as any]) as any
  // extrude along +Z by `depth`; then centre it on Z=0.
  return Manifold.extrude(cs, depth).translate([0, 0, -depth / 2])
}

// Clay assisting (toggleable): build a radial "arm" that welds a drawn spoke to
// the hub (inner) and barrel (outer), so an imperfect drawing still yields ONE
// solid rim. The arm follows the spoke's own angle + width; it never overrides
// the artist's shape, it just guarantees connection.
function bridgeArm(poly: Vec2[], depth: number, hubR: number, seatR: number): any | null {
  const { Manifold } = M()
  // Centroid angle + angular width of the drawn shape.
  let cxs = 0
  let cys = 0
  for (const [x, y] of poly) { cxs += x; cys += y }
  cxs /= poly.length
  cys /= poly.length
  const ang = Math.atan2(cys, cxs) // radians, spoke direction from centre
  // Half-width of the spoke perpendicular to its radial axis.
  const nx = -Math.sin(ang)
  const ny = Math.cos(ang)
  let halfW = 0
  for (const [x, y] of poly) {
    const d = Math.abs(x * nx + y * ny)
    if (d > halfW) halfW = d
  }
  const w = Math.max(0.02, halfW * 1.6)
  // Overlap both ends slightly so the arm FUSES into hub and barrel (one solid),
  // rather than merely touching (which leaves separate bodies).
  const inner = hubR * 0.5
  const outer = seatR + 0.01
  const len = outer - inner
  if (len <= 0) return null
  const mid = (inner + outer) / 2
  return Manifold.cube([len, w, depth], true)
    .translate([mid, 0, 0])
    .rotate([0, 0, (ang * 180) / Math.PI])
}

// Build the rim solid from stored drawn profiles + params.
export function buildRimFromProfiles(objectId: string, params: ParamMap): any {
  const { Manifold } = M()
  const profiles = getRimProfiles(objectId)
  const depth = num(params, 'depth')
  const hubR = num(params, 'hubRadius')
  const seatR = num(params, 'seatRadius')
  const lip = num(params, 'lipWidth')

  const parts: any[] = []

  // Hub disc — every rim needs a centre. Small cylinder on Z.
  parts.push(Manifold.cylinder(depth * 1.1, hubR, hubR, 48, true))

  // Bead barrel + lip: a ring the tire seats against, so tire never floats.
  const barrel = Manifold.cylinder(depth, seatR + lip, seatR + lip, 96, true)
    .subtract(Manifold.cylinder(depth * 1.4, seatR, seatR, 96, true))
  parts.push(barrel)

  const autoConnect = params['autoConnect']?.value !== false
  if (profiles.length > 0) {
    const drawn: any[] = []
    for (const poly of profiles) {
      if (poly.length < 3) continue
      drawn.push(extrudeProfile(poly, depth))
      if (autoConnect) {
        const arm = bridgeArm(poly, depth, hubR, seatR)
        if (arm) drawn.push(arm)
      }
    }
    if (drawn.length > 0) {
      const oneDrawing = drawn.length === 1 ? drawn[0] : Manifold.union(drawn)
      const radial = params['radialRepeat']?.value !== false
      if (radial) {
        // Draw ONE, repeat N times around Z. The drawn spoke is patterned.
        const count = Math.max(3, Math.round(num(params, 'repeatCount')))
        const copies: any[] = []
        for (let i = 0; i < count; i++) {
          copies.push(oneDrawing.rotate([0, 0, (i / count) * 360]))
        }
        parts.push(Manifold.union(copies))
      } else {
        // Freehand: keep exactly what the artist drew, no patterning.
        parts.push(oneDrawing)
      }
    }
  }

  return Manifold.union(parts)
}

// Generator entry. Uses the objectId threaded through params._objectId (set by scene).
function generate(params: ParamMap): THREE.BufferGeometry {
  const objectId = String(params['_objectId']?.value ?? '')
  const solid = buildRimFromProfiles(objectId, params)
  return manifoldToGeometry(solid)
}

export const RimGenerator: Generator = {
  type: 'rim',
  label: 'Rim',
  defaultParams,
  generate
}
