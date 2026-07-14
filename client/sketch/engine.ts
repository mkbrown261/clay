// Clay — Sketch Engine. Lets the artist DRAW on the wheel's face plane.
// Flow: enter sketch mode -> camera eases to face the wheel -> an overlay <canvas>
// captures the freehand stroke -> on release we raycast each screen point onto the
// draw plane (the wheel face, plane normal = +Z through origin) to get wheel-local
// 2D coords in METRES -> emit a cleaned closed profile. The rim generator turns
// that profile into real geometry. Clay assists; it never draws for you.

import * as THREE from 'three'
import type { Vec2 } from './stroke'
import { toClosedProfile, bounds, looksClosed } from './stroke'

export interface SketchResult {
  profile: Vec2[] // cleaned, closed, CCW polygon in plane-local (u,v) metres
  worldProfile: Vec2[] // same points, but raw world (before cleanup) for centroid/radius
  rawClosed: boolean // did the user visibly close the loop?
}

export type SketchDoneCb = (result: SketchResult) => void

// A draw plane: a point + normal + an orthonormal (u,v) basis in the plane.
// Screen points raycast onto it become 2D (u,v) coordinates in metres.
export interface DrawPlane {
  origin: THREE.Vector3
  normal: THREE.Vector3
  u: THREE.Vector3
  v: THREE.Vector3
}

// Preset planes.
export const WHEEL_FACE = (z: number): DrawPlane => ({
  origin: new THREE.Vector3(0, 0, z),
  normal: new THREE.Vector3(0, 0, 1),
  u: new THREE.Vector3(1, 0, 0),
  v: new THREE.Vector3(0, 1, 0)
})
export const GROUND = (): DrawPlane => ({
  origin: new THREE.Vector3(0, 0, 0),
  normal: new THREE.Vector3(0, 1, 0),
  u: new THREE.Vector3(1, 0, 0),
  v: new THREE.Vector3(0, 0, -1)
})
// The front (XY) plane through the origin — the same plane a wheel lives in.
// Drawing here while the camera faces front keeps a screen-circle a true circle,
// and maps 1:1 to the promoted wheel's radius.
export const FRONT = (): DrawPlane => ({
  origin: new THREE.Vector3(0, 0, 0),
  normal: new THREE.Vector3(0, 0, 1),
  u: new THREE.Vector3(1, 0, 0),
  v: new THREE.Vector3(0, 1, 0)
})

export class SketchEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private drawing = false
  private screenPts: [number, number][] = []
  private active = false
  private plane: DrawPlane = GROUND()
  private onDone?: SketchDoneCb
  private ro?: ResizeObserver

  constructor(
    private container: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private renderer: THREE.WebGLRenderer
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'sketch-overlay'
    this.canvas.style.position = 'absolute'
    this.canvas.style.inset = '0'
    this.canvas.style.zIndex = '5'
    this.canvas.style.cursor = 'crosshair'
    this.canvas.style.display = 'none'
    this.canvas.style.touchAction = 'none'
    container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
    this.resize()

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)

    this.canvas.addEventListener('pointerdown', this.onDown)
    this.canvas.addEventListener('pointermove', this.onMove)
    this.canvas.addEventListener('pointerup', this.onUp)
    this.canvas.addEventListener('pointerleave', this.onUp)
  }

  get isActive(): boolean {
    return this.active
  }

  // Enter sketch mode on a given plane.
  begin(plane: DrawPlane, onDone: SketchDoneCb): void {
    this.active = true
    this.plane = plane
    this.onDone = onDone
    this.screenPts = []
    this.canvas.style.display = 'block'
    this.clear()
  }

  cancel(): void {
    this.active = false
    this.drawing = false
    this.screenPts = []
    this.canvas.style.display = 'none'
    this.clear()
  }

  private resize(): void {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const dpr = Math.min(window.devicePixelRatio, 2)
    this.canvas.width = w * dpr
    this.canvas.height = h * dpr
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private localXY(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  private onDown = (e: PointerEvent) => {
    if (!this.active) return
    this.drawing = true
    this.screenPts = [this.localXY(e)]
    this.canvas.setPointerCapture(e.pointerId)
  }

  private onMove = (e: PointerEvent) => {
    if (!this.active || !this.drawing) return
    this.screenPts.push(this.localXY(e))
    this.paint()
  }

  private onUp = (e: PointerEvent) => {
    if (!this.active || !this.drawing) return
    this.drawing = false
    this.finish()
  }

  private paint(): void {
    this.clear()
    const p = this.screenPts
    if (p.length < 2) return
    this.ctx.lineWidth = 2.5
    this.ctx.strokeStyle = '#5b8cff'
    this.ctx.lineJoin = 'round'
    this.ctx.lineCap = 'round'
    this.ctx.beginPath()
    this.ctx.moveTo(p[0][0], p[0][1])
    for (let i = 1; i < p.length; i++) this.ctx.lineTo(p[i][0], p[i][1])
    this.ctx.stroke()
    // glow trail
    this.ctx.strokeStyle = 'rgba(91,140,255,0.25)'
    this.ctx.lineWidth = 8
    this.ctx.stroke()
  }

  // Raycast a screen point onto the draw plane; return plane-local (u,v) metres.
  // `rect` is passed in so projection still works after the overlay is hidden.
  private screenToPlane(sx: number, sy: number, rect: DOMRect): Vec2 | null {
    const ndc = new THREE.Vector2(
      (sx / rect.width) * 2 - 1,
      -((sy / rect.height) * 2 - 1)
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const pl = this.plane
    const plane = new THREE.Plane(pl.normal.clone(), -pl.normal.dot(pl.origin))
    const hit = new THREE.Vector3()
    const ok = ray.ray.intersectPlane(plane, hit)
    if (!ok) return null
    // Project the hit into the plane's (u,v) basis, relative to origin.
    const rel = hit.sub(pl.origin)
    return [rel.dot(pl.u), rel.dot(pl.v)]
  }

  private finish(): void {
    const screen = this.screenPts
    // Capture the canvas rect for projection BEFORE we hide the overlay (a hidden
    // element reports a zero-sized rect, which would break the raycast).
    const rect = this.canvas.getBoundingClientRect()
    // Deactivate + hide the overlay BEFORE emitting, so the result callback can
    // hand control back to the viewport (handles/orbit) without the transparent
    // sketch canvas intercepting pointer events. Rim-draw loops re-begin() as needed.
    this.active = false
    this.canvas.style.display = 'none'
    this.clear()
    const bail = () => this.onDone?.({ profile: [], worldProfile: [], rawClosed: false })
    if (screen.length < 3) return bail()
    const world: Vec2[] = []
    for (const [sx, sy] of screen) {
      const w = this.screenToPlane(sx, sy, rect)
      if (w) world.push(w)
    }
    if (world.length < 3) return bail()
    const rawClosed = looksClosed(world)
    const b = bounds(world)
    // spacing scales with drawing size so tiny sketches still resample well.
    const spacing = Math.max(0.006, Math.hypot(b.w, b.h) * 0.02)
    const profile = toClosedProfile(world, spacing, 2)
    this.onDone?.({ profile, worldProfile: world, rawClosed })
  }

  dispose(): void {
    this.ro?.disconnect()
    this.canvas.remove()
  }
}
