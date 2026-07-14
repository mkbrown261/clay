// Clay — client entry. Wires viewport + semantic object + contextual panel + export.

import { Viewport, type GizmoMode } from './viewport/viewport'
import { registerGenerator, getGenerator } from './generators/registry'
import { WheelGenerator } from './generators/wheel'
import { initManifold } from './generators/manifold'
import { uid, withParam, type Param, type SemanticObject } from './semantic/types'
import { renderPanel } from './ui/panel'
import { exportGLB } from './export/glb'

registerGenerator(WheelGenerator)

const viewportEl = document.getElementById('viewport') as HTMLElement
const panelEl = document.getElementById('panel') as HTMLElement
const viewport = new Viewport(viewportEl)

// Manifold (CAD kernel) must be ready before any generator runs.
await initManifold()

// Create the reference SemanticObject: a Wheel.
let active: SemanticObject = {
  id: uid('wheel'),
  type: 'wheel',
  label: 'Wheel',
  params: getGenerator('wheel').defaultParams(),
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
}

function refreshMesh() {
  viewport.render(active)
}

function rebuildPanel() {
  renderPanel(panelEl, active, (key: string, value: Param['value']) => {
    active = { ...active, params: withParam(active.params, key, value) }
    refreshMesh() // live regenerate — no "apply" button
  })
}

refreshMesh()
rebuildPanel()

// Toolbar wiring
const bind = (id: string, fn: () => void) =>
  document.getElementById(id)?.addEventListener('click', fn)

bind('tool-move', () => setGizmo('translate'))
bind('tool-rotate', () => setGizmo('rotate'))
bind('tool-scale', () => setGizmo('scale'))
bind('tool-wire', () => {
  wire = !wire
  viewport.setWireframe(wire)
  document.getElementById('tool-wire')?.classList.toggle('active', wire)
})
bind('tool-reset', () => {
  active = { ...active, params: getGenerator('wheel').defaultParams() }
  refreshMesh()
  rebuildPanel()
})
bind('tool-export', () => {
  const mesh = viewport.getMesh()
  if (mesh) exportGLB(mesh, `${active.label.toLowerCase()}.glb`)
})

let wire = false
function setGizmo(mode: GizmoMode) {
  viewport.setGizmoMode(mode)
  for (const id of ['tool-move', 'tool-rotate', 'tool-scale']) {
    document.getElementById(id)?.classList.toggle(
      'active',
      id === `tool-${mode === 'translate' ? 'move' : mode}`
    )
  }
}
setGizmo('translate')
