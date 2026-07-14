// Draw a rim, then screenshot the result from a 3/4 angle for visual review.
import { chromium } from 'playwright'
const URL = process.env.CLAY_URL || 'http://localhost:3000'
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('#viewport canvas', { timeout: 20000 })
await page.waitForTimeout(1500)

await page.click('#tool-draw')
await page.waitForTimeout(700)
const box = await (await page.$('#viewport')).boundingBox()
const cx = box.x + box.width / 2, cy = box.y + box.height / 2
const pts = []
const ox = cx, oy = cy - 120, w = 26, h = 90
for (let i = 0; i <= 48; i++) { const t = (i/48)*Math.PI*2; pts.push([ox+Math.cos(t)*w, oy+Math.sin(t)*h]) }
await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down()
for (let i=1;i<pts.length;i++) await page.mouse.move(pts[i][0], pts[i][1])
await page.mouse.up()
await page.waitForTimeout(1000)

// Orbit to a 3/4 view by dragging on the canvas.
await page.mouse.move(cx, cy); await page.mouse.down()
await page.mouse.move(cx - 180, cy - 90, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(600)

await page.screenshot({ path: 'test/rim-shot.png' })
console.log('screenshot saved')
await browser.close()
