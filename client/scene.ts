// Clay — Scene: the ordered list of Semantic Objects (the source of truth), and
// the bridge that keeps the viewport in sync. Tire + rim are independent objects.
// Adding/removing/redrawing the rim never touches the tire.

import type { SemanticObject, Param, ParamMap } from './semantic/types'
import { uid, withParam, num } from './semantic/types'
import { getGenerator } from './generators/registry'
import { setRimProfiles, clearRimProfiles } from './generators/rim'
import { setSilhouette, clearSilhouette } from './generators/revolve'
import { wheelDims } from './generators/tire'
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
    if (obj.type === 'rim') clearRimProfiles(id)
    if (obj.type === 'revolve') clearSilhouette(id)
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

  // ----- Factory: the Tire substrate -----
  createTire(): SemanticObject {
    const tire: SemanticObject = {
      id: uid('tire'),
      type: 'tire',
      label: 'Tire',
      params: getGenerator('tire').defaultParams(),
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    }
    this.add(tire)
    return tire
  }

  // ----- Object Promotion: a drawn circle BECOMES an editable Wheel -----
  // radiusWorld = the radius of the circle the user drew, in world metres.
  promoteToWheel(radiusWorld: number): SemanticObject {
    const params = getGenerator('tire').defaultParams()
    // Seed the driver `radius` from the drawing; clamp to the param's range.
    const rp = params['radius']
    const r = Math.max(rp.min ?? 0.2, Math.min(rp.max ?? 1.5, radiusWorld))
    params['radius'] = { ...rp, value: Number(r.toFixed(3)) }
    const tire: SemanticObject = {
      id: uid('tire'),
      type: 'tire',
      label: 'Wheel',
      params,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    }
    this.add(tire)
    return tire
  }

  // ----- Object Promotion: a drawn SILHOUETTE becomes an editable Revolve -----
  // silhouette = the raw drawn outline in FRONT-plane (x,y) metres. It is spun
  // 360° around the vertical axis into a watertight solid of revolution.
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

  // The Z of the tire's front face — where the artist draws.
  tireFaceZ(tire: SemanticObject): number {
    return num(tire.params, 'width') / 2
  }

  // The radius the rim must seat the tire at (so no gap).
  tireSeatRadius(tire: SemanticObject): number {
    return wheelDims(tire.params).rBead
  }

  // ----- Draw -> Rim -----
  // Create (or replace) the rim from drawn profiles. Redrawing replaces geometry
  // but keeps the same object id so selection/params persist.
  applyRimDrawing(tire: SemanticObject, profiles: Vec2[][], opts: { radialRepeat: boolean; repeatCount: number }): SemanticObject {
    // Find existing rim (only one for the prototype).
    let rim = this.objects.find((o) => o.type === 'rim')
    if (!rim) {
      const rimId = uid('rim')
      rim = {
        id: rimId,
        type: 'rim',
        label: 'Rim',
        params: {
          ...getGenerator('rim').defaultParams(),
          // hidden param so the pure generator can look up this rim's drawn profiles.
          _objectId: { key: '_objectId', label: '', value: rimId, type: 'enum', group: '__hidden' }
        },
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
      }
      this.objects.push(rim)
    }

    // Sync fit to the tire so it always seats correctly.
    rim.params = withParam(rim.params, 'seatRadius', this.tireSeatRadius(tire))
    rim.params = withParam(rim.params, 'radialRepeat', opts.radialRepeat)
    rim.params = withParam(rim.params, 'repeatCount', opts.repeatCount)
    // reflect the mutated params back into the objects array
    const idx = this.objects.findIndex((o) => o.id === rim!.id)
    if (idx >= 0) this.objects[idx] = rim

    // Empty profiles = "re-seat only" (e.g. tire resized): keep existing drawing.
    if (profiles.length > 0) setRimProfiles(rim.id, profiles)
    this.viewport.upsert(rim)
    return rim
  }

  get rim(): SemanticObject | undefined {
    return this.objects.find((o) => o.type === 'rim')
  }
  get tire(): SemanticObject | undefined {
    return this.objects.find((o) => o.type === 'tire')
  }
}
