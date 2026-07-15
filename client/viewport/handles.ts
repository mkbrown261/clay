// Clay — Direct-manipulation handles. "Forget sliders. Keep them... but make
// everything manipulatable." Hover a wheel -> blue handles appear. Drag the
// outside -> radius grows. Drag width -> widens. Drag hub -> hub grows. The
// property panel updates live while you drag. This is the satisfying UX.

import * as THREE from 'three'
import type { SemanticObject } from '../semantic/types'
import { num } from '../semantic/types'
import { silhouetteBase } from '../generators/revolve'
import { outlineBase } from '../generators/extrude'

export type HandleKind = 'radius' | 'width' | 'hub' | 'rev-radius' | 'rev-height' | 'ext-depth' | 'ext-scale'

export interface HandleDragEvent {
  key: string // param key to update ('radius' | 'width' | 'hubRadius')
  value: number
}

interface HandleDef {
  kind: HandleKind
  mesh: THREE.Mesh
  paramKey: string
  // Which semantic types this handle applies to.
  forTypes: string[]
  // Map a world drag to a param value, given the object.
  toValue: (world: THREE.Vector3, obj: SemanticObject) => number
  // Where the handle sits, given the object.
  place: (obj: SemanticObject) => THREE.Vector3
  // Axis the handle slides along (for the drag plane).
  axis: THREE.Vector3
}

const COLOR = 0x5b8cff
const COLOR_HOT = 0x8fb0ff

export class Handles {
  group = new THREE.Group()
  private defs: HandleDef[] = []
  private obj: SemanticObject | null = null
  private dragging: HandleDef | null = null
  private raycaster = new THREE.Raycaster()
  private hot: HandleDef | null = null
  onDrag?: (e: HandleDragEvent) => void
  onDragEnd?: () => void

  constructor(private camera: THREE.PerspectiveCamera, private dom: HTMLElement) {
    this.group.visible = false
    this.buildHandles()
  }

