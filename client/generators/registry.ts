// Clay — Generator Registry. Smart primitives: pure (params) => geometry.
// See docs/01_ARCHITECTURE.md "Generators are pure functions".

import type * as THREE from 'three'
import type { ParamMap, SemanticType } from '../semantic/types'

export interface Generator {
  type: SemanticType
  label: string
  defaultParams: () => ParamMap
  // PURE: same params in => same geometry out. No side effects.
  generate: (params: ParamMap) => THREE.BufferGeometry
}

const registry = new Map<SemanticType, Generator>()

export function registerGenerator(g: Generator): void {
  registry.set(g.type, g)
}

export function getGenerator(type: SemanticType): Generator {
  const g = registry.get(type)
  if (!g) throw new Error(`No generator registered for type "${type}"`)
  return g
}

export function listGenerators(): Generator[] {
  return [...registry.values()]
}
