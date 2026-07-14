// Clay — Wheel smart primitive (v3: CAD-grade solids via manifold booleans).
// The mesh is a pure function of the semantic params. This version builds real
// solids and CUTS features (tread grooves, spoke windows, lug holes) so it reads
// like the reference wheel, not fake gear-teeth boxes.
//
// Orientation: wheel axis = Z (faces the camera down -Z). Radial plane = XY.

import * as THREE from 'three'
import type { Generator } from './registry'
import type { Param, ParamMap } from '../semantic/types'
import { num, str } from '../semantic/types'
import { M, manifoldToGeometry } from './manifold'

export const WHEEL_GROUP_RUBBER = 0
export const WHEEL_GROUP_METAL = 1

function defaultParams(): ParamMap {
  const p: Param[] = [
    { key: 'radius', label: 'Radius', value: 0.55, type: 'number', min: 0.2, max: 1.5, step: 0.01, unit: 'm', group: 'Dimensions', editVisual: { gizmo: 'radial' } },
    { key: 'width', label: 'Width', value: 0.32, type: 'number', min: 0.1, max: 0.9, step: 0.01, unit: 'm', group: 'Dimensions', editVisual: { gizmo: 'axis', axis: 'z' } },
    { key: 'aspect', label: 'Sidewall Ratio', value: 0.5, type: 'number', min: 0.25, max: 0.85, step: 0.01, unit: '', group: 'Dimensions' },
    { key: 'shoulder', label: 'Shoulder Round', value: 0.5, type: 'number', min: 0.1, max: 1, step: 0.05, unit: '', group: 'Dimensions' },
    // Tire / tread
    { key: 'treadDepth', label: 'Tread Depth', value: 0.02, type: 'number', min: 0, max: 0.08, step: 0.005, unit: 'm', group: 'Tire' },
    { key: 'treadCount', label: 'Tread Blocks', value: 48, type: 'number', min: 12, max: 90, step: 1, group: 'Tire' },
    { key: 'rubberType', label: 'Rubber Type', value: 'street', type: 'enum', options: ['mud', 'street', 'performance', 'winter'], group: 'Tire' },
    // Rim
    { key: 'spokes', label: 'Spokes', value: 5, type: 'number', min: 3, max: 8, step: 1, group: 'Rim' },
    { key: 'spokeWidth', label: 'Spoke Width', value: 0.55, type: 'number', min: 0.2, max: 0.9, step: 0.05, unit: '', group: 'Rim' },
    { key: 'dish', label: 'Dish Depth', value: 0.06, type: 'number', min: 0, max: 0.2, step: 0.01, unit: 'm', group: 'Rim' },
    { key: 'hubRadius', label: 'Hub Radius', value: 0.09, type: 'number', min: 0.04, max: 0.3, step: 0.01, unit: 'm', group: 'Rim' },
    { key: 'lugs', label: 'Lug Bolts', value: 5, type: 'number', min: 0, max: 8, step: 1, group: 'Rim' },
    { key: 'wear', label: 'Wear', value: 'new', type: 'enum', options: ['new', 'used', 'destroyed'], group: 'Wear' }
  ]
  const map: ParamMap = {}
  for (const item of p) map[item.key] = item
  return map
}

function treadFactors(params: ParamMap) {
  const rubber = str(params, 'rubberType')
  const depthMul = rubber === 'mud' ? 2.2 : rubber === 'winter' ? 1.5 : rubber === 'performance' ? 0.3 : 1
  const wear = str(params, 'wear')
  const wearMul = wear === 'destroyed' ? 0.05 : wear === 'used' ? 0.5 : 1
  const mud = rubber === 'mud'
  return { depthMul, wearMul, mud }
}

// ---- TIRE (rubber) : revolve a rounded cross-section, then cut tread grooves.
function buildTire(params: ParamMap): THREE.BufferGeometry {
  const { Manifold, CrossSection } = M()
  const radius = num(params, 'radius')
  const width = num(params, 'width')
  const aspect = num(params, 'aspect') // sidewall as fraction of section width
  const shoulderR = num(params, 'shoulder')
  const halfW = width / 2
  const sidewall = width * aspect
  const rBead = radius - sidewall // where rubber seats on rim

  // Cross-section polygon in (x = radial, y = axial) space, positive-X only
  // (revolve uses the +X side). Rounded shoulders via extra chamfer points.
  const sh = shoulderR * halfW * 0.9
  const shR = shoulderR * (radius - rBead) * 0.5
  const pts: [number, number][] = [
    [rBead, -halfW * 0.9],
    [rBead + (radius - rBead) * 0.15, -halfW],
    [radius - shR, -halfW],
    [radius, -halfW + sh],
    [radius, halfW - sh],
    [radius - shR, halfW],
    [rBead + (radius - rBead) * 0.15, halfW],
    [rBead, halfW * 0.9]
  ]
  const cs = new CrossSection([pts])
  let tire = Manifold.revolve(cs, 128)

  // Tread grooves: subtract an array of thin boxes/wedges around the crown.
  const { depthMul, wearMul, mud } = treadFactors(params)
  const depth = num(params, 'treadDepth') * depthMul * wearMul
  const count = Math.max(8, Math.round(num(params, 'treadCount')))
  if (depth > 0.002) {
    const grooveW = mud ? 0.05 : 0.02
    const cutters: any[] = []
    // circumferential center groove (a torus-like ring cut) for street look
    if (!mud) {
      const ring = Manifold.cylinder(width * 0.06, radius + 0.02, radius + 0.02, 128, true)
        .rotate([90, 0, 0])
      cutters.push(ring)
    }
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 360
      // a thin radial slot across the tread width
      const slot = Manifold.cube([grooveW, depth * 2.2, width * (mud ? 1.1 : 0.7)], true)
        .translate([radius, 0, 0])
        .rotate([0, 0, a])
      cutters.push(slot)
    }
    const cutter = Manifold.union(cutters)
    tire = tire.subtract(cutter)
  }
  return manifoldToGeometry(tire)
}

