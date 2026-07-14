// Milestone 1 real-browser E2E:
//   blank canvas -> draw a circle -> "I think it's a Wheel" -> promote ->
//   a live editable Wheel appears -> drag the radius handle -> geometry + panel update.
//
// Asserts each visible/interactive step so we KNOW it works, not just compiles.

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
await page.waitForTimeout(1500) // manifold init

// --- Step 0: blank canvas ---
const emptyVisible = await page.$eval('#empty-state', (e) => getComputedStyle(e).display !== 'none')
const startObjs = await page.$$eval('#object-list .obj-row', (r) => r.length)
if (!emptyVisible) fail('empty-state should be visible on load'); else ok('blank canvas: empty-state shown')
if (startObjs !== 0) fail(`expected 0 objects at start, got ${startObjs}`); else ok('blank canvas: 0 objects')

// --- Step 1: draw a circle on the canvas ---
await page.click('#tool-draw')
await page.waitForTimeout(700) // let the camera ease to front finish before drawing

const vp = await page.$('#viewport')
const box = await vp.boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

function circlePoints(radiusPx) {
  const pts = []
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * Math.PI * 2
    pts.push([cx + Math.cos(t) * radiusPx, cy + Math.sin(t) * radiusPx])
  }
  return pts
}
const pts = circlePoints(150)
await page.mouse.move(pts[0][0], pts[0][1])
await page.mouse.down()
for (let i = 1; i < pts.length; i++) await page.mouse.move(pts[i][0], pts[i][1])
await page.mouse.up()
await page.waitForTimeout(600)

// --- Step 2: promotion prompt appears with a Wheel guess ---
const promoteVisible = await page.$eval('#promote', (e) => getComputedStyle(e).display !== 'none')
if (!promoteVisible) fail('promote card should appear after drawing'); else ok('promote card shown')
const guessLabel = await page.$eval('.promote-label', (e) => e.textContent).catch(() => '')
const guessConf = await page.$eval('.promote-conf', (e) => e.textContent).catch(() => '')
console.log('  guess:', JSON.stringify(guessLabel), guessConf)
if (!/wheel/i.test(guessLabel)) fail(`expected Wheel guess, got "${guessLabel}"`); else ok('detected a Wheel')

// --- Step 3: promote to a live Wheel ---
await page.click('#promote-yes')
await page.waitForTimeout(900) // camera ease + build

const afterPromote = await page.$$eval('#object-list .obj-row', (r) => r.map((x) => x.textContent.trim()))
console.log('  objects after promote:', JSON.stringify(afterPromote))
if (!afterPromote.some((t) => /wheel/i.test(t))) fail('no Wheel object after promote'); else ok('Wheel object created')

// panel should show the promoted wheel + derived params + affects chips
const hasDerived = await page.$$eval('.derived-row', (r) => r.length)
const hasAffects = await page.$$eval('.affects', (r) => r.length)
if (hasDerived === 0) fail('no derived rows in panel'); else ok(`derived rows: ${hasDerived}`)
if (hasAffects === 0) fail('no affects chips in panel'); else ok(`affects chips: ${hasAffects}`)

// --- Step 4: read radius BEFORE drag, then drag the radius handle ---
const radiusBefore = await page.evaluate(() => window.__clay.scene.tire.params.radius.value)
const outerDiaBefore = await page.evaluate(() => window.__clay.scene.tire.params.outerDiameter?.value)
console.log('  radius before:', radiusBefore, 'outerDia:', outerDiaBefore)

// Find the radius handle's screen position by projecting its world position.
const handleScreen = await page.evaluate(() => {
  const { scene, viewport } = window.__clay
  const THREE = viewport.camera.constructor // not reliable; use viewport internals
  const r = scene.tire.params.radius.value
  // radius handle sits at world (radius, 0, 0)
  const v = { x: r, y: 0, z: 0 }
  const cam = viewport.camera
  // manual project using camera matrices
  const pos = new (cam.position.constructor)(v.x, v.y, v.z)
  pos.project(cam)
  const rect = viewport.renderer.domElement.getBoundingClientRect()
  return {
    x: rect.left + (pos.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-pos.y * 0.5 + 0.5) * rect.height
  }
})
console.log('  radius handle screen:', handleScreen)

// Hover to highlight, then drag outward (increase radius).
await page.mouse.move(handleScreen.x, handleScreen.y)
await page.waitForTimeout(150)
await page.mouse.down()
// drag further out along +X (screen right-ish); do several steps
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(handleScreen.x + i * 14, handleScreen.y, { steps: 1 })
  await page.waitForTimeout(20)
}
await page.mouse.up()
await page.waitForTimeout(400)

const radiusAfter = await page.evaluate(() => window.__clay.scene.tire.params.radius.value)
const outerDiaAfter = await page.evaluate(() => window.__clay.scene.tire.params.outerDiameter?.value)
console.log('  radius after:', radiusAfter, 'outerDia:', outerDiaAfter)

if (!(radiusAfter > radiusBefore + 0.001)) {
  fail(`dragging radius handle did not increase radius (${radiusBefore} -> ${radiusAfter})`)
} else ok(`radius handle drag increased radius ${radiusBefore} -> ${radiusAfter}`)

// derived outerDiameter must track radius*2 (constraint solver live)
if (outerDiaAfter != null && Math.abs(outerDiaAfter - radiusAfter * 2) < 0.01) {
  ok(`derived outerDiameter tracks radius (${outerDiaAfter} ≈ 2×${radiusAfter})`)
} else {
  fail(`outerDiameter (${outerDiaAfter}) does not track 2×radius (${radiusAfter})`)
}

// panel value text should reflect the new radius
const panelRadiusText = await page.$$eval('.param-row', (rows) => {
  const r = rows.find((x) => x.dataset.key === 'radius')
  return r ? r.querySelector('.param-value')?.textContent : null
})
console.log('  panel radius text:', panelRadiusText)
if (panelRadiusText && /m/.test(panelRadiusText)) ok('panel shows updated radius'); else fail('panel radius value missing')

console.log('JS ERRORS:', errors.length ? errors : 'none')
if (errors.length) failed = true

await browser.close()
if (failed) { console.error('\n=== MILESTONE 1 E2E: FAIL ==='); process.exit(1) }
console.log('\n=== MILESTONE 1 E2E: PASS (draw -> promote -> drag reshapes live) ===')
