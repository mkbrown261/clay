// analyze_mesh() E2E — Phase 1 "Geometry Intelligence" (the eyes).
//   blank canvas -> draw a TRIANGLE -> select it -> the panel shows a live
//   "Analysis" report (tri/vert count, watertight, corners, symmetry,
//   roundness, volume...) with values that make sense for a triangle
//   (NOT round, has corners, not perfectly symmetric on both axes) ->
//   drag an outline point -> the report updates to reflect the new shape.
//
// This proves Clay can now "see" what you drew, not just render it.

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

// --- Step 1: draw a TRIANGLE (deliberately non-round, has 3 sharp corners) ---
await page.click('#tool-draw')
await page.waitForTimeout(700)
const box = await (await page.$('#viewport')).boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

const R = 170
const verts = [
  [cx, cy - R],
  [cx + R * 0.87, cy + R * 0.5],
  [cx - R * 0.87, cy + R * 0.5],
  [cx, cy - R]
]
function lerpEdge(a, b, n) {
  const out = []
  for (let i = 0; i < n; i++) out.push([a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n)])
  return out
}
const stroke = []
for (let e = 0; e < verts.length - 1; e++) stroke.push(...lerpEdge(verts[e], verts[e + 1], 12))

await page.mouse.move(stroke[0][0], stroke[0][1])
await page.mouse.down()
for (let i = 1; i < stroke.length; i++) await page.mouse.move(stroke[i][0], stroke[i][1])
await page.mouse.up()
await page.waitForTimeout(900)

// --- Step 2: the panel must show an "Analysis" section (analyze_mesh() ran) ---
const hasAnalysisGroup = await page.$('.analysis-group')
if (hasAnalysisGroup) ok('Analysis group rendered in panel'); else fail('no Analysis group in panel')

const rows = await page.$$eval('.analysis-group .derived-row', (els) =>
  els.map((el) => ({
    key: el.getAttribute('data-key'),
    label: el.querySelector('label')?.childNodes[0]?.textContent?.trim(),
    value: el.querySelector('.derived-value')?.textContent?.trim()
  }))
)
console.log('  analysis rows:', JSON.stringify(rows))
const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))

if (rows.length >= 10) ok(`${rows.length} analysis rows present`); else fail(`too few analysis rows: ${rows.length}`)

// --- Step 3: sanity-check the VALUES for a triangle ---
const tris = Number(byKey.an_tris)
if (tris > 8) ok(`triangle count reported: ${tris}`); else fail('triangle count missing/too low')

if (byKey.an_watertight === 'Yes') ok('reported watertight (manifold-3d solid)'); else fail(`watertight should be Yes, got "${byKey.an_watertight}"`)

const corners = Number(byKey.an_corners)
if (corners >= 2 && corners <= 6) ok(`corner count plausible for a triangle: ${corners}`); else fail(`corner count implausible: ${corners}`)

const roundnessTxt = byKey.an_roundness || ''
const roundnessPct = Number(roundnessTxt.replace('%', ''))
if (roundnessPct < 75) ok(`roundness correctly low for a triangle: ${roundnessTxt}`); else fail(`roundness too high for a triangle: ${roundnessTxt}`)

if (byKey.an_convex === 'Yes') ok('triangle correctly reported convex'); else fail(`convexity should be Yes for a triangle, got "${byKey.an_convex}"`)

if (byKey.an_volume && /L|cm/.test(byKey.an_volume)) ok(`volume reported: ${byKey.an_volume}`); else fail('volume not reported sensibly')

// --- Step 4: drag a green outline control point -> analysis REFRESHES ---
const before = await page.evaluate(() => {
  const { viewport } = window.__clay
  const h = viewport.outlineHandles.group.children[0]
  const wp = h.getWorldPosition(new h.position.constructor())
  const p = wp.clone().project(viewport.camera)
  const rect = viewport.renderer.domElement.getBoundingClientRect()
  return {
    hx: rect.left + (p.x * 0.5 + 0.5) * rect.width,
    hy: rect.top + (-p.y * 0.5 + 0.5) * rect.height
  }
})
await page.mouse.move(before.hx, before.hy)
await page.waitForTimeout(150)
await page.mouse.down()
for (let i = 1; i <= 14; i++) { await page.mouse.move(before.hx - i * 12, before.hy - i * 10); await page.waitForTimeout(20) }
await page.mouse.up()
await page.waitForTimeout(600)

const rowsAfter = await page.$$eval('.analysis-group .derived-row', (els) =>
  Object.fromEntries(els.map((el) => [el.getAttribute('data-key'), el.querySelector('.derived-value')?.textContent?.trim()]))
)
console.log('  analysis after drag:', JSON.stringify(rowsAfter))

const trisAfter = Number(rowsAfter.an_tris)
const widthChanged = rowsAfter.an_width !== byKey.an_width
if (widthChanged || trisAfter !== tris) ok('analysis refreshed after reshaping the outline'); else fail('analysis did not update after drag')

console.log('JS ERRORS:', errors.length ? errors : 'none')
if (errors.length) failed = true

await browser.close()
if (failed) { console.error('\n=== ANALYZE_MESH E2E: FAIL ==='); process.exit(1) }
console.log('\n=== ANALYZE_MESH E2E: PASS (Clay can now SEE what you drew) ===')
