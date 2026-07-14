// Clay — three.js viewport. Renders the mesh DERIVED from the active SemanticObject.

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { SemanticObject } from '../semantic/types'
import { getGenerator } from '../generators/registry'

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export class Viewport {
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  orbit: OrbitControls
  transform: TransformControls
  private mesh?: THREE.Mesh
  private material: THREE.MeshStandardMaterial

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

    // Lighting
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1f2b, 0.8))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(3, 5, 2)
    key.castShadow = true
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0x88aaff, 0.6)
    fill.position.set(-3, 2, -2)
    this.scene.add(fill)

    // Grid + ground
    const grid = new THREE.GridHelper(10, 40, 0x334155, 0x1e293b)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.5
    this.scene.add(grid)

    this.material = new THREE.MeshStandardMaterial({
      color: 0x8ea2c6,
      metalness: 0.4,
      roughness: 0.55,
      flatShading: false
    })

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.target.set(0, 0, 0)

    this.transform = new TransformControls(this.camera, this.renderer.domElement)
    // three r0.185: TransformControls exposes a helper object to add to the scene
    const helper = (this.transform as any).getHelper ? (this.transform as any).getHelper() : this.transform
    this.scene.add(helper)
    this.transform.addEventListener('dragging-changed', (e: any) => {
      this.orbit.enabled = !e.value
    })

    window.addEventListener('resize', () => this.onResize())
    this.animate()
  }

  setGizmoMode(mode: GizmoMode) {
    this.transform.setMode(mode)
  }

  setWireframe(on: boolean) {
    this.material.wireframe = on
  }

  // Build/replace the mesh from the semantic object's generator.
  render(obj: SemanticObject) {
    const geom = getGenerator(obj.type).generate(obj.params)
    if (!this.mesh) {
      this.mesh = new THREE.Mesh(geom, this.material)
      this.mesh.castShadow = true
      this.mesh.userData.semanticId = obj.id
      this.scene.add(this.mesh)
      this.transform.attach(this.mesh)
    } else {
      this.mesh.geometry.dispose()
      this.mesh.geometry = geom
    }
    const [px, py, pz] = obj.transform.position
    this.mesh.position.set(px, py, pz)
  }

  getMesh(): THREE.Mesh | undefined {
    return this.mesh
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
