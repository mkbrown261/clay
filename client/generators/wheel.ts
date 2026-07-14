// Clay — Wheel smart primitive (v2: reads as an actual tire).
// Mesh is a pure function of semantic params. See docs/02_DATA_MODEL.md.
//
// Design notes for realism:
//  - Tire body = rounded cross-section revolved (bulging shoulders, not a slab).
//  - Tread = grooves cut INTO the rubber crown (radial ribs sitting slightly
//    proud of a groove floor) — never spikes poking outward like gear teeth.
//  - Rim + spokes are a separate metal shell; hub is the center.
//  - Geometry is grouped so the viewport can assign rubber vs metal materials.

import * as THREE from 'three'
import type { Generator } from './registry'
import type { Param, ParamMap } from '../semantic/types'
import { num, str } from '../semantic/types'

export const WHEEL_GROUP_RUBBER = 0
export const WHEEL_GROUP_METAL = 1

function defaultParams(): ParamMap {
  const p: Param[] = [
    { key: 'radius', label: 'Radius', value: 0.55, type: 'number', min: 0.2, max: 1.5, step: 0.01, unit: 'm', group: 'Dimensions', editVisual: { gizmo: 'radial' } },
    { key: 'width', label: 'Width', value: 0.3, type: 'number', min: 0.08, max: 0.9, step: 0.01, unit: 'm', group: 'Dimensions', editVisual: { gizmo: 'axis', axis: 'z' } },
    { key: 'sidewall', label: 'Sidewall Height', value: 0.16, type: 'number', min: 0.03, max: 0.45, step: 0.01, unit: 'm', group: 'Dimensions' },
    { key: 'shoulder', label: 'Shoulder Bulge', value: 0.05, type: 'number', min: 0, max: 0.18, step: 0.005, unit: 'm', group: 'Dimensions' },
    // Tire (tread) group
    { key: 'treadHeight', label: 'Tread Height', value: 0.05, type: 'number', min: 0, max: 0.18, step: 0.005, unit: 'm', group: 'Tire' },
    { key: 'treadDepth', label: 'Groove Depth', value: 0.025, type: 'number', min: 0, max: 0.08, step: 0.005, unit: 'm', group: 'Tire' },
    { key: 'treadCount', label: 'Tread Ribs', value: 32, type: 'number', min: 8, max: 64, step: 1, group: 'Tire' },
    { key: 'rubberType', label: 'Rubber Type', value: 'street', type: 'enum', options: ['mud', 'street', 'performance', 'winter'], group: 'Tire' },
    // Rim group
    { key: 'spokes', label: 'Spokes', value: 6, type: 'number', min: 3, max: 12, step: 1, group: 'Rim' },
    { key: 'spokeWidth', label: 'Spoke Width', value: 0.07, type: 'number', min: 0.02, max: 0.2, step: 0.005, unit: 'm', group: 'Rim' },
    { key: 'hubRadius', label: 'Hub Radius', value: 0.1, type: 'number', min: 0.04, max: 0.4, step: 0.01, unit: 'm', group: 'Rim' },
    // Wear
    { key: 'wear', label: 'Wear', value: 'new', type: 'enum', options: ['new', 'used', 'destroyed'], group: 'Wear' }
  ]
  const map: ParamMap = {}
  for (const item of p) map[item.key] = item
  return map
}

// Rubber type / wear modulate how aggressive the tread reads.
function treadFactors(params: ParamMap) {
  const rubber = str(params, 'rubberType')
  const rubberMul = rubber === 'mud' ? 1.7 : rubber === 'winter' ? 1.3 : rubber === 'performance' ? 0.35 : 1
  const wear = str(params, 'wear')
  const wearMul = wear === 'destroyed' ? 0.06 : wear === 'used' ? 0.5 : 1
  return { rubberMul, wearMul }
}

// Build a smooth rounded tire cross-section profile (in radial X, axial Y),
// then revolve it. Returns the tire body geometry (rubber).
function buildTireBody(params: ParamMap): THREE.BufferGeometry {
  const radius = num(params, 'radius')
  const width = num(params, 'width')
  const sidewall = num(params, 'sidewall')
  const shoulder = num(params, 'shoulder')
  const halfW = width / 2

  const rInner = radius - sidewall // bead / rim seat radius
  const rCrown = radius            // outer crown radius

  // Profile points from inner-bottom, out to rounded shoulder, across crown,
  // back down the other rounded shoulder to inner-top. Smooth via CatmullRom.
  const raw: THREE.Vector2[] = [
    new THREE.Vector2(rInner, -halfW),
    new THREE.Vector2(rInner + shoulder * 0.4, -halfW),
    new THREE.Vector2(rCrown + shoulder, -halfW * 0.55), // bulging shoulder
    new THREE.Vector2(rCrown, -halfW * 0.2),
    new THREE.Vector2(rCrown, halfW * 0.2),
    new THREE.Vector2(rCrown + shoulder, halfW * 0.55),
    new THREE.Vector2(rInner + shoulder * 0.4, halfW),
    new THREE.Vector2(rInner, halfW)
  ]
  const curve = new THREE.CatmullRomCurve3(
    raw.map((v) => new THREE.Vector3(v.x, v.y, 0)),
    false,
    'catmullrom',
    0.4
  )
  const pts = curve.getPoints(40).map((p) => new THREE.Vector2(p.x, p.y))
  const geo = new THREE.LatheGeometry(pts, 96)
  geo.computeVertexNormals()
  return geo
}

