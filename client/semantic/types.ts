// Clay — Semantic Object & Param model (source of truth).
// See docs/02_DATA_MODEL.md. The mesh is DERIVED from these; never the other way around.

export type SemanticType =
  | 'freeform'
  | 'wheel'
  | 'tire'
  | 'rim'
  | 'revolve'
  | 'box'
  | 'disk'
  | 'sphere'

export type ParamType = 'number' | 'enum' | 'bool'

export interface VisualBinding {
  gizmo: 'radial' | 'axis' | 'scale' | 'none'
  axis?: 'x' | 'y' | 'z'
}

export interface Param<T = number | string | boolean> {
  key: string
  label: string
  value: T
  type: ParamType
  min?: number
  max?: number
  step?: number
  unit?: 'm' | 'cm' | 'deg' | ''
  options?: string[]
  editVisual?: VisualBinding
  locked?: boolean // Intent Lock: AI cannot modify when true
  group?: string
  // Constraint-solver metadata. A `derived` param is COMPUTED from other params
  // (read-only in the UI); it is not a driver the user edits directly.
  derived?: boolean
  // For a DRIVER param: the keys it affects (its downstream dependents). This is
  // the "every parameter knows what it affects" relationship graph.
  affects?: string[]
}

export type ParamMap = Record<string, Param>

export interface SemanticObject {
  id: string
  type: SemanticType
  label: string
  params: ParamMap
  transform: {
    position: [number, number, number]
    rotation: [number, number, number]
    scale: [number, number, number]
  }
}

let _id = 0
export function uid(prefix = 'obj'): string {
  _id += 1
  return `${prefix}_${Date.now().toString(36)}_${_id}`
}

// Pure helper: returns a NEW ParamMap with one value changed (immutable-style for undo).
export function withParam(params: ParamMap, key: string, value: Param['value']): ParamMap {
  const p = params[key]
  if (!p) return params
  return { ...params, [key]: { ...p, value } }
}

// Group params by their `group` field, preserving insertion order.
export function groupParams(params: ParamMap): Record<string, Param[]> {
  const out: Record<string, Param[]> = {}
  for (const p of Object.values(params)) {
    const g = p.group ?? 'General'
    ;(out[g] ??= []).push(p)
  }
  return out
}

// Convenience typed getters (generators read raw values).
export function num(params: ParamMap, key: string): number {
  return Number(params[key]?.value ?? 0)
}
export function str(params: ParamMap, key: string): string {
  return String(params[key]?.value ?? '')
}
