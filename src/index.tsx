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
    <div class="brand"><i class="fa-solid fa-cube"></i> Clay <span class="tag">draw → promote → shape</span></div>
    <div class="toolbar">
      <button id="tool-draw" class="tool primary" title="Draw a shape on the canvas — Clay will tell you what it thinks it is"><i class="fa-solid fa-pen-nib"></i> Draw</button>
      <button id="tool-rim" class="tool" title="Draw a spoke/rim on the wheel face"><i class="fa-solid fa-ring"></i> Draw Rim</button>
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
          <p>Sketch a round shape on the canvas. Clay will guess what it is — then you promote it into a live, editable object you can grab and reshape.</p>
          <button id="empty-draw" class="tool primary"><i class="fa-solid fa-pen-nib"></i> Start drawing</button>
        </div>
      </div>

      <!-- Promotion prompt: "I think this is a Wheel (98%)" -->
      <div id="promote"></div>

      <!-- Rim drawing controls (shown only while drawing on the wheel face) -->
      <div id="draw-controls">
        <div class="dc-title"><i class="fa-solid fa-pen-nib"></i> Drawing the rim</div>
        <label class="dc-toggle"><input type="checkbox" id="toggle-repeat" checked /> <span>Radial repeat</span></label>
        <div class="dc-row" id="repeat-count-row">
          <span>Repeat count</span>
          <input type="range" id="repeat-count" min="3" max="12" step="1" value="5" />
          <span id="repeat-count-val" class="dc-val">5</span>
        </div>
        <label class="dc-toggle"><input type="checkbox" id="toggle-infer" checked /> <span>Ask “what are you drawing?”</span></label>
        <div id="draw-guess" class="dc-guess"></div>
        <div class="dc-actions">
          <button id="draw-finish" class="tool primary"><i class="fa-solid fa-check"></i> Finish</button>
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
  <footer id="hint">Draw → Clay guesses → promote to a live object → hover for blue handles → drag to reshape. Every parameter knows what it <em>affects</em>; the mesh is always <em>derived</em>, never final.</footer>
  <script type="module" src="/static/clay.js?v=${Date.now()}"></script>
</body>
</html>`)
})

export default app
