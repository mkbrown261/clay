// Clay — Wheel smart primitive (v4).
// Philosophy: the TIRE is the parametric substrate. The RIM is meant to be DRAWN
// by the user (Step B). Until a rim is drawn, we show a minimal placeholder rim
// (a plain dished disc) — NOT a fake spoke generator. Tire and rim are built as
// SEPARATE geometries so they can become independent, removable objects.
//
// Axis convention: Manifold.revolve() spins a 2D cross-section (x=radial,
// y=axial) around Y, and the result's axis is Z. So EVERYTHING here is authored
// as a revolved cross-section on the same Z axis -> no gaps, no misalignment.

import * as THREE from 'three'
import type { Generator } from './registry'
import type { Param, ParamMap } from '../semantic/types'
import { num, str } from '../semantic/types'
import { M, manifoldToGeometry } from './manifold'

export const WHEEL_GROUP_RUBBER = 0
export const WHEEL_GROUP_METAL = 1

// Shared derived dimensions so tire and rim ALWAYS meet at the same radius.
export interface WheelDims {
  radius: number
  width: number
  halfW: number
  rBead: number // radius where tire inner meets rim outer (the seat)
}
export function wheelDims(params: ParamMap): WheelDims {
  const radius = num(params, 'radius')
  const width = num(params, 'width')
  const aspect = num(params, 'aspect')
  const sidewall = width * aspect
  return { radius, width, halfW: width / 2, rBead: radius - sidewall }
}

function defaultParams(): ParamMap {
  const p: Param[] = [
    { key: 'radius', label: 'Radius', value: 0.55, type: 'number', min: 0.2, max: 1.5, step: 0.01, unit: 'm', group: 'Dimensions', editVisual: { gizmo: 'radial' } },
    { key: 'width', label: 'Width', value: 0.32, type: 'number', min: 0.1, max: 0.9, step: 0.01, unit: 'm', group: 'Dimensions', editVisual: { gizmo: 'axis', axis: 'z' } },
    { key: 'aspect', label: 'Sidewall Ratio', value: 0.5, type: 'number', min: 0.25, max: 0.85, step: 0.01, unit: '', group: 'Dimensions' },
    { key: 'shoulder', label: 'Shoulder Round', value: 0.5, type: 'number', min: 0.1, max: 1, step: 0.05, unit: '', group: 'Dimensions' },
    { key: 'treadDepth', label: 'Tread Depth', value: 0.02, type: 'number', min: 0, max: 0.08, step: 0.005, unit: 'm', group: 'Tire' },
    { key: 'treadCount', label: 'Tread Blocks', value: 48, type: 'number', min: 12, max: 90, step: 1, group: 'Tire' },
    { key: 'rubberType', label: 'Rubber Type', value: 'street', type: 'enum', options: ['mud', 'street', 'performance', 'winter'], group: 'Tire' },
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
  return { depthMul, wearMul, mud: rubber === 'mud' }
}

// ---- TIRE (rubber): revolve a rounded section that seats exactly at rBead.
export function buildTireManifold(params: ParamMap): any {
  const { Manifold, CrossSection } = M()
  const d = wheelDims(params)
  const shoulderR = num(params, 'shoulder')
  const sh = shoulderR * d.halfW * 0.9
  const shR = shoulderR * (d.radius - d.rBead) * 0.4

  // Cross-section, +X side only, closed polygon (x=radial, y=axial).
  const pts: [number, number][] = [
    [d.rBead, -d.halfW * 0.92],
    [d.rBead, -d.halfW],
    [d.radius - shR, -d.halfW],
    [d.radius, -d.halfW + sh],
    [d.radius, d.halfW - sh],
    [d.radius - shR, d.halfW],
    [d.rBead, d.halfW],
    [d.rBead, d.halfW * 0.92]
  ]
  let tire = Manifold.revolve(new CrossSection([pts]), 128)

  // Tread grooves cut INTO the crown.
  const { depthMul, wearMul, mud } = treadFactors(params)
  const depth = num(params, 'treadDepth') * depthMul * wearMul
  const count = Math.max(8, Math.round(num(params, 'treadCount')))
  if (depth > 0.002) {
    const cutters: any[] = []
    if (!mud) {
      // circumferential center rib groove: subtract a thin ring near the crown
      const ringOuter = new CrossSection([[
        [d.radius - depth, -d.width * 0.04],
        [d.radius + 0.05, -d.width * 0.04],
        [d.radius + 0.05, d.width * 0.04],
        [d.radius - depth, d.width * 0.04]
      ] as any]) as any
      cutters.push(Manifold.revolve(ringOuter, 128))
    }
    const grooveW = mud ? 0.05 : 0.022
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 360
      const slot = Manifold.cube([grooveW, depth * 2.2, d.width * (mud ? 1.1 : 0.72)], true)
        .translate([d.radius, 0, 0])
        .rotate([0, 0, a])
      cutters.push(slot)
    }
    tire = tire.subtract(Manifold.union(cutters))
  }
  return tire
}

