// Clay — GLB export via three's GLTFExporter.
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

export function exportGLB(object: THREE.Object3D, filename = 'clay-asset.glb'): void {
  const exporter = new GLTFExporter()
  exporter.parse(
    object,
    (result) => {
      const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
    (err) => console.error('GLB export failed', err),
    { binary: true }
  )
}
