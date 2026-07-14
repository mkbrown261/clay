import { chromium } from 'playwright'
const URL = process.env.CLAY_URL || 'http://localhost:3000'
const browser = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, bypassCSP: true })
await ctx.route('**/*', (r) => r.continue())
const page = await ctx.newPage()
await page.goto(URL + '?nocache=' + Date.now(), { waitUntil: 'networkidle' })
await page.waitForSelector('#viewport canvas'); await page.waitForTimeout(1500)
await page.click('#tool-draw'); await page.waitForTimeout(700)
const b = await (await page.$('#viewport')).boundingBox()
const cx=b.x+b.width/2, cy=b.y+b.height/2, pts=[]
const ox=cx,oy=cy-120,w=26,h=90
for(let i=0;i<=48;i++){const t=(i/48)*Math.PI*2;pts.push([ox+Math.cos(t)*w,oy+Math.sin(t)*h])}
await page.mouse.move(pts[0][0],pts[0][1]); await page.mouse.down()
for(let i=1;i<pts.length;i++) await page.mouse.move(pts[i][0],pts[i][1])
await page.mouse.up(); await page.waitForTimeout(1000)
await page.mouse.move(cx,cy); await page.mouse.down(); await page.mouse.move(cx-180,cy-90,{steps:10}); await page.mouse.up()
await page.waitForTimeout(600)
await page.screenshot({ path: 'test/rim-shot.png' }); console.log('ok'); await browser.close()