// ---- RIM PLACEHOLDER (metal): a plain dished disc that fills to rBead, on the
// SAME axis as the tire. This is intentionally minimal — Step B replaces it with
// a rim the USER draws. No fake spoke-count sliders.
export function buildRimManifold(params: ParamMap): any {
  const { Manifold, CrossSection } = M()
  const d = wheelDims(params)
  const barrelHalf = d.halfW * 0.95

  // Barrel: ring wall the tire seats on (revolved rectangle).
  const barrel = Manifold.revolve(new CrossSection([[
    [d.rBead * 0.9, -barrelHalf],
    [d.rBead, -barrelHalf],
    [d.rBead, barrelHalf],
    [d.rBead * 0.9, barrelHalf]
  ] as any]) as any, 96)

  // Face disc dished toward the front (-Z), thin.
  const faceHalf = d.width * 0.09
  const faceZ = -d.halfW + faceHalf + d.halfW * 0.15
  const face = Manifold.revolve(new CrossSection([[
    [0, faceZ - faceHalf],
    [d.rBead * 0.92, faceZ - faceHalf],
    [d.rBead * 0.92, faceZ + faceHalf],
    [0, faceZ + faceHalf]
  ] as any]) as any, 96)

  return Manifold.union([barrel, face])
}

// Combine two manifolds into one grouped three.js geometry (rubber + metal).
function combineToGrouped(rubber: any, metal: any): THREE.BufferGeometry {
  const gR = manifoldToGeometry(rubber)
  const gM = manifoldToGeometry(metal)
  const rPos = gR.getAttribute('position').array as Float32Array
  const mPos = gM.getAttribute('position').array as Float32Array
  const positions = new Float32Array(rPos.length + mPos.length)
  positions.set(rPos, 0)
  positions.set(mPos, rPos.length)

  const combined = new THREE.BufferGeometry()
  combined.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const rIdx = gR.getIndex()!.array as ArrayLike<number>
  const mIdx = gM.getIndex()!.array as ArrayLike<number>
  const rVertCount = rPos.length / 3
  const indices = new Uint32Array(rIdx.length + mIdx.length)
  for (let i = 0; i < rIdx.length; i++) indices[i] = rIdx[i]
  for (let i = 0; i < mIdx.length; i++) indices[rIdx.length + i] = mIdx[i] + rVertCount
  combined.setIndex(new THREE.BufferAttribute(indices, 1))
  combined.computeVertexNormals()
  combined.clearGroups()
  combined.addGroup(0, rIdx.length, WHEEL_GROUP_RUBBER)
  combined.addGroup(rIdx.length, mIdx.length, WHEEL_GROUP_METAL)
  gR.dispose()
  gM.dispose()
  return combined
}

function generate(params: ParamMap): THREE.BufferGeometry {
  return combineToGrouped(buildTireManifold(params), buildRimManifold(params))
}

export const WheelGenerator: Generator = {
  type: 'wheel',
  label: 'Wheel',
  defaultParams,
  generate
}
