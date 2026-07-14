// Clay — client entry. Blank canvas. You DRAW, not click.
// Flow: empty stage -> draw a shape -> Clay: "I think this is a Wheel (98%)" ->
// promote -> a live, editable Wheel appears -> hover shows blue handles ->
// drag the outside/width/hub -> geometry + constraint-derived panel update live.
// Then you can still Draw Rim on the wheel face. The object is always malleable.

import { Viewport, type GizmoMode } from './viewport/viewport'
import { registerGenerator, getGenerator } from './generators/registry'
import { TireGenerator } from './generators/tire'
import { RimGenerator } from './generators/rim'
import { RevolveGenerator } from './generators/revolve'
import { initManifold } from './generators/manifold'
import type { Param } from './semantic/types'
import { renderPanel } from './ui/panel'
import { exportGLB } from './export/glb'
import { Scene } from './scene'
import { SketchEngine, WHEEL_FACE, FRONT } from './sketch/engine'
import { inferShape, inferCanvas } from './sketch/infer'
import type { Vec2 } from './sketch/stroke'

registerGenerator(TireGenerator)
registerGenerator(RimGenerator)
registerGenerator(RevolveGenerator)

const viewportEl = document.getElementById('viewport') as HTMLElement
const panelEl = document.getElementById('panel') as HTMLElement
const emptyEl = document.getElementById('empty-state') as HTMLElement
const promoteEl = document.getElementById('promote') as HTMLElement
const viewport = new Viewport(viewportEl)

await initManifold()

const scene = new Scene(viewport)
const sketch = new SketchEngine(viewportEl, viewport.camera, viewport.renderer)

// session state
let radialRepeat = true
let repeatCount = 5
let inferOn = true
let freehandProfiles: Vec2[][] = []
let mode: 'idle' | 'draw-canvas' | 'draw-rim' = 'idle'
let pendingRadius = 0.5

// ---- live drag handles -> update param + panel ----
viewport.onHandleDrag = (e) => {
  const id = viewport.selected
  if (!id) return
  scene.updateParam(id, e.key, clampToParam(id, e.key, e.value))
  const obj = scene.get(id)
  if (obj) viewport.attachHandles(obj)
  refreshPanel() // panel updates WHILE dragging
  // keep rim seated if present
  if (scene.rim && obj?.type === 'tire') scene.applyRimDrawing(scene.tire!, [], { radialRepeat, repeatCount })
}
viewport.onHandleDragEnd = () => rebuildPanel()

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
  return (id && scene.get(id)) || scene.tire || scene.objects[0] || null
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
    if (obj.type === 'tire' && scene.rim) scene.applyRimDrawing(scene.tire!, [], { radialRepeat, repeatCount })
  })
  renderObjectList()
}

// Lightweight panel value refresh during drag (rebuild is cheap enough here).
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
    const icon = o.type === 'rim' ? 'fa-ring' : o.type === 'revolve' ? 'fa-wine-bottle' : 'fa-circle-dot'
    row.innerHTML = `<span class="obj-name"><i class="fa-solid ${icon}"></i> ${o.label}</span>`
    row.addEventListener('click', () => viewport.select(o.id))
    if (o.type === 'rim') {
      const del = document.createElement('button')
      del.className = 'obj-del'
      del.title = 'Remove rim'
      del.innerHTML = '<i class="fa-solid fa-trash"></i>'
      del.addEventListener('click', (e) => {
        e.stopPropagation()
        scene.remove(o.id)
        if (viewport.selected === o.id && scene.tire) viewport.select(scene.tire.id)
        rebuildPanel()
      })
      row.appendChild(del)
    }
    list.appendChild(row)
  }
  // toggle empty-state visibility
  emptyEl.style.display = scene.objects.length === 0 ? 'flex' : 'none'
}

// ===== BLANK CANVAS: draw a shape =====
let pendingSilhouette: Vec2[] = []

function beginCanvasDraw() {
  mode = 'draw-canvas'
  emptyEl.style.display = 'none'
  hidePromote()
  viewport.setInteractionEnabled(false)
  document.getElementById('tool-draw')?.classList.add('active')
  // Face the front plane so a screen-drawing maps 1:1 onto the object's own
  // plane (no perspective distortion): a circle stays a circle, a silhouette
  // keeps its true proportions.
  viewport.faceCamera(1.9, 400)
  sketch.begin(FRONT(), (res) => {
    viewport.setInteractionEnabled(true)
    document.getElementById('tool-draw')?.classList.remove('active')
    mode = 'idle'
    // Use the RAW worldProfile for detection (the cleaned `profile` is force-closed,
    // which would erase the open-silhouette signal we need for revolve).
    const raw = res.worldProfile.length >= 6 ? res.worldProfile : res.profile
    if (raw.length < 6) { renderObjectList(); return }
    const guess = inferCanvas(raw)
    pendingRadius = guess.radius || 0.5
    pendingSilhouette = guess.silhouette
    showPromote(guess)
  })
}

