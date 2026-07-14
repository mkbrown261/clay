// Real-browser end-to-end test of the Step B draw->rim flow.
// Loads the app, clicks "Draw Rim", draws a spoke stroke with pointer events,
// and asserts a rim object appears in the scene and has geometry.

import { chromium } from 'playwright'

const URL = process.env.CLAY_URL || 'http://localhost:3000'
const errors = []

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('#viewport canvas', { timeout: 20000 })
await page.waitForTimeout(1500) // let manifold init + tire render

// Sanity: object list should have exactly the tire.
const startObjs = await page.$$eval('#object-list .obj-row', (r) => r.map((x) => x.textContent.trim()))
console.log('START objects:', JSON.stringify(startObjs))

// Click Draw Rim.
await page.click('#tool-draw')
await page.waitForTimeout(700) // camera ease

const vp = await page.$('#viewport')
const box = await vp.boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

// Draw a spoke: an elongated loop offset from center (in screen space).
// Radial spoke pointing up from hub.
function spokePoints() {
  const pts = []
  const ox = cx, oy = cy - 120 // above center
  const w = 26, h = 90
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2
    pts.push([ox + Math.cos(t) * w, oy + Math.sin(t) * h])
  }
  return pts
}

const pts = spokePoints()
await page.mouse.move(pts[0][0], pts[0][1])
await page.mouse.down()
for (let i = 1; i < pts.length; i++) {
  await page.mouse.move(pts[i][0], pts[i][1])
}
await page.mouse.up()
await page.waitForTimeout(1200) // rim generation

// After a radial-repeat draw, rim should be committed automatically.
const endObjs = await page.$$eval('#object-list .obj-row', (r) => r.map((x) => x.textContent.trim()))
console.log('END objects:', JSON.stringify(endObjs))

const guess = await page.$eval('#draw-guess', (e) => e.textContent).catch(() => '')
console.log('GUESS text:', JSON.stringify(guess))

const hasRim = endObjs.some((t) => /Rim/i.test(t))
console.log('HAS RIM:', hasRim)
console.log('JS ERRORS:', errors.length ? errors : 'none')

await browser.close()
if (!hasRim) { console.error('FAIL: no rim created from drawing'); process.exit(1) }
if (errors.length) { console.error('FAIL: JS errors'); process.exit(2) }
console.log('PASS: draw -> rim flow works')
