// Clay — client entry. Blank canvas. You DRAW, and the drawing BECOMES the object.
// "The object should always be an idea."
//
// Flow: empty stage -> press Draw -> sketch ANY closed outline -> the moment you
// lift the pen it becomes a real 3D solid of that EXACT shape (extruded). No
// guessing, no "promote to a preset". Then:
//   - green points on the outline: drag one -> the shape reshapes live
//   - blue handles: drag thickness / scale
//   - the panel shows the drivers + what each affects; the mesh is always derived.

import { Viewport, type GizmoMode } from './viewport/viewport'
import { registerGenerator } from './generators/registry'
import { ExtrudeGenerator } from './generators/extrude'
import { RevolveGenerator } from './generators/revolve'
import { initManifold } from './generators/manifold'
import type { Param } from './semantic/types'
import { renderPanel } from './ui/panel'
import { exportGLB } from './export/glb'
import { Scene } from './scene'
import { SketchEngine, FRONT } from './sketch/engine'
import type { Vec2 } from './sketch/stroke'

// The two things you can draw into: a flat shape (extrude) or a spun form (revolve).
// Extrude is the DEFAULT — it keeps your exact outline. Revolve is an opt-in mode.
registerGenerator(ExtrudeGenerator)
registerGenerator(RevolveGenerator)

const viewportEl = document.getElementById('viewport') as HTMLElement
const panelEl = document.getElementById('panel') as HTMLElement
const emptyEl = document.getElementById('empty-state') as HTMLElement
const viewport = new Viewport(viewportEl)

await initManifold()

const scene = new Scene(viewport)
const sketch = new SketchEngine(viewportEl, viewport.camera, viewport.renderer)

// session state
let mode: 'idle' | 'draw' = 'idle'
// Draw mode: 'extrude' keeps the exact outline; 'revolve' spins it into a solid.
let drawMode: 'extrude' | 'revolve' = 'extrude'

// ---- live AXIS drag handles (thickness / scale / revolve) -> update param ----
viewport.onHandleDrag = (e) => {
  const id = viewport.selected
  if (!id) return
  scene.updateParam(id, e.key, clampToParam(id, e.key, e.value))
  const obj = scene.get(id)
  if (obj) viewport.attachHandles(obj)
  refreshPanel()
}
viewport.onHandleDragEnd = () => rebuildPanel()

// ---- live OUTLINE control-point drag -> reshape the actual drawing ----
viewport.onOutlineDrag = (e) => {
  const id = viewport.selected
  if (!id) return
  scene.reshapeOutlinePoint(id, e.index, e.to)
}
viewport.onOutlineDragEnd = () => {
  const id = viewport.selected
  const obj = id ? scene.get(id) : null
  if (obj) viewport.attachHandles(obj) // rebuild handle rings at new positions
  rebuildPanel()
}

function clampToParam(id: string, key: string, v: number): number {
  const p = scene.get(id)?.params[key]
  if (!p) return v
  const min = p.min ?? -Infinity
  const max = p.max ?? Infinity
  return Math.max(min, Math.min(max, v))
}

// selection -> panel + handles
viewport.onSelect = (id) => {
  const obj = (id && scene.get(id)) || null
  viewport.attachHandles(obj)
  rebuildPanel()
}

function currentObject() {
  const id = viewport.selected
  return (id && scene.get(id)) || scene.objects[scene.objects.length - 1] || null
}

function rebuildPanel() {
  const obj = currentObject()
  if (!obj) {
    panelEl.innerHTML = '<div class="panel-empty">Draw a shape to begin.</div>'
    renderObjectList()
    return
  }
  renderPanel(panelEl, obj, (key: string, value: Param['value']) => {
    scene.updateParam(obj.id, key, value)
    viewport.attachHandles(scene.get(obj.id)!)
  })
  renderObjectList()
}

function refreshPanel() {
  rebuildPanel()
}

function renderObjectList() {
  const list = document.getElementById('object-list')
  if (!list) return
  list.innerHTML = ''
  for (const o of scene.objects) {
    const row = document.createElement('div')
    row.className = 'obj-row' + (o.id === viewport.selected ? ' selected' : '')
    const icon = o.type === 'revolve' ? 'fa-wine-bottle' : 'fa-shapes'
    row.innerHTML = `<span class="obj-name"><i class="fa-solid ${icon}"></i> ${o.label}</span>`
    row.addEventListener('click', () => viewport.select(o.id))
    const del = document.createElement('button')
    del.className = 'obj-del'
    del.title = 'Delete'
    del.innerHTML = '<i class="fa-solid fa-trash"></i>'
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      scene.remove(o.id)
      const next = scene.objects[scene.objects.length - 1]
      viewport.select(next ? next.id : null)
      rebuildPanel()
    })
    row.appendChild(del)
    list.appendChild(row)
  }
  emptyEl.style.display = scene.objects.length === 0 ? 'flex' : 'none'
}