function showPromote(guess: ReturnType<typeof inferCanvas>) {
  const pct = Math.round(guess.confidence * 100)
  const confident = guess.confidence >= 0.6
  // What will "Promote" create? Wheel for round loops, Revolve for silhouettes,
  // and unknown falls back to a Revolve (a lathe works for almost any outline).
  const target: 'wheel' | 'revolve' = guess.type === 'wheel' ? 'wheel' : 'revolve'
  const targetLabel = target === 'wheel' ? 'Wheel' : 'Revolved Form'
  const sub = guess.type === 'unknown'
    ? `Not sure what that is — spin it into a Revolved Form?`
    : `Promote this drawing into a live, editable ${targetLabel}?`
  promoteEl.innerHTML = `
    <div class="promote-card">
      <div class="promote-title">Clay detected</div>
      <div class="promote-guess">
        <span class="promote-label">${guess.label}</span>
        <span class="promote-conf ${confident ? 'ok' : 'low'}">${pct}%</span>
      </div>
      <div class="promote-sub">${sub}</div>
      <div class="promote-actions">
        <button id="promote-yes" class="tool primary"><i class="fa-solid fa-check"></i> Promote to ${targetLabel}</button>
        <button id="promote-no" class="tool"><i class="fa-solid fa-xmark"></i> Discard</button>
      </div>
    </div>`
  promoteEl.style.display = 'flex'
  document.getElementById('promote-yes')?.addEventListener('click', () => {
    const obj = target === 'wheel'
      ? scene.promoteToWheel(pendingRadius)
      : scene.promoteToRevolve(pendingSilhouette)
    hidePromote()
    viewport.select(obj.id)
    viewport.attachHandles(obj)
    viewport.faceCamera(1.9, 500)
    rebuildPanel()
  })
  document.getElementById('promote-no')?.addEventListener('click', () => {
    hidePromote()
    renderObjectList()
  })
}
function hidePromote() { promoteEl.style.display = 'none' }

// ===== DRAW RIM (on the wheel face) =====
const guessEl = () => document.getElementById('draw-guess')
const drawControls = () => document.getElementById('draw-controls')

function beginRimDraw() {
  const t = scene.tire
  if (!t) return
  mode = 'draw-rim'
  freehandProfiles = []
  document.getElementById('tool-rim')?.classList.add('active')
  const dc = drawControls(); if (dc) dc.style.display = 'flex'
  viewport.setInteractionEnabled(false)
  viewport.faceCamera()
  const g = guessEl(); if (g) g.textContent = 'Draw a spoke on the wheel face…'
  const plane = WHEEL_FACE(scene.tireFaceZ(t))
  const loop = () => {
    sketch.begin(plane, (result) => {
      if (result.profile.length < 3) { if (mode === 'draw-rim') loop(); return }
      if (inferOn) {
        const gg = inferShape(result.profile)
        const g2 = guessEl(); if (g2) g2.textContent = `Clay: I think this is a ${gg.label}. ${gg.hint}`
      }
      if (radialRepeat) {
        commitRim([result.profile])
      } else {
        freehandProfiles.push(result.profile)
        const g3 = guessEl(); if (g3) g3.textContent = `Freehand: ${freehandProfiles.length} stroke(s). Draw more or click Finish.`
        commitRim(freehandProfiles, true)
        if (mode === 'draw-rim') loop()
      }
    })
  }
  loop()
}

function commitRim(profiles: Vec2[][], keepDrawing = false) {
  const t = scene.tire!
  const rim = scene.applyRimDrawing(t, profiles, { radialRepeat, repeatCount })
  renderObjectList()
  if (!keepDrawing) {
    endRimDraw()
    viewport.select(rim.id)
    rebuildPanel()
  }
}

function endRimDraw() {
  sketch.cancel()
  mode = 'idle'
  document.getElementById('tool-rim')?.classList.remove('active')
  const dc = drawControls(); if (dc) dc.style.display = 'none'
  viewport.setInteractionEnabled(true)
}

// ===== Toolbar wiring =====
const bind = (id: string, fn: (e?: Event) => void) =>
  document.getElementById(id)?.addEventListener('click', fn)

bind('tool-draw', () => (mode === 'draw-canvas' ? sketch.cancel() : beginCanvasDraw()))
bind('empty-draw', () => beginCanvasDraw())
bind('tool-rim', () => (mode === 'draw-rim' ? endRimDraw() : beginRimDraw()))
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
  exportGLB(group, 'clay-wheel.glb')
})

bind('draw-finish', () => { if (freehandProfiles.length > 0) commitRim(freehandProfiles); else endRimDraw() })
bind('draw-cancel', () => endRimDraw())

const repeatToggle = document.getElementById('toggle-repeat') as HTMLInputElement | null
repeatToggle?.addEventListener('change', () => {
  radialRepeat = repeatToggle.checked
  const cnt = document.getElementById('repeat-count-row')
  if (cnt) cnt.style.display = radialRepeat ? 'flex' : 'none'
})
const repeatCountInput = document.getElementById('repeat-count') as HTMLInputElement | null
const repeatCountOut = document.getElementById('repeat-count-val')
repeatCountInput?.addEventListener('input', () => {
  repeatCount = Number(repeatCountInput.value)
  if (repeatCountOut) repeatCountOut.textContent = String(repeatCount)
})
const inferToggle = document.getElementById('toggle-infer') as HTMLInputElement | null
inferToggle?.addEventListener('change', () => {
  inferOn = inferToggle.checked
  const g = guessEl(); if (!inferOn && g) g.textContent = 'Inference off — draw freely.'
})

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
// Harmless in production (read-only handles to already-public state).
;(window as unknown as { __clay?: unknown }).__clay = { scene, viewport }
