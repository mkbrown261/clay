// Capture screenshots of the three key Milestone 1 states.
import { chromium } from 'playwright'

const URL = process.env.CLAY_URL || 'http://localhost:3000'
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('#viewport canvas', { timeout: 20000 })
await page.waitForTimeout(1500)

// 1) blank canvas
await page.screenshot({ path: 'test/m1-1-empty.png' })
console.log('shot 1: empty canvas')

// draw a circle
await page.click('#tool-draw'); await page.waitForTimeout(700)
const box = await (await page.$('#viewport')).boundingBox()
const cx = box.x + box.width / 2, cy = box.y + box.height / 2
await page.mouse.move(cx + 150, cy); await page.mouse.down()
for (let i = 1; i <= 60; i++) { const t = i / 60 * Math.PI * 2; await page.mouse.move(cx + Math.cos(t) * 150, cy + Math.sin(t) * 150) }
await page.mouse.up(); await page.waitForTimeout(700)

// 2) promote card
await page.screenshot({ path: 'test/m1-2-promote.png' })
console.log('shot 2: promote card')

// promote + drag radius outward a bit
await page.click('#promote-yes'); await page.waitForTimeout(1000)
const hs = await page.evaluate(() => {
  const { scene, viewport } = window.__clay
  const r = scene.tire.params.radius.value
  const pos = new (viewport.camera.position.constructor)(r, 0, 0)
  pos.project(viewport.camera)
  const rect = viewport.renderer.domElement.getBoundingClientRect()
  return { x: rect.left + (pos.x * 0.5 + 0.5) * rect.width, y: rect.top + (-pos.y * 0.5 + 0.5) * rect.height }
})
await page.mouse.move(hs.x, hs.y); await page.waitForTimeout(150)
await page.mouse.down()
for (let i = 1; i <= 8; i++) { await page.mouse.move(hs.x + i * 12, hs.y); await page.waitForTimeout(20) }
// keep it pressed for the shot so the handle is highlighted, then move to hover
await page.mouse.up()
await page.mouse.move(hs.x + 96, hs.y) // hover the moved handle -> highlight
await page.waitForTimeout(400)

// 3) promoted wheel + handles + derived panel
await page.screenshot({ path: 'test/m1-3-wheel-handles.png' })
console.log('shot 3: wheel + handles + derived panel')

await browser.close()
console.log('done')
