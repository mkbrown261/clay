// Clay — Constraint Solver.
// "Stop thinking Wheel Generator. Think Constraint Solver."
// Drivers are the few real inputs the user edits (radius, width, aspect...).
// Derived values (outer diameter, circumference, sidewall, mass, tread count...)
// are COMPUTED from the drivers. Change one driver -> everything downstream
// recomputes. AI (and drag handles) change RELATIONSHIPS, never guess numbers.
//
// A ConstraintSet is: (1) the derive functions, and (2) the affects-graph so
// every parameter literally knows what it affects.

import type { ParamMap, SemanticType } from './types'
import { num, str } from './types'

// A single derived rule: given the current params, return the derived value.
export interface DerivedRule {
  key: string
  label: string
  unit?: 'm' | 'cm' | 'deg' | ''
  group?: string
  compute: (p: ParamMap) => number
}

export interface ConstraintSet {
  // For each DRIVER key, which keys does changing it affect? (the graph)
  affects: Record<string, string[]>
  // Derived params (computed, read-only) appended to the object's params.
  derived: DerivedRule[]
}

// Rubber density kg/m^3 (approx, for a believable mass read-out).
const RUBBER_DENSITY = 1100
const METAL_DENSITY = 2700 // aluminium alloy rim

// ---- WHEEL constraint set -----------------------------------------------------
// Drivers: radius, width, aspect, treadDepth, treadCount, rubberType, wear.
// Derived: outerDiameter, circumference, sidewall, seatRadius(rBead),
//          contactWidth, approxMass, treadPitch, uvScale.
export const WHEEL_CONSTRAINTS: ConstraintSet = {
  affects: {
    radius: ['outerDiameter', 'circumference', 'seatRadius', 'sidewall', 'approxMass', 'uvScale', 'treadPitch'],
    width: ['contactWidth', 'sidewall', 'seatRadius', 'approxMass'],
    aspect: ['sidewall', 'seatRadius'],
    treadDepth: ['approxMass'],
    treadCount: ['treadPitch'],
    rubberType: ['approxMass'],
    wear: ['approxMass']
  },
  derived: [
    { key: 'outerDiameter', label: 'Outer Diameter', unit: 'm', group: 'Derived', compute: (p) => num(p, 'radius') * 2 },
    { key: 'circumference', label: 'Circumference', unit: 'm', group: 'Derived', compute: (p) => 2 * Math.PI * num(p, 'radius') },
    { key: 'sidewall', label: 'Sidewall', unit: 'm', group: 'Derived', compute: (p) => num(p, 'width') * num(p, 'aspect') },
    { key: 'seatRadius', label: 'Seat Radius', unit: 'm', group: 'Derived', compute: (p) => num(p, 'radius') - num(p, 'width') * num(p, 'aspect') },
    { key: 'contactWidth', label: 'Contact Width', unit: 'm', group: 'Derived', compute: (p) => num(p, 'width') * 0.85 },
    { key: 'treadPitch', label: 'Tread Pitch', unit: 'cm', group: 'Derived', compute: (p) => (2 * Math.PI * num(p, 'radius')) / Math.max(1, num(p, 'treadCount')) * 100 },
    {
      key: 'approxMass', label: 'Approx Mass', unit: '', group: 'Derived',
      compute: (p) => {
        const r = num(p, 'radius')
        const w = num(p, 'width')
        const seat = r - w * num(p, 'aspect')
        // rubber annulus volume (tire) + a thin metal disc (rim) — rough but reactive.
        const tireVol = Math.PI * (r * r - seat * seat) * w
        const rimVol = Math.PI * seat * seat * (w * 0.15)
        const wearMul = str(p, 'wear') === 'destroyed' ? 0.7 : str(p, 'wear') === 'used' ? 0.9 : 1
        return (tireVol * RUBBER_DENSITY + rimVol * METAL_DENSITY) * wearMul
      }
    },
    { key: 'uvScale', label: 'UV Scale', unit: '', group: 'Derived', compute: (p) => Number((2 * Math.PI * num(p, 'radius')).toFixed(2)) }
  ]
}

