// Clay — Scene: the ordered list of Semantic Objects (the source of truth), and
// the bridge that keeps the viewport in sync. Each drawn shape is its own object.
// "The object should always be an idea": a shape is stored as the DRAWING that
// made it (an outline / silhouette), and the mesh is always derived from that.

import type { SemanticObject, Param, ParamMap } from './semantic/types'
import { uid, withParam } from './semantic/types'
import { getGenerator } from './generators/registry'
import { setSilhouette, clearSilhouette } from './generators/revolve'
import { setOutline, clearOutline, moveOutlinePoint } from './generators/extrude'
import { solve } from './semantic/constraints'
import type { Vec2 } from './sketch/stroke'
import type { Viewport } from './viewport/viewport'

export class Scene {
  objects: SemanticObject[] = []
  constructor(private viewport: Viewport) {}

  get(id: string): SemanticObject | undefined {
    return this.objects.find((o) => o.id === id)
  }

  add(obj: SemanticObject): void {
    const solved = { ...obj, params: solve(obj.type, obj.params) }
    this.objects.push(solved)
    this.viewport.upsert(solved)
  }

  remove(id: string): void {
    const obj = this.get(id)
    if (!obj) return
    if (obj.type === 'revolve') clearSilhouette(id)
    if (obj.type === 'extrude') clearOutline(id)
    this.objects = this.objects.filter((o) => o.id !== id)
    this.viewport.remove(id)
  }

  // Immutable param update -> re-solve constraints -> regenerate that object's mesh.
  updateParam(id: string, key: string, value: Param['value']): void {
    const idx = this.objects.findIndex((o) => o.id === id)
    if (idx < 0) return
    const obj = this.objects[idx]
    const next = { ...obj, params: solve(obj.type, withParam(obj.params, key, value)) }
    this.objects[idx] = next
    this.viewport.upsert(next)
  }

  // ----- THE DEFAULT: a drawn outline BECOMES an extruded solid of that shape ---
  // outline = the raw closed polygon the user drew (FRONT-plane (x,y) metres).
  // No inference, no promote gate: you draw, it exists, it stays editable.
  createExtrude(outline: Vec2[]): SemanticObject {
    const id = uid('ext')
    setOutline(id, outline)
    const params: ParamMap = {
      ...getGenerator('extrude').defaultParams(),
      _objectId: { key: '_objectId', label: '', value: id, type: 'enum', group: '__hidden' }
    }
    const obj: SemanticObject = {
      id,
      type: 'extrude',
      label: 'Drawn Shape',
      params,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    }
    this.add(obj)
    return obj
  }

  // Reshape: move one control point of an extrude object's outline, then rebuild.
  reshapeOutlinePoint(id: string, index: number, to: Vec2): void {
    const obj = this.get(id)
    if (!obj || obj.type !== 'extrude') return
    const oid = String(obj.params['_objectId']?.value ?? id)
    moveOutlinePoint(oid, index, to)
    // Force a mesh rebuild (params unchanged, but the outline store changed).
    this.viewport.upsert(obj)
  }

  // ----- OPT-IN MODE: a drawn SIDE PROFILE becomes a solid of revolution -----
  // silhouette = the raw drawn outline in FRONT-plane (x,y) metres. It is spun
  // around the vertical axis into a watertight round solid (a lathe).
  promoteToRevolve(silhouette: Vec2[]): SemanticObject {
    const id = uid('rev')
    setSilhouette(id, silhouette)
    const params: ParamMap = {
      ...getGenerator('revolve').defaultParams(),
      _objectId: { key: '_objectId', label: '', value: id, type: 'enum', group: '__hidden' }
    }
    const rev: SemanticObject = {
      id,
      type: 'revolve',
      label: 'Revolved Form',
      params,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    }
    this.add(rev)
    return rev
  }
}
