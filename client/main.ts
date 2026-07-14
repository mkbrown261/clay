// Clay — client entry. Wires the multi-object Scene + viewport + contextual panel
// + Sketch Engine (draw a rim) + export. The mesh is always DERIVED from ideas.

import { Viewport, type GizmoMode } from './viewport/viewport'
import { registerGenerator, getGenerator } from './generators/registry'
import { TireGenerator } from './generators/tire'
import { RimGenerator } from './generators/rim'
import { initManifold } from './generators/manifold'
import type { Param } from './semantic/types'
import { renderPanel } from './ui/panel'
import { exportGLB } from './export/glb'
import { Scene } from './scene'
import { SketchEngine } from './sketch/engine'
import { inferShape } from './sketch/infer'
import type { Vec2 } from './sketch/stroke'

registerGenerator(TireGenerator)
registerGenerator(RimGenerator)

const viewportEl = document.getElementById('viewport') as HTMLElement
const panelEl = document.getElementById('panel') as HTMLElement
const viewport = new Viewport(viewportEl)

await initManifold()

const scene = new Scene(viewport)
const sketch = new SketchEngine(viewportEl, viewport.camera, viewport.renderer)

// Sketch session state (toggles live here).
let radialRepeat = true
let repeatCount = 5
let inferOn = true
let freehandProfiles: Vec2[][] = [] // accumulated strokes in freehand mode
let drawingRim = false

// ---- Build the starting scene: a Tire substrate.
const tire = scene.createTire()
viewport.select(tire.id)

function currentPanelObject() {
  const id = viewport.selected
  return (id && scene.get(id)) || scene.tire!
}

function rebuildPanel() {
  const obj = currentPanelObject()
  renderPanel(panelEl, obj, (key: string, value: Param['value']) => {
    scene.updateParam(obj.id, key, value)
    // If tire dims change, re-seat the rim so it never gaps.
    if (obj.type === 'tire' && scene.rim) {
      scene.applyRimDrawing(scene.tire!, [], { radialRepeat, repeatCount })
      // note: profiles preserved inside store; empty array here just re-seats + regenerates
    }
  })
  renderObjectList()
}

viewport.onSelect = () => rebuildPanel()

// ---- Object list (tire / rim) with select + remove.
function renderObjectList() {
  const list = document.getElementById('object-list')
  if (!list) return
  list.innerHTML = ''
  for (const o of scene.objects) {
    const row = document.createElement('div')
    row.className = 'obj-row' + (o.id === viewport.selected ? ' selected' : '')
    const icon = o.type === 'rim' ? 'fa-ring' : 'fa-circle-dot'
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
        if (viewport.selected === o.id) viewport.select(scene.tire!.id)
        rebuildPanel()
      })
      row.appendChild(del)
    }
    list.appendChild(row)
  }
}

rebuildPanel()

// ---- Sketch flow --------------------------------------------------------------
const guessEl = document.getElementById('draw-guess')
const drawControls = document.getElementById('draw-controls')

function setDrawUI(active: boolean) {
  drawingRim = active
  document.getElementById('tool-draw')?.classList.toggle('active', active)
  if (drawControls) drawControls.style.display = active ? 'flex' : 'none'
  viewport.setInteractionEnabled(!active)
  if (guessEl) guessEl.textContent = active ? 'Draw a spoke on the wheel face…' : ''
}

function beginDraw() {
  const t = scene.tire
  if (!t) return
  freehandProfiles = []
  setDrawUI(true)
  viewport.faceCamera()
  const planeZ = scene.tireFaceZ(t)
  const loop = () => {
    sketch.begin(planeZ, (result) => {
      if (result.profile.length < 3) {
        // too short — keep listening
        if (drawingRim) loop()
        return
      }
      if (inferOn) {
        const g = inferShape(result.profile)
        if (guessEl) guessEl.textContent = `Clay: I think this is a ${g.label}. ${g.hint}`
      }
      if (radialRepeat) {
        // Draw ONE, repeat N. Finalize immediately.
        commitRim([result.profile])
      } else {
        // Freehand: accumulate every stroke; "Finish" commits them all.
        freehandProfiles.push(result.profile)
        if (guessEl) guessEl.textContent = `Freehand: ${freehandProfiles.length} stroke(s). Draw more or click Finish.`
        commitRim(freehandProfiles, /*keepDrawing*/ true)
        if (drawingRim) loop()
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
    endDraw()
    viewport.select(rim.id)
    rebuildPanel()
  }
}

function endDraw() {
  sketch.cancel()
  setDrawUI(false)
}

// ---- Toolbar wiring -----------------------------------------------------------
const bind = (id: string, fn: (e?: Event) => void) =>
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
  if (scene.rim) scene.remove(scene.rim.id)
  const t = scene.tire!
  const dflt = getGenerator('tire').defaultParams()
  for (const k of Object.keys(dflt)) scene.updateParam(t.id, k, dflt[k].value)
  viewport.select(t.id)
  rebuildPanel()
})
bind('tool-export', () => {
  const group = viewport.getExportGroup()
  exportGLB(group, 'clay-wheel.glb')
})

// Draw + toggles
bind('tool-draw', () => (drawingRim ? endDraw() : beginDraw()))
bind('draw-finish', () => {
  if (freehandProfiles.length > 0) commitRim(freehandProfiles)
  else endDraw()
})
bind('draw-cancel', () => {
  if (scene.rim && freehandProfiles.length === 0) { /* keep existing rim */ }
  endDraw()
})

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
  if (!inferOn && guessEl) guessEl.textContent = 'Inference off — draw freely.'
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