  private sphere(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.035, 20, 16)
    const mat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.95, depthTest: false })
    const m = new THREE.Mesh(geo, mat)
    m.renderOrder = 999
    return m
  }

  private buildHandles() {
    // ---- Wheel/tire handles ----
    const radius = this.sphere()
    const width = this.sphere()
    const hub = this.sphere()
    hub.scale.setScalar(0.7)
    // ---- Revolve handles ----
    const revRadius = this.sphere()
    const revHeight = this.sphere()
    // ---- Extrude handles ----
    const extDepth = this.sphere()
    const extScale = this.sphere()
    extScale.scale.setScalar(0.8)

    this.defs = [
      {
        kind: 'radius', mesh: radius, paramKey: 'radius', forTypes: ['tire', 'wheel'], axis: new THREE.Vector3(1, 0, 0),
        place: (o) => new THREE.Vector3(num(o.params, 'radius'), 0, 0),
        toValue: (w) => Math.abs(w.x)
      },
      {
        kind: 'width', mesh: width, paramKey: 'width', forTypes: ['tire', 'wheel'], axis: new THREE.Vector3(0, 0, 1),
        place: (o) => new THREE.Vector3(0, 0, num(o.params, 'width') / 2),
        toValue: (w) => Math.abs(w.z) * 2
      },
      {
        kind: 'hub', mesh: hub, paramKey: 'hubRadius', forTypes: ['tire', 'wheel'], axis: new THREE.Vector3(1, 0, 0),
        place: (o) => new THREE.Vector3(num(o.params, 'hubRadius') || 0.12, 0.0, num(o.params, 'width') / 2 + 0.001),
        toValue: (w) => Math.abs(w.x)
      },
      // Revolve: radius scale (drag +X = wider) — the solid stands on +Y.
      {
        kind: 'rev-radius', mesh: revRadius, paramKey: 'scaleR', forTypes: ['revolve'], axis: new THREE.Vector3(1, 0, 0),
        place: (o) => new THREE.Vector3(this.revBase(o).maxRadius * num(o.params, 'scaleR'), this.revBase(o).height * num(o.params, 'scaleH') * 0.5, 0),
        toValue: (w, o) => Math.abs(w.x) / this.revBase(o).maxRadius
      },
      // Revolve: height scale (drag +Y = taller).
      {
        kind: 'rev-height', mesh: revHeight, paramKey: 'scaleH', forTypes: ['revolve'], axis: new THREE.Vector3(0, 1, 0),
        place: (o) => new THREE.Vector3(0, this.revBase(o).height * num(o.params, 'scaleH'), 0),
        toValue: (w, o) => Math.abs(w.y) / this.revBase(o).height
      },
      // Extrude: thickness (drag +Z = thicker). Handle sits on the front face.
      {
        kind: 'ext-depth', mesh: extDepth, paramKey: 'depth', forTypes: ['extrude'], axis: new THREE.Vector3(0, 0, 1),
        place: (o) => new THREE.Vector3(0, 0, num(o.params, 'depth') / 2),
        toValue: (w) => Math.abs(w.z) * 2
      },
      // Extrude: uniform scale (drag +X = bigger footprint).
      {
        kind: 'ext-scale', mesh: extScale, paramKey: 'scale', forTypes: ['extrude'], axis: new THREE.Vector3(1, 0, 0),
        place: (o) => new THREE.Vector3(this.extBase(o).halfW * num(o.params, 'scale'), 0, num(o.params, 'depth') / 2 + 0.001),
        toValue: (w, o) => Math.abs(w.x) / this.extBase(o).halfW
      }
    ]
    for (const d of this.defs) this.group.add(d.mesh)
  }

  // Cache the base silhouette extent per object id (recomputed on attach).
  private baseCache: { id: string; maxRadius: number; height: number } | null = null
  private revBase(o: SemanticObject): { maxRadius: number; height: number } {
    if (this.baseCache && this.baseCache.id === o.id) return this.baseCache
    const id = String(o.params['_objectId']?.value ?? o.id)
    const base = silhouetteBase(id)
    this.baseCache = { id: o.id, ...base }
    return this.baseCache
  }

  // Cache the base outline extent per object id (recomputed on attach).
  private extCache: { id: string; halfW: number; halfH: number } | null = null
  private extBase(o: SemanticObject): { halfW: number; halfH: number } {
    if (this.extCache && this.extCache.id === o.id) return this.extCache
    const id = String(o.params['_objectId']?.value ?? o.id)
    const base = outlineBase(id)
    this.extCache = { id: o.id, ...base }
    return this.extCache
  }

  // Extrude, revolve, wheels/tires each expose their own handles.
  attach(obj: SemanticObject | null) {
    const supported = obj && (obj.type === 'tire' || obj.type === 'wheel' || obj.type === 'revolve' || obj.type === 'extrude')
    this.obj = supported ? obj : null
    this.baseCache = null
    this.extCache = null
    this.group.visible = !!this.obj
    if (this.obj) this.reposition()
  }

  reposition() {
    if (!this.obj) return
    const type = this.obj.type
    for (const d of this.defs) {
      // A handle shows if it applies to this type AND its param exists.
      const applies = d.forTypes.includes(type) && d.paramKey in this.obj.params
      d.mesh.visible = applies
      if (applies) d.mesh.position.copy(d.place(this.obj))
    }
  }

  get isDragging() {
    return !!this.dragging
  }

  private ndc(ev: PointerEvent): THREE.Vector2 {
    const rect = this.dom.getBoundingClientRect()
    return new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -(((ev.clientY - rect.top) / rect.height) * 2 - 1)
    )
  }

  // Returns true if a handle was hit (so the caller can suppress orbit/select).
  onPointerDown(ev: PointerEvent): boolean {
    if (!this.obj) return false
    this.raycaster.setFromCamera(this.ndc(ev), this.camera)
    const hits = this.raycaster.intersectObjects(this.defs.filter((d) => d.mesh.visible).map((d) => d.mesh), false)
    if (hits.length === 0) return false
    this.dragging = this.defs.find((d) => d.mesh === hits[0].object) || null
    return !!this.dragging
  }

  onPointerMove(ev: PointerEvent) {
    if (!this.obj) return
    if (this.dragging) {
      const world = this.dragOntoAxis(ev, this.dragging)
      if (world) {
        const value = this.dragging.toValue(world, this.obj)
        this.onDrag?.({ key: this.dragging.paramKey, value })
      }
      return
    }
    // hover highlight
    this.raycaster.setFromCamera(this.ndc(ev), this.camera)
    const hits = this.raycaster.intersectObjects(this.defs.filter((d) => d.mesh.visible).map((d) => d.mesh), false)
    const next = hits.length ? this.defs.find((d) => d.mesh === hits[0].object) || null : null
    if (next !== this.hot) {
      if (this.hot) (this.hot.mesh.material as THREE.MeshBasicMaterial).color.setHex(COLOR)
      if (next) (next.mesh.material as THREE.MeshBasicMaterial).color.setHex(COLOR_HOT)
      this.hot = next
      this.dom.style.cursor = next ? 'grab' : ''
    }
  }

  onPointerUp() {
    if (this.dragging) {
      this.dragging = null
      this.reposition()
      this.onDragEnd?.()
    }
  }

  // Project the pointer ray onto the line through origin along the handle's axis,
  // returning the closest world point (so dragging feels 1:1 along that axis).
  private dragOntoAxis(ev: PointerEvent, d: HandleDef): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(ev), this.camera)
    const ray = this.raycaster.ray
    // Use a plane containing the axis and most facing the camera.
    const axis = d.axis
    // plane normal = axis x (axis x camDir) -> a plane that contains the axis.
    const camDir = new THREE.Vector3()
    this.camera.getWorldDirection(camDir)
    let n = new THREE.Vector3().crossVectors(axis, camDir)
    if (n.lengthSq() < 1e-6) n = new THREE.Vector3(0, 1, 0)
    n.crossVectors(n, axis).normalize()
    const plane = new THREE.Plane(n, 0)
    const hit = new THREE.Vector3()
    if (!ray.intersectPlane(plane, hit)) return null
    // project hit onto the axis line through origin
    const t = hit.dot(axis)
    return axis.clone().multiplyScalar(t)
  }
}
