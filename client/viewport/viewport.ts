// Clay — three.js viewport. Renders the meshes DERIVED from the scene's Semantic
// Objects. Multi-object: tire + rim (+ future) coexist, each independently
// selectable and removable. Nothing here owns "truth" — it mirrors the scene.

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { SemanticObject } from '../semantic/types'
import { getGenerator } from '../generators/registry'

export type GizmoMode = 'translate' | 'rotate' | 'scale'

interface Entry {
  mesh: THREE.Mesh
  materials: THREE.MeshStandardMaterial[]
}

export class Viewport {
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  orbit: OrbitControls
  transform: TransformControls
  private entries = new Map<string, Entry>()
  private selectedId: string | null = null
  private wire = false
  onSelect?: (id: string | null) => void

  constructor(private container: HTMLElement) {
    const w = container.clientWidth
    const h = container.clientHeight

    this.scene.background = new THREE.Color(0x0e1117)

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100)
    this.camera.position.set(1.6, 1.1, 1.9)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.enabled = true
    container.appendChild(this.renderer.domElement)

    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1f2b, 0.8))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(3, 5, 2)
    key.castShadow = true
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0x88aaff, 0.6)
    fill.position.set(-3, 2, -2)
    this.scene.add(fill)

    const grid = new THREE.GridHelper(10, 40, 0x334155, 0x1e293b)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.5
    this.scene.add(grid)

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.target.set(0, 0, 0)

    this.transform = new TransformControls(this.camera, this.renderer.domElement)
    const helper = (this.transform as any).getHelper ? (this.transform as any).getHelper() : this.transform
    this.scene.add(helper)
    this.transform.addEventListener('dragging-changed', (e: any) => {
      this.orbit.enabled = !e.value
    })

    // Click-to-select.
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)

    window.addEventListener('resize', () => this.onResize())
    this.animate()
  }

  // Material palette per semantic type.
  private makeMaterials(type: string): THREE.MeshStandardMaterial[] {
    if (type === 'tire') {
      return [new THREE.MeshStandardMaterial({ color: 0x1c1f26, metalness: 0.05, roughness: 0.85 })]
    }
    if (type === 'rim') {
      return [new THREE.MeshStandardMaterial({ color: 0xb9c2d0, metalness: 0.9, roughness: 0.3 })]
    }
    // wheel = combined groups (rubber + metal)
    return [
      new THREE.MeshStandardMaterial({ color: 0x1c1f26, metalness: 0.05, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0xb9c2d0, metalness: 0.9, roughness: 0.3 })
    ]
  }

  setGizmoMode(mode: GizmoMode) {
    this.transform.setMode(mode)
  }

  setWireframe(on: boolean) {
    this.wire = on
    for (const e of this.entries.values()) e.materials.forEach((m) => (m.wireframe = on))
  }

  // Build/replace the mesh for one semantic object.
  upsert(obj: SemanticObject) {
    const geom = getGenerator(obj.type).generate(obj.params)
    let entry = this.entries.get(obj.id)
    if (!entry) {
      const materials = this.makeMaterials(obj.type)
      materials.forEach((m) => (m.wireframe = this.wire))
      const mesh = new THREE.Mesh(geom, materials.length === 1 ? materials[0] : materials)
      mesh.castShadow = true
      mesh.userData.semanticId = obj.id
      this.scene.add(mesh)
      entry = { mesh, materials }
      this.entries.set(obj.id, entry)
    } else {
      entry.mesh.geometry.dispose()
      entry.mesh.geometry = geom
    }
    const [px, py, pz] = obj.transform.position
    entry.mesh.position.set(px, py, pz)
  }

  remove(id: string) {
    const entry = this.entries.get(id)
    if (!entry) return
    if (this.selectedId === id) this.select(null)
    this.scene.remove(entry.mesh)
    entry.mesh.geometry.dispose()
    entry.materials.forEach((m) => m.dispose())
    this.entries.delete(id)
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  select(id: string | null) {
    this.selectedId = id
    if (id && this.entries.has(id)) {
      this.transform.attach(this.entries.get(id)!.mesh)
    } else {
      this.transform.detach()
    }
    this.onSelect?.(id)
  }

  get selected(): string | null {
    return this.selectedId
  }

  getMesh(id: string): THREE.Mesh | undefined {
    return this.entries.get(id)?.mesh
  }

  // A single merged mesh snapshot for export (clones all entries into one group).
  getExportGroup(): THREE.Group {
    const g = new THREE.Group()
    for (const e of this.entries.values()) g.add(e.mesh.clone())
    return g
  }

  private onPointerDown = (ev: PointerEvent) => {
    // Ignore if the transform gizmo is being dragged.
    if ((this.transform as any).dragging) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -(((ev.clientY - rect.top) / rect.height) * 2 - 1)
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const meshes = [...this.entries.values()].map((e) => e.mesh)
    const hits = ray.intersectObjects(meshes, false)
    if (hits.length > 0) {
      this.select(hits[0].object.userData.semanticId as string)
    }
  }

  // Ease the camera to face the wheel head-on for drawing.
  faceCamera(distance = 1.9, duration = 450) {
    const start = this.camera.position.clone()
    const end = new THREE.Vector3(0, 0, distance)
    const startTarget = this.orbit.target.clone()
    const endTarget = new THREE.Vector3(0, 0, 0)
    const t0 = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / duration)
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 // ease-in-out
      this.camera.position.lerpVectors(start, end, e)
      this.orbit.target.lerpVectors(startTarget, endTarget, e)
      this.orbit.update()
      if (t < 1) requestAnimationFrame(step)
    }
    step()
  }

  setInteractionEnabled(on: boolean) {
    this.orbit.enabled = on
    this.transform.enabled = on
    ;(this.transform as any).visible = on
  }

  private onResize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private animate = () => {
    requestAnimationFrame(this.animate)
    this.orbit.update()
    this.renderer.render(this.scene, this.camera)
  }
}