// ---- REVOLVE constraint set ---------------------------------------------------
// Drivers: angle (sweep), segments, scaleR, scaleH, wallSolid.
// Derived: sweepClosed (is it a full solid of revolution?), and the drivers know
// what they affect. Height/radius come from the drawn silhouette, so we surface
// the scale relationships rather than absolute size (which the drawing owns).
export const REVOLVE_CONSTRAINTS: ConstraintSet = {
  affects: {
    scaleR: ['maxRadius', 'approxVolume'],
    scaleH: ['height', 'approxVolume'],
    angle: ['sweepFraction', 'approxVolume'],
    segments: ['facetAngle']
  },
  derived: [
    { key: 'sweepFraction', label: 'Sweep', unit: '', group: 'Derived', compute: (p) => num(p, 'angle') / 360 },
    { key: 'facetAngle', label: 'Facet Angle', unit: 'deg', group: 'Derived', compute: (p) => num(p, 'angle') / Math.max(1, num(p, 'segments')) }
  ]
}

// ---- EXTRUDE constraint set ---------------------------------------------------
// The DEFAULT object: you draw any closed outline and it becomes a solid of that
// exact shape with thickness. Drivers: depth, bevel, scale, twist. The footprint
// (width/height/area) comes from the DRAWING, so we surface the relationships the
// drivers control rather than absolute size (the outline owns that).
export const EXTRUDE_CONSTRAINTS: ConstraintSet = {
  affects: {
    depth: ['approxVolume', 'aspectRatio'],
    scale: ['footprint', 'approxVolume'],
    twist: ['twistPerUnit'],
    bevel: ['edgeSoftness']
  },
  derived: [
    { key: 'twistPerUnit', label: 'Twist / Thickness', unit: 'deg', group: 'Derived', compute: (p) => num(p, 'twist') / Math.max(0.02, num(p, 'depth')) }
  ]
}

const SETS: Partial<Record<SemanticType, ConstraintSet>> = {
  extrude: EXTRUDE_CONSTRAINTS,
  wheel: WHEEL_CONSTRAINTS,
  tire: WHEEL_CONSTRAINTS,
  revolve: REVOLVE_CONSTRAINTS
}

export function constraintSetFor(type: SemanticType): ConstraintSet | undefined {
  return SETS[type]
}

// Recompute all derived params for an object. Returns a NEW ParamMap with derived
// entries present + up to date, and driver params annotated with `affects`.
export function solve(type: SemanticType, params: ParamMap): ParamMap {
  const set = constraintSetFor(type)
  if (!set) return params
  const out: ParamMap = { ...params }

  // Annotate drivers with their affects-graph (so the UI can show "affects: …").
  for (const [driver, deps] of Object.entries(set.affects)) {
    if (out[driver]) out[driver] = { ...out[driver], affects: deps }
  }

  // Compute derived values.
  for (const rule of set.derived) {
    const value = rule.compute(params)
    out[rule.key] = {
      key: rule.key,
      label: rule.label,
      value: Number.isFinite(value) ? Number(value.toFixed(4)) : 0,
      type: 'number',
      unit: rule.unit,
      group: rule.group ?? 'Derived',
      derived: true
    }
  }
  return out
}

// Human-friendly formatting for a derived value (mass in kg/g, etc.).
export function formatDerived(key: string, value: number): string {
  // ---- analyze_mesh() report rows (client/analysis/analyzeMesh.ts) ----
  if (key === 'an_tris' || key === 'an_verts' || key === 'an_corners' || key === 'an_genus') {
    return String(Math.round(value))
  }
  if (key === 'an_watertight' || key === 'an_convex') return value ? 'Yes' : 'No'
  if (key === 'an_symmetry') {
    const x = (value & 1) !== 0
    const y = (value & 2) !== 0
    if (x && y) return 'X + Y axis'
    if (x) return 'X axis'
    if (y) return 'Y axis'
    return 'None detected'
  }
  if (key === 'an_volume') return value >= 0.001 ? `${(value * 1000).toFixed(2)} L` : `${(value * 1e6).toFixed(1)} cm³`
  if (key === 'an_area') return `${value.toFixed(4)} m²`
  if (key === 'an_width' || key === 'an_height' || key === 'an_depth') return `${value.toFixed(3)} m`
  if (key === 'an_roundness') return `${Math.round(value * 100)}%`
  if (key === 'approxMass') {
    return value >= 1 ? `${value.toFixed(2)} kg` : `${(value * 1000).toFixed(0)} g`
  }
  if (key === 'uvScale') return `×${value.toFixed(2)}`
  if (key === 'treadPitch') return `${value.toFixed(2)} cm`
  if (key === 'sweepFraction') return `${Math.round(value * 100)}%`
  if (key === 'facetAngle') return `${value.toFixed(2)}°`
  if (key === 'twistPerUnit') return `${value.toFixed(1)}°/m`
  return `${value.toFixed(3)} m`
}