// ---- RIM (metal) : face plate + cut spoke windows + hub + lug holes + lip.
function buildRim(params: ParamMap): THREE.BufferGeometry {
  const { Manifold } = M()
  const radius = num(params, 'radius')
  const width = num(params, 'width')
  const aspect = num(params, 'aspect')
  const sidewall = width * aspect
  const rRim = radius - sidewall // outer rim radius (tire bead seat)
  const halfW = width / 2
  const spokes = Math.max(3, Math.round(num(params, 'spokes')))
  const spokeWidth = num(params, 'spokeWidth')
  const dish = num(params, 'dish')
  const hubR = num(params, 'hubRadius')
  const lugs = Math.max(0, Math.round(num(params, 'lugs')))

  // Barrel: hollow cylinder that the tire seats on.
  const barrelOuter = Manifold.cylinder(width * 0.95, rRim, rRim, 96, true).rotate([90, 0, 0])
  const barrelInner = Manifold.cylinder(width, rRim * 0.9, rRim * 0.9, 96, true).rotate([90, 0, 0])
  let rim = barrelOuter.subtract(barrelInner)

  // Face plate (the visible spoke face), dished slightly toward -Z (front).
  const faceZ = -halfW + Math.max(0.02, halfW - dish)
  const faceThick = width * 0.22
  const face = Manifold.cylinder(faceThick, rRim * 0.92, rRim * 0.92, 96, true)
    .rotate([90, 0, 0])
    .translate([0, 0, faceZ])

  // Cut spoke windows: subtract 'spokes' wedge holes, leaving spoke arms.
  // A window = a rounded slot between two adjacent spokes.
  const windows: any[] = []
  const windowSpan = (360 / spokes) * (1 - spokeWidth * 0.6) // gap between spokes
  const rOuterWin = rRim * 0.86
  const rInnerWin = hubR + (rRim - hubR) * 0.18
  const winCount = spokes
  for (let i = 0; i < winCount; i++) {
    const a = (i / winCount) * 360 + 360 / winCount / 2
    // Approximate a tapered window with a cube slot + rounded ends (cylinders).
    const midR = (rOuterWin + rInnerWin) / 2
    const len = rOuterWin - rInnerWin
    const wWide = 2 * midR * Math.sin((windowSpan * Math.PI) / 360)
    const slot = Manifold.cube([wWide, len, faceThick * 3], true)
      .translate([0, midR, 0])
      .rotate([0, 0, a])
    // rounded outer end
    const capO = Manifold.cylinder(faceThick * 3, wWide / 2, wWide / 2, 32, true)
      .translate([0, rOuterWin, 0])
      .rotate([0, 0, a])
    const capI = Manifold.cylinder(faceThick * 3, wWide / 2, wWide / 2, 32, true)
      .translate([0, rInnerWin, 0])
      .rotate([0, 0, a])
    windows.push(Manifold.union([slot, capO, capI]))
  }
  let faceCut = face
  if (windows.length) faceCut = face.subtract(Manifold.union(windows))

  rim = Manifold.union([rim, faceCut])

  // Hub center boss
  const hub = Manifold.cylinder(width * 0.5, hubR, hubR, 48, true)
    .rotate([90, 0, 0])
    .translate([0, 0, faceZ])
  rim = Manifold.union([rim, hub])

  // Lug bolt holes on the hub face
  if (lugs > 0) {
    const holes: any[] = []
    const lugRing = hubR * 0.62
    for (let i = 0; i < lugs; i++) {
      const a = (i / lugs) * Math.PI * 2
      const x = Math.cos(a) * lugRing
      const y = Math.sin(a) * lugRing
      holes.push(
        Manifold.cylinder(width, hubR * 0.16, hubR * 0.16, 20, true)
          .rotate([90, 0, 0])
          .translate([x, y, faceZ])
      )
    }
    rim = rim.subtract(Manifold.union(holes))
  }

  return manifoldToGeometry(rim)
}

// Combine rubber + metal into one geometry with material groups.
function generate(params: ParamMap): THREE.BufferGeometry {
  const rubber = buildTire(params)
  const metal = buildRim(params)

  const rPos = rubber.getAttribute('position').array as Float32Array
  const mPos = metal.getAttribute('position').array as Float32Array
  const positions = new Float32Array(rPos.length + mPos.length)
  positions.set(rPos, 0)
  positions.set(mPos, rPos.length)

  const combined = new THREE.BufferGeometry()
  combined.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  // both inputs are indexed; flatten indices with offset
  const rIdx = rubber.getIndex()!.array as ArrayLike<number>
  const mIdx = metal.getIndex()!.array as ArrayLike<number>
  const rVertCount = rPos.length / 3
  const indices = new Uint32Array(rIdx.length + mIdx.length)
  for (let i = 0; i < rIdx.length; i++) indices[i] = rIdx[i]
  for (let i = 0; i < mIdx.length; i++) indices[rIdx.length + i] = mIdx[i] + rVertCount
  combined.setIndex(new THREE.BufferAttribute(indices, 1))
  combined.computeVertexNormals()

  combined.clearGroups()
  combined.addGroup(0, rIdx.length, WHEEL_GROUP_RUBBER)
  combined.addGroup(rIdx.length, mIdx.length, WHEEL_GROUP_METAL)

  rubber.dispose()
  metal.dispose()
  return combined
}

export const WheelGenerator: Generator = {
  type: 'wheel',
  label: 'Wheel',
  defaultParams,
  generate
}
