// Milestone 2 real-browser E2E:
//   blank canvas -> draw an OPEN SILHOUETTE (half a vase outline) ->
//   "Revolved Form" -> promote -> a watertight solid of revolution appears ->
//   drag the radius handle -> the solid gets wider (geometry + panel update).
//
// This proves "draw your own mesh": the geometry IS the drawing, spun into a solid.

import { chromium } from 'playwright'

const URL = process.env.CLAY_URL || 'http://localhost:3000'
const errors = []
let failed = false
const fail = (msg) => { console.error('FAIL:', msg); failed = true }
const ok = (msg) => console.log('  ok:', msg)

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('#viewport canvas', { timeout: 20000 })
await page.waitForTimeout(1500)

// --- Step 1: draw an open vase silhouette (a curved outline, NOT a closed loop) ---
await page.click('#tool-draw')
await page.waitForTimeout(700)
const box = await (await page.$('#viewport')).boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

// Draw from top to bottom, x wiggling (narrow neck -> wide belly -> narrow foot):
// classic vase profile. Open curve, endpoints far apart => silhouette.
function vaseSilhouette() {
  const pts = []
  const topY = cy - 200, botY = cy + 200
  const steps = 40
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const y = topY + (botY - topY) * t
    // radius profile: neck(narrow) -> belly(wide) -> foot(narrow)
    const belly = Math.sin(t * Math.PI) // 0..1..0
    const x = cx + 40 + belly * 110 // offset right so it's one side of the axis
    pts.push([x, y])
  }
  return pts
}
const pts = vaseSilhouette()
await page.mouse.move(pts[0][0], pts[0][1])
await page.mouse.down()
for (let i = 1; i < pts.length; i++) await page.mouse.move(pts[i][0], pts[i][1])
await page.mouse.up()
await page.waitForTimeout(600)

// --- Step 2: promotion prompt says "Revolved Form" ---
const promoteVisible = await page.$eval('#promote', (e) => getComputedStyle(e).display !== 'none')
if (!promoteVisible) fail('promote card should appear'); else ok('promote card shown')
const guessLabel = await page.$eval('.promote-label', (e) => e.textContent).catch(() => '')
const guessConf = await page.$eval('.promote-conf', (e) => e.textContent).catch(() => '')
console.log('  guess:', JSON.stringify(guessLabel), guessConf)
if (!/revolv/i.test(guessLabel)) fail(`expected a Revolved Form guess, got "${guessLabel}"`); else ok('detected a Revolved Form')

// --- Step 3: promote -> live solid of revolution ---
await page.click('#promote-yes')
await page.waitForTimeout(1000)

const objs = await page.$$eval('#object-list .obj-row', (r) => r.map((x) => x.textContent.trim()))
console.log('  objects:', JSON.stringify(objs))
if (!objs.some((t) => /revolv/i.test(t))) fail('no Revolve object after promote'); else ok('Revolve object created')

// The mesh must be a real, non-empty solid (many triangles).
const meshInfo = await page.evaluate(() => {
  const { scene, viewport } = window.__clay
  const rev = scene.objects.find((o) => o.type === 'revolve')
  if (!rev) return null
  const mesh = viewport.getMesh(rev.id)
  const pos = mesh?.geometry?.getAttribute('position')
  const idx = mesh?.geometry?.getIndex()
  // rough bounding box of the geometry
  mesh.geometry.computeBoundingBox()
  const bb = mesh.geometry.boundingBox
  return {
    verts: pos ? pos.count : 0,
    tris: idx ? idx.count / 3 : 0,
    size: { x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z }
  }
})
console.log('  mesh:', JSON.stringify(meshInfo))
if (!meshInfo || meshInfo.tris < 50) fail('revolve mesh has too few triangles (not a solid)'); else ok(`solid mesh: ${meshInfo.tris} triangles`)
// A revolved solid should be roughly axisymmetric: x-extent ≈ z-extent, and stand up (y height > 0).
if (meshInfo && meshInfo.size.y > 0.05) ok(`stands up: height ${meshInfo.size.y.toFixed(3)} m`); else fail('revolve has no height')
if (meshInfo && Math.abs(meshInfo.size.x - meshInfo.size.z) < Math.max(meshInfo.size.x, meshInfo.size.z) * 0.35) {
  ok(`axisymmetric: x=${meshInfo.size.x.toFixed(3)} ≈ z=${meshInfo.size.z.toFixed(3)}`)
} else fail(`not axisymmetric: x=${meshInfo?.size.x} z=${meshInfo?.size.z}`)

// --- Step 4: drag the radius handle -> the solid gets wider ---
const scaleRBefore = await page.evaluate(() => window.__clay.scene.objects.find((o) => o.type === 'revolve').params.scaleR.value)
const xBefore = meshInfo.size.x
const hs = await page.evaluate(() => {
  const { scene, viewport } = window.__clay
  const rev = scene.objects.find((o) => o.type === 'revolve')
  const handles = viewport.handles
  const d = handles.defs.find((h) => h.kind === 'rev-radius')
  const wp = d.mesh.getWorldPosition(new d.mesh.position.constructor())
  const p = wp.clone().project(viewport.camera)
  const rect = viewport.renderer.domElement.getBoundingClientRect()
  return { x: rect.left + (p.x * 0.5 + 0.5) * rect.width, y: rect.top + (-p.y * 0.5 + 0.5) * rect.height, visible: d.mesh.visible }
})
console.log('  rev-radius handle:', JSON.stringify(hs))
if (!hs.visible) fail('rev-radius handle not visible')
await page.mouse.move(hs.x, hs.y); await page.waitForTimeout(150)
await page.mouse.down()
for (let i = 1; i <= 10; i++) { await page.mouse.move(hs.x + i * 12, hs.y); await page.waitForTimeout(20) }
await page.mouse.up()
await page.waitForTimeout(400)

const scaleRAfter = await page.evaluate(() => window.__clay.scene.objects.find((o) => o.type === 'revolve').params.scaleR.value)
const xAfter = await page.evaluate(() => {
  const { scene, viewport } = window.__clay
  const rev = scene.objects.find((o) => o.type === 'revolve')
  const mesh = viewport.getMesh(rev.id)
  mesh.geometry.computeBoundingBox()
  const bb = mesh.geometry.boundingBox
  return bb.max.x - bb.min.x
})
console.log('  scaleR:', scaleRBefore, '->', scaleRAfter, '| x-extent:', xBefore.toFixed(3), '->', xAfter.toFixed(3))
if (scaleRAfter > scaleRBefore + 0.02) ok(`radius handle increased scaleR ${scaleRBefore} -> ${scaleRAfter}`); else fail('radius drag did not increase scaleR')
if (xAfter > xBefore + 0.01) ok(`solid got wider ${xBefore.toFixed(3)} -> ${xAfter.toFixed(3)} m`); else fail('solid did not widen')

console.log('JS ERRORS:', errors.length ? errors : 'none')
if (errors.length) failed = true

await browser.close()
if (failed) { console.error('\n=== MILESTONE 2 E2E: FAIL ==='); process.exit(1) }
console.log('\n=== MILESTONE 2 E2E: PASS (draw silhouette -> revolve into a live solid -> drag reshapes) ===')