// ===== BLANK CANVAS: draw a shape, and it BECOMES an object immediately =====
function beginDraw() {
  mode = 'draw'
  emptyEl.style.display = 'none'
  viewport.setInteractionEnabled(false)
  document.getElementById('tool-draw')?.classList.add('active')
  setModeHint()
  // Face the FRONT plane so a screen-drawing maps 1:1 onto the object's own plane
  // (no perspective distortion): what you draw is exactly what you get.
  viewport.faceCamera(1.9, 400)
  sketch.begin(FRONT(), (res) => {
    viewport.setInteractionEnabled(true)
    document.getElementById('tool-draw')?.classList.remove('active')
    hideModeHint()
    mode = 'idle'
    // Need a real closed outline. `profile` is the cleaned, closed, CCW polygon.
    const outline = res.profile
    if (outline.length < 3) { renderObjectList(); return }
    // NO inference, NO promote gate: the drawing IS the object, right now.
    const obj = drawMode === 'revolve'
      ? scene.promoteToRevolve(res.worldProfile.length >= 6 ? res.worldProfile : outline)
      : scene.createExtrude(outline)
    viewport.select(obj.id)
    viewport.attachHandles(obj)
    viewport.faceCamera(1.9, 500)
    rebuildPanel()
  })
}

function setModeHint() {
  const g = document.getElementById('draw-guess')
  if (g) {
    g.textContent = drawMode === 'revolve'
      ? 'Revolve mode: draw a side profile — it spins into a round solid.'
      : 'Extrude mode: draw any closed shape — it becomes that exact shape in 3D.'
  }
  const dc = document.getElementById('draw-controls')
  if (dc) dc.style.display = 'flex'
}
function hideModeHint() {
  const dc = document.getElementById('draw-controls')
  if (dc) dc.style.display = 'none'
}

// ===== Toolbar wiring =====
const bind = (id: string, fn: (e?: Event) => void) =>
  document.getElementById(id)?.addEventListener('click', fn)

bind('tool-draw', () => (mode === 'draw' ? sketch.cancel() : beginDraw()))
bind('empty-draw', () => beginDraw())
bind('tool-move', () => setGizmo('translate'))
bind('tool-rotate', () => setGizmo('rotate'))
bind('tool-scale', () => setGizmo('scale'))
bind('tool-wire', () => {
  wire = !wire
  viewport.setWireframe(wire)
  document.getElementById('tool-wire')?.classList.toggle('active', wire)
})
bind('tool-reset', () => {
  for (const o of [...scene.objects]) scene.remove(o.id)
  viewport.attachHandles(null)
  viewport.select(null)
  rebuildPanel()
})
bind('tool-export', () => {
  if (scene.objects.length === 0) return
  const group = viewport.getExportGroup()
  exportGLB(group, 'clay-shape.glb')
})

// Draw-mode toggle (Extrude <-> Revolve). Lives in the draw-controls panel.
function setDrawMode(m: 'extrude' | 'revolve') {
  drawMode = m
  document.getElementById('mode-extrude')?.classList.toggle('active', m === 'extrude')
  document.getElementById('mode-revolve')?.classList.toggle('active', m === 'revolve')
  setModeHint()
}
bind('mode-extrude', () => setDrawMode('extrude'))
bind('mode-revolve', () => setDrawMode('revolve'))
bind('draw-cancel', () => { sketch.cancel(); hideModeHint(); document.getElementById('tool-draw')?.classList.remove('active'); viewport.setInteractionEnabled(true); mode = 'idle'; renderObjectList() })

let wire = false
function setGizmo(m: GizmoMode) {
  viewport.setGizmoMode(m)
  for (const id of ['tool-move', 'tool-rotate', 'tool-scale']) {
    document.getElementById(id)?.classList.toggle('active', id === `tool-${m === 'translate' ? 'move' : m}`)
  }
}

// Start empty. You draw.
rebuildPanel()

// Debug/test hook: lets the E2E harness inspect the live scene + viewport.
;(window as unknown as { __clay?: unknown }).__clay = { scene, viewport }
