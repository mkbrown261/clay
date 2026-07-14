// Clay — Manifold (CAD-grade solid geometry) integration.
// manifold-3d is MIT-licensed, runs fully in-browser via WASM. No fees, no API.
// This gives us real booleans (subtract/union) so we can CUT tread grooves,
// bolt holes, spoke windows, etc. — production-grade solids, not fake box art.

import Module from 'manifold-3d'
import * as THREE from 'three'
import type { ManifoldToplevel } from 'manifold-3d'

// The wasm is copied to public/static/ at build time (see package.json build:client).
const wasmUrl = '/static/manifold.wasm'

let _mod: ManifoldToplevel | null = null
let _initPromise: Promise<ManifoldToplevel> | null = null

// Initialize once. Safe to call repeatedly; returns the cached toplevel.
export async function initManifold(): Promise<ManifoldToplevel> {
  if (_mod) return _mod
  if (!_initPromise) {
    _initPromise = Module({ locateFile: () => wasmUrl }).then((m) => {
      m.setup()
      _mod = m
      return m
    })
  }
  return _initPromise
}

// Convenience: throws if not yet initialized (generators call this synchronously
// after the app has awaited initManifold() at startup).
export function M(): ManifoldToplevel {
  if (!_mod) throw new Error('Manifold not initialized — await initManifold() first')
  return _mod
}

// Convert a Manifold solid to a three.js BufferGeometry (positions + normals).
export function manifoldToGeometry(manifold: any): THREE.BufferGeometry {
  const mesh = manifold.getMesh()
  const geo = new THREE.BufferGeometry()
  // vertProperties is xyz (+ optional extra props); numProp tells stride.
  const numProp = mesh.numProp
  const verts = mesh.vertProperties
  const positions = new Float32Array((verts.length / numProp) * 3)
  for (let i = 0, j = 0; i < verts.length; i += numProp, j += 3) {
    positions[j] = verts[i]
    positions[j + 1] = verts[i + 1]
    positions[j + 2] = verts[i + 2]
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1))
  geo.computeVertexNormals()
  return geo
}
