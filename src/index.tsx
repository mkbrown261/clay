import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Clay — the object is always an idea</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='44' fill='%235b8cff'/%3E%3Ccircle cx='50' cy='50' r='14' fill='%230e1117'/%3E%3C/svg%3E" />
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="/static/clay.css" rel="stylesheet" />
</head>
<body>
  <header id="topbar">
    <div class="brand"><i class="fa-solid fa-cube"></i> Clay <span class="tag">draw → it's a solid → reshape</span></div>
    <div class="toolbar">
      <button id="tool-draw" class="tool primary" title="Draw any closed shape — it becomes that exact shape in 3D"><i class="fa-solid fa-pen-nib"></i> Draw</button>
      <span class="divider"></span>
      <button id="tool-move" class="tool" title="Move (translate gizmo)"><i class="fa-solid fa-up-down-left-right"></i></button>
      <button id="tool-rotate" class="tool" title="Rotate gizmo"><i class="fa-solid fa-rotate"></i></button>
      <button id="tool-scale" class="tool" title="Scale gizmo"><i class="fa-solid fa-maximize"></i></button>
      <span class="divider"></span>
      <button id="tool-wire" class="tool" title="Toggle wireframe"><i class="fa-solid fa-diagram-project"></i></button>
      <button id="tool-reset" class="tool" title="Clear the canvas"><i class="fa-solid fa-arrow-rotate-left"></i></button>
      <button id="tool-export" class="tool" title="Export GLB"><i class="fa-solid fa-download"></i> GLB</button>
    </div>
  </header>
  <main id="stage">
    <div id="viewport">
      <!-- Blank canvas prompt: shown until the first object exists -->
      <div id="empty-state">
        <div class="empty-card">
          <div class="empty-icon"><i class="fa-solid fa-pen-nib"></i></div>
          <h2>Draw something.</h2>
          <p>Sketch <strong>any closed shape</strong> — a star, a heart, a blob, a gear, a letter — and it instantly becomes a real 3D solid of <em>that exact shape</em>. Then drag the <span class="dot-green">green points</span> on the outline to reshape it, and the <span class="dot-blue">blue handles</span> to set thickness. The drawing is always editable — never a dead mesh.</p>
          <button id="empty-draw" class="tool primary"><i class="fa-solid fa-pen-nib"></i> Start drawing</button>
        </div>
      </div>

      <!-- Promotion prompt: "I think this is a Wheel (98%)" -->
      <div id="promote"></div>

      <!-- Draw controls (shown only while drawing): pick how the outline becomes 3D -->
      <div id="draw-controls">
        <div class="dc-title"><i class="fa-solid fa-pen-nib"></i> Draw a shape</div>
        <div class="dc-modes">
          <button id="mode-extrude" class="tool mode active" title="Keep your exact outline, give it thickness"><i class="fa-solid fa-cube"></i> Extrude</button>
          <button id="mode-revolve" class="tool mode" title="Spin a side profile into a round solid"><i class="fa-solid fa-wine-bottle"></i> Revolve</button>
        </div>
        <div id="draw-guess" class="dc-guess"></div>
        <div class="dc-actions">
          <button id="draw-cancel" class="tool"><i class="fa-solid fa-xmark"></i> Cancel</button>
        </div>
      </div>
    </div>
    <aside id="panel-wrap">
      <section id="objects">
        <h3>Objects</h3>
        <div id="object-list"></div>
      </section>
      <div id="panel"></div>
    </aside>
  </main>
  <footer id="hint">Draw any closed shape → it instantly becomes that exact solid → drag the <span class="dot-green">green outline points</span> to reshape, the <span class="dot-blue">blue handles</span> for thickness. The drawing is the object; the mesh is always <em>derived</em>, never final.</footer>
  <script type="module" src="/static/clay.js?v=${Date.now()}"></script>
</body>
</html>`)
})

export default app