// Tread ribs: thin curved blocks sitting on the crown, with grooves between
// them. Reads as tread pattern, not gear teeth, because ribs are wide/low and
// hug the crown radius rather than pointing outward.
function buildTread(params: ParamMap): THREE.BufferGeometry | null {
  const radius = num(params, 'radius')
  const width = num(params, 'width')
  const { rubberMul, wearMul } = treadFactors(params)
  const treadH = num(params, 'treadHeight') * wearMul
  const grooveD = num(params, 'treadDepth') * rubberMul * wearMul
  const count = Math.max(6, Math.round(num(params, 'treadCount')))
  if (treadH < 0.002 || grooveD < 0.002) return null

  // Each rib is a low box wrapped around the crown; ribs cover ~65% of the
  // circumference (rest is grooves). Rib height is small (grooveD), width
  // covers most of the tread band.
  const ribArc = (Math.PI * 2) / count
  const ribAngularWidth = ribArc * 0.6 // 60% rib, 40% groove
  const ribChord = 2 * (radius + treadH) * Math.sin(ribAngularWidth / 2)
  const bandW = width * (0.78 - Math.min(0.3, rubberMul * 0.08)) // mud = narrower ribs w/ big gaps
  const parts: THREE.BufferGeometry[] = []
  const rib = new THREE.BoxGeometry(ribChord, bandW, grooveD)
  for (let i = 0; i < count; i++) {
    const a = i * ribArc
    const g = rib.clone()
    const m = new THREE.Matrix4()
    const r = radius + treadH - grooveD / 2
    m.makeRotationY(-a)
    m.multiply(new THREE.Matrix4().makeTranslation(0, 0, r))
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)) // face outward
    g.applyMatrix4(m)
    parts.push(g)
  }
  const merged = mergePos(parts)
  parts.forEach((p) => p.dispose())
  rib.dispose()
  merged.computeVertexNormals()
  return merged
}

function buildRimAndSpokes(params: ParamMap): THREE.BufferGeometry {
  const radius = num(params, 'radius')
  const width = num(params, 'width')
  const sidewall = num(params, 'sidewall')
  const spokes = Math.max(3, Math.round(num(params, 'spokes')))
  const spokeWidth = num(params, 'spokeWidth')
  const hubRadius = num(params, 'hubRadius')
  const halfW = width / 2

  const rimOuter = radius - sidewall
  const rimInner = Math.max(hubRadius + 0.03, rimOuter * 0.5)
  const parts: THREE.BufferGeometry[] = []

  // Rim barrel (metal ring the tire seats on)
  const rimProf: THREE.Vector2[] = [
    new THREE.Vector2(rimInner, -halfW * 0.55),
    new THREE.Vector2(rimOuter, -halfW * 0.72),
    new THREE.Vector2(rimOuter, halfW * 0.72),
    new THREE.Vector2(rimInner, halfW * 0.55)
  ]
  const rim = new THREE.LatheGeometry(rimProf, 64)
  parts.push(rim)

  // Hub
  const hub = new THREE.CylinderGeometry(hubRadius, hubRadius, width * 0.55, 32)
  hub.rotateX(Math.PI / 2)
  parts.push(hub)

  // Spokes: tapered boxes hub -> rim
  const spokeLen = rimInner - hubRadius
  if (spokeLen > 0.01) {
    const spoke = new THREE.BoxGeometry(spokeWidth, width * 0.4, spokeLen)
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2
      const g = spoke.clone()
      const mid = hubRadius + spokeLen / 2
      const m = new THREE.Matrix4().makeRotationY(-a)
      m.multiply(new THREE.Matrix4().makeTranslation(0, 0, mid))
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      g.applyMatrix4(m)
      parts.push(g)
    }
    spoke.dispose()
  }
  const merged = mergePos(parts)
  parts.forEach((p) => p.dispose())
  merged.computeVertexNormals()
  return merged
}

function generate(params: ParamMap): THREE.BufferGeometry {
  const rubberParts = [buildTireBody(params)]
  const tread = buildTread(params)
  if (tread) rubberParts.push(tread)
  const rubber = mergePos(rubberParts)
  rubberParts.forEach((p) => p.dispose())
  rubber.computeVertexNormals()

  const metal = buildRimAndSpokes(params)

  // Combine into one geometry with two groups (rubber, metal) for multi-material.
  const rubberCount = rubber.getAttribute('position').count
  const metalCount = metal.getAttribute('position').count
  const combined = mergePos([rubber, metal])
  combined.computeVertexNormals()
  combined.clearGroups()
  combined.addGroup(0, rubberCount, WHEEL_GROUP_RUBBER)
  combined.addGroup(rubberCount, metalCount, WHEEL_GROUP_METAL)
  rubber.dispose()
  metal.dispose()
  return combined
}

// Merge to a position-only, non-indexed geometry (normals recomputed by caller).
function mergePos(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = []
  for (const g of geoms) {
    const ng = g.index ? g.toNonIndexed() : g
    const pos = ng.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    }
    if (ng !== g) ng.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return out
}

export const WheelGenerator: Generator = {
  type: 'wheel',
  label: 'Wheel',
  defaultParams,
  generate
}
