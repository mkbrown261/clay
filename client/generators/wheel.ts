// Clay — Wheel smart primitive.
// Reference implementation of the "object is an idea" thesis: the mesh is a pure
// function of the semantic params (radius, width, spokes, tread, wear...).
// See docs/02_DATA_MODEL.md "Example generator schema — WHEEL".

import * as THREE from 'three'
import type { Generator } from './registry'
import type { Param, ParamMap } from '../semantic/types'
import { num, str } from '../semantic/types'

function defaultParams(): ParamMap {
  const p: Param[] = [
    { key: 'radius', label: 'Radius', value: 0.55, type: 'number', min: 0.2, max: 1.5, step: 0.01, unit: 'm', group: 'Dimensions', editVisual: { gizmo: 'radial' } },
    { key: 'width', label: 'Width', value: 0.28, type: 'number', min: 0.08, max: 0.9, step: 0.01, unit: 'm', group: 'Dimensions', editVisual: { gizmo: 'axis', axis: 'z' } },
    { key: 'sidewall', label: 'Sidewall Height', value: 0.14, type: 'number', min: 0.02, max: 0.4, step: 0.01, unit: 'm', group: 'Dimensions' },
    { key: 'bevel', label: 'Bevel', value: 0.03, type: 'number', min: 0, max: 0.12, step: 0.005, unit: 'm', group: 'Dimensions' },
    { key: 'spokes', label: 'Spokes', value: 8, type: 'number', min: 3, max: 12, step: 1, group: 'Rim' },
    { key: 'spokeWidth', label: 'Spoke Width', value: 0.06, type: 'number', min: 0.02, max: 0.2, step: 0.005, unit: 'm', group: 'Rim' },
    { key: 'hubRadius', label: 'Hub Radius', value: 0.12, type: 'number', min: 0.04, max: 0.4, step: 0.01, unit: 'm', group: 'Rim' },
    { key: 'treadDepth', label: 'Tread Depth', value: 0.03, type: 'number', min: 0, max: 0.1, step: 0.005, unit: 'm', group: 'Tire' },
    { key: 'treadCount', label: 'Tread Blocks', value: 28, type: 'number', min: 8, max: 60, step: 1, group: 'Tire' },
    { key: 'rubberType', label: 'Rubber Type', value: 'street', type: 'enum', options: ['mud', 'street', 'performance', 'winter'], group: 'Tire' },
    { key: 'wear', label: 'Wear', value: 'new', type: 'enum', options: ['new', 'used', 'destroyed'], group: 'Wear' }
  ]
  const map: ParamMap = {}
  for (const item of p) map[item.key] = item
  return map
}

// Tread depth scales with rubber type (mud = aggressive) and shrinks with wear.
function effectiveTread(params: ParamMap): number {
  const base = num(params, 'treadDepth')
  const rubber = str(params, 'rubberType')
  const rubberMul = rubber === 'mud' ? 1.6 : rubber === 'winter' ? 1.3 : rubber === 'performance' ? 0.4 : 1
  const wear = str(params, 'wear')
  const wearMul = wear === 'destroyed' ? 0.05 : wear === 'used' ? 0.5 : 1
  return base * rubberMul * wearMul
}

function generate(params: ParamMap): THREE.BufferGeometry {
  const radius = num(params, 'radius')
  const width = num(params, 'width')
  const sidewall = num(params, 'sidewall')
  const bevel = Math.min(num(params, 'bevel'), width / 2 - 0.001)
  const spokes = Math.max(3, Math.round(num(params, 'spokes')))
  const spokeWidth = num(params, 'spokeWidth')
  const hubRadius = num(params, 'hubRadius')
  const tread = effectiveTread(params)
  const treadCount = Math.max(4, Math.round(num(params, 'treadCount')))

  const parts: THREE.BufferGeometry[] = []
  const halfW = width / 2

  const rimOuter = radius - sidewall // where rubber meets rim
  const rimInner = Math.max(hubRadius + 0.02, rimOuter * 0.55)

  // --- Tire body: a beveled tube (torus-like) built from a lathe profile ---
  // Profile in (x=radialDistance, y=axial) space, revolved around Y.
  const prof: THREE.Vector2[] = []
  const rIn = rimOuter
  const rOut = radius
  prof.push(new THREE.Vector2(rIn, -halfW))
  prof.push(new THREE.Vector2(rOut - bevel, -halfW))
  prof.push(new THREE.Vector2(rOut, -halfW + bevel))
  prof.push(new THREE.Vector2(rOut, halfW - bevel))
  prof.push(new THREE.Vector2(rOut - bevel, halfW))
  prof.push(new THREE.Vector2(rIn, halfW))
  const tire = new THREE.LatheGeometry(prof, 64)
  parts.push(tire)

  // --- Tread blocks: small boxes wrapped around the outer circumference ---
  if (tread > 0.001) {
    const block = new THREE.BoxGeometry(0.06, width * 0.8, tread * 2)
    for (let i = 0; i < treadCount; i++) {
      const a = (i / treadCount) * Math.PI * 2
      const g = block.clone()
      const m = new THREE.Matrix4()
      const r = rOut + tread * 0.4
      m.makeRotationY(-a)
      m.multiply(new THREE.Matrix4().makeTranslation(0, 0, r))
      // reorient: box local z -> radial. Rotate so its face points outward.
      const reorient = new THREE.Matrix4().makeRotationX(Math.PI / 2)
      g.applyMatrix4(reorient)
      g.applyMatrix4(m)
      parts.push(g)
    }
  }

  // --- Rim ring (inner metal) ---
  const rimProf: THREE.Vector2[] = [
    new THREE.Vector2(rimInner, -halfW * 0.7),
    new THREE.Vector2(rimOuter, -halfW * 0.7),
    new THREE.Vector2(rimOuter, halfW * 0.7),
    new THREE.Vector2(rimInner, halfW * 0.7)
  ]
  parts.push(new THREE.LatheGeometry(rimProf, 48))

  // --- Hub ---
  const hub = new THREE.CylinderGeometry(hubRadius, hubRadius, width * 0.5, 24)
  hub.rotateX(Math.PI / 2)
  parts.push(hub)

  // --- Spokes: thin boxes from hub to rim ---
  const spokeLen = rimInner - hubRadius
  if (spokeLen > 0.01) {
    const spoke = new THREE.BoxGeometry(spokeWidth, width * 0.35, spokeLen)
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2
      const g = spoke.clone()
      const m = new THREE.Matrix4()
      const mid = hubRadius + spokeLen / 2
      m.makeRotationY(-a)
      m.multiply(new THREE.Matrix4().makeTranslation(0, 0, mid))
      const reorient = new THREE.Matrix4().makeRotationX(Math.PI / 2)
      g.applyMatrix4(reorient)
      g.applyMatrix4(m)
      parts.push(g)
    }
  }

  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  merged.computeVertexNormals()
  return merged
}

// Minimal geometry merge (BufferGeometryUtils.mergeGeometries requires matching
// attributes; we normalize to position-only then recompute normals).
function mergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
