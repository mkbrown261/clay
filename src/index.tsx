import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Clay — Wheel Prototype</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='44' fill='%235b8cff'/%3E%3Ccircle cx='50' cy='50' r='14' fill='%230e1117'/%3E%3C/svg%3E" />
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="/static/clay.css" rel="stylesheet" />
</head>
<body>
  <header id="topbar">
    <div class="brand"><i class="fa-solid fa-cube"></i> Clay <span class="tag">wheel prototype</span></div>
    <div class="toolbar">
      <button id="tool-move" class="tool" title="Move (translate gizmo)"><i class="fa-solid fa-up-down-left-right"></i></button>
      <button id="tool-rotate" class="tool" title="Rotate gizmo"><i class="fa-solid fa-rotate"></i></button>
      <button id="tool-scale" class="tool" title="Scale gizmo"><i class="fa-solid fa-maximize"></i></button>
      <span class="divider"></span>
      <button id="tool-wire" class="tool" title="Toggle wireframe"><i class="fa-solid fa-diagram-project"></i></button>
      <button id="tool-reset" class="tool" title="Reset params"><i class="fa-solid fa-arrow-rotate-left"></i></button>
      <button id="tool-export" class="tool primary" title="Export GLB"><i class="fa-solid fa-download"></i> GLB</button>
    </div>
  </header>
  <main id="stage">
    <div id="viewport"></div>
    <aside id="panel"></aside>
  </main>
  <footer id="hint">Drag to orbit · scroll to zoom · edit any parameter to reshape the wheel live — the mesh is <em>derived</em> from the idea.</footer>
  <script type="module" src="/static/clay.js"></script>
</body>
</html>`)
})

export default app
