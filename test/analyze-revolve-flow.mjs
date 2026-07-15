// analyze_mesh() on a REVOLVE object — the other geometry branch (solid of
// revolution: symmetric by construction, roundness=1, corners come from the
// drawn SIDE PROFILE not the horizontal cross-section).

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

await page.click('#tool-draw')
await page.waitForTimeout(500)
await page.click('#mode-revolve')
await page.waitForTimeout(300)

const box = await (await page.$('#viewport')).boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

// Draw a vase-like silhouette (curvy right-hand profile), top to bottom.
const pts = []
for (let i = 0; i <= 40; i++) {
  const t = i / 40
  const y = cy - 150 + t * 300
  const r = 40 + 30 * Math.sin(t * Math.PI * 2) + 20 * Math.sin(t * Math.PI)
  pts.push([cx + r, y])
}

await page.mouse.move(pts[0][0], pts[0][1])
await page.mouse.down()
for (let i = 1; i < pts.length; i++) await page.mouse.move(pts[i][0], pts[i][1])
await page.mouse.up()
await page.waitForTimeout(1200)

const objs = await page.$$eval('#object-list .obj-row', (r) => r.map((x) => x.textContent.trim()))
console.log('  objects:', JSON.stringify(objs))

const rows = await page.$$eval('.analysis-group .derived-row', (els) =>
  Object.fromEntries(els.map((el) => [el.getAttribute('data-key'), el.querySelector('.derived-value')?.textContent?.trim()]))
)
console.log('  analysis:', JSON.stringify(rows))

if (Object.keys(rows).length >= 10) ok('Analysis rows present for revolve object'); else fail('no analysis rows for revolve')
if (rows.an_watertight === 'Yes') ok('revolve solid is watertight'); else fail(`expected watertight Yes, got ${rows.an_watertight}`)
if (rows.an_symmetry === 'X + Y axis') ok('full 360° revolve correctly reported as fully symmetric'); else fail(`expected X + Y axis symmetry, got ${rows.an_symmetry}`)
if (rows.an_roundness === '100%') ok('revolve roundness correctly reported as 100% (circular cross-section by construction)'); else fail(`expected 100% roundness, got ${rows.an_roundness}`)
if (Number(rows.an_tris) > 100) ok(`revolve triangle count sane: ${rows.an_tris}`); else fail('revolve triangle count too low')

console.log('JS ERRORS:', errors.length ? errors : 'none')
if (errors.length) failed = true

await browser.close()
if (failed) { console.error('\n=== ANALYZE_MESH REVOLVE E2E: FAIL ==='); process.exit(1) }
console.log('\n=== ANALYZE_MESH REVOLVE E2E: PASS ===')
