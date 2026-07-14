// Clay — Tire generator (the parametric SUBSTRATE).
// The tire is the thing you draw a rim ON. It's a standalone Semantic Object so it
// can exist, be edited, and be removed independently of the rim. Geometry is a
// single rubber solid (revolved rounded section with boolean-cut tread grooves).

import * as THREE from 'three'
import type { Generator } from './registry'
import type { Param, ParamMap } from '../semantic/types'
import { manifoldToGeometry } from './manifold'
import { buildTireManifold, wheelDims, type WheelDims } from './wheel'

export { wheelDims }
export type { WheelDims }

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

function generate(params: ParamMap): THREE.BufferGeometry {
  return manifoldToGeometry(buildTireManifold(params))
}

export const TireGenerator: Generator = {
  type: 'tire',
  label: 'Tire',
  defaultParams,
  generate
}
