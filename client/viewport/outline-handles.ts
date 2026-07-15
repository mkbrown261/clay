// Clay — Outline (control-point) handles for extruded shapes.
// This is what makes "the object is always an idea" literally true: the drawn
// outline is shown as a ring of small draggable points on the FRONT face of the
// solid. Grab any point and drag it in the drawing plane (XY) — the outline
// reshapes and the mesh regenerates live. You are still editing the DRAWING, not
// poking a dead mesh.
//
// These are distinct from the axis-slider Handles (radius/width/depth). They act
// on the per-object outline store in generators/extrude.ts.

import * as THREE from 'three'
import type { SemanticObject } from '../semantic/types'
import { num } from '../semantic/types'
import { normalizedOutline, getOutline } from '../generators/extrude'
import type { Vec2 } from '../sketch/stroke'

export interface OutlinePointDragEvent {
  index: number // which control point moved
  to: Vec2 // new position in RAW outline space (pre-normalisation, pre-scale)
}

const COLOR = 0x39d98a // green = editable geometry (distinct from blue axis handles)
const COLOR_HOT = 0x7bf5b8

export class OutlineHandles {
  group = new THREE.Group()
  private points: THREE.Mesh[] = []
  private obj: SemanticObject | null = null
  private dragging = -1
  private hot = -1
  private raycaster = new THREE.Raycaster()
  // Mapping from displayed point index -> index in the RAW outline array.
  private rawIndex: number[] = []
  private centroid: Vec2 = [0, 0]
  private scale = 1
  onDrag?: (e: OutlinePointDragEvent) => void
  onDragEnd?: () => void

  constructor(private camera: THREE.PerspectiveCamera, private dom: HTMLElement) {
    this.group.visible = false
  }

  private makePoint(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.022, 16, 12)
    const mat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.95, depthTest: false })
    const m = new THREE.Mesh(geo, mat)
    m.renderOrder = 1000
    return m
  }

  // Attach to an extrude object (or null / other type to hide).
  attach(obj: SemanticObject | null) {
    this.clear()
    if (!obj || obj.type !== 'extrude') {
      this.obj = null
      this.group.visible = false
      return
    }
    this.obj = obj
    this.group.visible = true
    this.rebuild()
  }

  private clear() {
    for (const m of this.points) {
      this.group.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.points = []
    this.rawIndex = []
  }

  // Build one draggable sphere per outline vertex (decimated so huge strokes stay
  // usable — we cap to ~48 evenly-spaced handles).
  private rebuild() {
    if (!this.obj) return
    const id = String(this.obj.params['_objectId']?.value ?? this.obj.id)
    const raw = getOutline(id)
    if (raw.length < 3) return

    // centroid + scale used to map raw outline -> world (matches normalizedOutline).
    let cx = 0
    let cy = 0
    for (const [x, y] of raw) { cx += x; cy += y }
    cx /= raw.length
    cy /= raw.length
    this.centroid = [cx, cy]
    this.scale = num(this.obj.params, 'scale') || 1

    const maxHandles = 48
    const stride = Math.max(1, Math.floor(raw.length / maxHandles))
    this.clear()
    for (let i = 0; i < raw.length; i += stride) {
      const m = this.makePoint()
      this.group.add(m)
      this.points.push(m)
      this.rawIndex.push(i)
    }
    this.reposition()
  }

  // Place each handle at its outline vertex, on the front face (z = +depth/2).
  reposition() {
    if (!this.obj) return
    const id = String(this.obj.params['_objectId']?.value ?? this.obj.id)
    const raw = getOutline(id)
    const [cx, cy] = this.centroid
    const s = num(this.obj.params, 'scale') || 1
    const zFront = num(this.obj.params, 'depth') / 2 + 0.001
    for (let k = 0; k < this.points.length; k++) {
      const ri = this.rawIndex[k]
      const p = raw[ri]
      if (!p) continue
      this.points[k].position.set((p[0] - cx) * s, (p[1] - cy) * s, zFront)
    }
  }

  get isDragging() {
    return this.dragging >= 0
  }

  private ndc(ev: PointerEvent): THREE.Vector2 {
    const rect = this.dom.getBoundingClientRect()
    return new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -(((ev.clientY - rect.top) / rect.height) * 2 - 1)
    )
  }

  onPointerDown(ev: PointerEvent): boolean {
    if (!this.obj || this.points.length === 0) return false
    this.raycaster.setFromCamera(this.ndc(ev), this.camera)
    const hits = this.raycaster.intersectObjects(this.points, false)
    if (hits.length === 0) return false
    this.dragging = this.points.indexOf(hits[0].object as THREE.Mesh)
    return this.dragging >= 0
  }

  onPointerMove(ev: PointerEvent) {
    if (!this.obj) return
    if (this.dragging >= 0) {
      const world = this.dragOntoFrontPlane(ev)
      if (world) {
        const s = num(this.obj.params, 'scale') || 1
        // Convert world XY back into RAW outline coords (undo scale + centroid).
        const to: Vec2 = [world.x / s + this.centroid[0], world.y / s + this.centroid[1]]
        this.onDrag?.({ index: this.rawIndex[this.dragging], to })
      }
      return
    }
    // hover highlight
    this.raycaster.setFromCamera(this.ndc(ev), this.camera)
    const hits = this.raycaster.intersectObjects(this.points, false)
    const next = hits.length ? this.points.indexOf(hits[0].object as THREE.Mesh) : -1
    if (next !== this.hot) {
      if (this.hot >= 0 && this.points[this.hot]) (this.points[this.hot].material as THREE.MeshBasicMaterial).color.setHex(COLOR)
      if (next >= 0) (this.points[next].material as THREE.MeshBasicMaterial).color.setHex(COLOR_HOT)
      this.hot = next
      this.dom.style.cursor = next >= 0 ? 'grab' : ''
    }
  }

  onPointerUp() {
    if (this.dragging >= 0) {
      this.dragging = -1
      this.rebuild()
      this.onDragEnd?.()
    }
  }

  // Intersect the pointer ray with the object's front face plane (constant z),
  // so dragging a control point moves it within the drawing plane.
  private dragOntoFrontPlane(ev: PointerEvent): THREE.Vector3 | null {
    if (!this.obj) return null
    this.raycaster.setFromCamera(this.ndc(ev), this.camera)
    const z = num(this.obj.params, 'depth') / 2 + 0.001
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z)
    const hit = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null
    return hit
  }
}
