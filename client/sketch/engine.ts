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
  profile: Vec2[] // cleaned, closed, CCW polygon in wheel-face local metres
  rawClosed: boolean // did the user visibly close the loop?
}

export type SketchDoneCb = (result: SketchResult) => void

// The draw plane is the wheel's front face: z = planeZ, normal +Z.
export class SketchEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private drawing = false
  private screenPts: [number, number][] = []
  private active = false
  private planeZ = 0
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

  // Enter sketch mode. planeZ = the wheel face plane (front of the tire).
  begin(planeZ: number, onDone: SketchDoneCb): void {
    this.active = true
    this.planeZ = planeZ
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

  // Raycast a screen point onto the draw plane (z = planeZ), return world XY.
  private screenToPlane(sx: number, sy: number): Vec2 | null {
    const rect = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      (sx / rect.width) * 2 - 1,
      -((sy / rect.height) * 2 - 1)
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -this.planeZ)
    const hit = new THREE.Vector3()
    const ok = ray.ray.intersectPlane(plane, hit)
    if (!ok) return null
    return [hit.x, hit.y]
  }

  private finish(): void {
    const screen = this.screenPts
    this.clear()
    if (screen.length < 3) {
      this.onDone?.({ profile: [], rawClosed: false })
      return
    }
    const world: Vec2[] = []
    for (const [sx, sy] of screen) {
      const w = this.screenToPlane(sx, sy)
      if (w) world.push(w)
    }
    if (world.length < 3) {
      this.onDone?.({ profile: [], rawClosed: false })
      return
    }
    const rawClosed = looksClosed(world)
    const b = bounds(world)
    // spacing scales with drawing size so tiny sketches still resample well.
    const spacing = Math.max(0.006, Math.hypot(b.w, b.h) * 0.02)
    const profile = toClosedProfile(world, spacing, 2)
    this.onDone?.({ profile, rawClosed })
  }

  dispose(): void {
    this.ro?.disconnect()
    this.canvas.remove()
  }
}
