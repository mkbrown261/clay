# Clay (codename MeshDraw) — Progress Log
> Append-only. Newest at top. This is the "what actually happened" ledger.

## 2026-07-14 — Session 4: Milestone 1 (draw→promote→solve→handles) + Milestone 2 (Revolve) + deploy
**North star (restated by user):** "The object should always be an idea." Every milestone must end with something **visible + interactive**. "WE NEED TO BE ABLE TO DRAW PERIOD NOT CLICK."

**Done — Milestone 1: blank canvas → draw → "I think it's a Wheel 98%" → promote → constraint solver + drag handles**
- App now **starts empty** (no auto-loaded tire). `#empty-state` overlay ("Draw something") until the first object exists.
- Draw flow: `beginCanvasDraw()` faces the camera and draws on the new **FRONT** plane (XY, normal +Z) so a screen-circle stays a true circle (fixes GROUND-plane ellipse distortion). `inferCanvas(raw)` → guess → promote card.
- `promoteToWheel(radius)` seeds the driver `radius` from the drawing. Constraint solver (`solve`) annotates drivers with `affects[]` and appends `derived:true` params; panel renders derived rows + affects chips.
- Direct-manipulation **blue drag handles** (radius / width / hub) — drag reshapes geometry and updates the panel live.
- Fixes: sketch overlay no longer intercepts pointer after drawing; `finish()` caches `getBoundingClientRect()` **before** hiding the overlay (hidden canvas returned 0-rect → NaN → no profile).
- E2E `test/milestone1-flow.mjs` (real chromium): draw circle → promote → drag radius 0.33→0.64, derived rows + affects chips update. **PASS, 0 JS errors.** Committed `65e53ba`.
- Screenshots purged per user demand; `.gitignore` blocks `test/*.png`. Committed `e8c0acd`.
- Pushed to GitHub `mkbrown261/clay` (main). Token scrubbed from remote URL (user warned to rotate).

**Done — Milestone 2: draw a SILHOUETTE → revolve into a live watertight solid** (the "draw your own mesh" mission)
- `client/generators/revolve.ts` — silhouette (raw FRONT-plane stroke) → fold to +X half-plane (x=radius≥0, y=height) → sort by height → cap to axis → CCW cross-section → `Manifold.revolve(new CrossSection([pts]), segments, angle)` → `.rotate([-90,0,0])` to stand upright on +Y. Per-object silhouette Map. Drivers: angle(360), segments(96), scaleR, scaleH, wallSolid.
- `infer.ts` detects **open+tall** silhouette → Revolve (vs round closed loop → Wheel; unknown falls back to Revolve). Returns raw `silhouette` + `worldProfile`.
- `scene.promoteToRevolve()`, `REVOLVE_CONSTRAINTS` (derived: sweepFraction, facetAngle), clay ceramic material, **rev-radius / rev-height** drag handles (type-aware via `forTypes`).
- E2E `test/milestone2-flow.mjs`: draw vase silhouette → "Revolved Form" 97% → promote → **79,872-tri watertight axisymmetric solid**, height 0.881 m → drag rev-radius → scaleR 1→2.09, width 0.484→1.012. **PASS, 0 JS errors.** Committed `64046c5`, pushed to GitHub.

**Deployed** → https://clay-meshdraw.pages.dev (Cloudflare Pages, deploy `17171de8`, wrangler BYOK token). Verified prod serves the new empty-state + silhouette copy; real-browser load clean (0 JS errors).
- Root cause of "only lets me draw a rim / tire on at startup": prod was **stale** (old Step B build `d23728d3`) — the earlier session's deploys never included Milestones 1–2. This deploy fixes it.

**Security:** user re-pasted GitHub PAT and Cloudflare token (`cfut_…`) in chat — **must rotate both.** Neither committed; CF token used only as an inline env var for one deploy.

**Next** — extrude generator (Milestone 3 candidate), SuperSplat BYO-splat importer, full "Clay" rename across docs.

## 2026-07-14 — Session 3 (cont.): Step B — the Sketch Engine (DRAW the rim)
**North-star reframing (user, to revisit after Step B)**
- Clay is a **Constraint Solver**, not a "Wheel Generator". Change Radius → Outer Diameter, Circumference, Hub, Sidewall, Tread all derive. Every parameter should declare *what it affects* (a dependency graph) so AI changes RELATIONSHIPS, not guesses.
- **Direct manipulation UX**: keep sliders, but make geometry grabbable — drag the outside → radius grows, drag width → widens, drag hub → hub grows, drag spoke → spokes change. Panel updates live while dragging.
- Rule for every milestone: **end with something visible + interactive.**
- Name = **Clay** (philosophy, malleable, never "finished/dead"), not MeshDraw (a feature).
- These are logged as the Step-C direction; Step B (draw a rim) shipped first.

**Done — Step B Sketch Engine**
- `client/sketch/stroke.ts` — pure stroke math: resample, Chaikin `smooth`, `looksClosed`, `bounds`, `signedArea`, `ensureCCW`, `toClosedProfile`.
- `client/sketch/engine.ts` — `SketchEngine`: overlay `<canvas>`, pointer capture, `screenToPlane()` raycasts each point onto the wheel face plane (z=faceZ, normal +Z), emits cleaned closed CCW profile in wheel-local metres.
- `client/sketch/infer.ts` — toggleable "what are you drawing?" `inferShape()` (local heuristic: roundness/corners/aspect → circle | N-point star | spoke | shape). LLM later, same interface.
- `client/generators/rim.ts` — `RimGenerator`. Drawn profile → `Manifold.extrude` (depth, centred on Z) → radial-repeat N (`.rotate([0,0,deg])`) OR freehand (keep strokes) → `union` hub cylinder + bead barrel. Profiles stored per-object id in a module Map (ParamMap holds only scalars). Seats at tire `rBead` → no gap.
- `client/generators/tire.ts` — Tire split into its own standalone generator/object (reuses `buildTireManifold`).
- `client/scene.ts` — multi-object `Scene`: tire + rim independent, selectable, removable; `applyRimDrawing()` creates/replaces rim keeping its id; empty profiles = re-seat only (tire resize preserves drawing).
- `client/viewport/viewport.ts` — rewritten: `entries` map (multi-mesh), `upsert/remove/select`, click-to-select raycast, `faceCamera()` ease-in, per-type materials, `getExportGroup()`, `setInteractionEnabled()`.
- `client/main.ts` — wires Scene + SketchEngine + inference; toggles (radialRepeat default ON count 5, freehand, inference default ON); object list with remove; Draw/Finish/Cancel flow.
- UI (`src/index.tsx`, `clay.css`): Draw Rim button, floating draw-controls panel, Objects list.
- Verified: client build 1,532 kB, 22 modules, no stray chunks; server built; PM2 restarted; prod + sandbox load with **zero JS errors** (PlaywrightConsoleCapture). Rim pipeline **smoke-tested headless in node** → valid manifold 882 verts / 1760 tris, bbox ±0.30 (seat 0.28 = tire rBead ⇒ connected).
- Committed `8e44cfe`. Deployed → https://clay-meshdraw.pages.dev (deploy 64b71bfa).

**Verified with REAL browser interaction** (installed chromium + system libs; local playwright now works)
- `test/draw-flow.mjs` — drives real pointer events: Draw Rim → stroke → asserts a Rim object appears, zero JS errors. PASS on local + prod.
- `test/shot.mjs` / `shot2.mjs` — screenshot harness (cache-bypass) for visual review.
- `bridgeArm()` auto-connect: welds hub↔spoke↔barrel so imperfect drawings still yield ONE watertight solid. Headless topo check: `parts:1, genus:5` (5 spoke windows), volume>0. Toggle 'Auto-connect spokes' (default ON).
- Confirmed prod bundle SHA == local; stale earlier screenshot was browser cache only. Deploy 64b71bfa→d23728d3.

**Next** — Step C: constraint graph (params declare what they affect) + direct-manipulation drag handles (grab geometry, panel updates live).

## 2026-07-14 — Session 3: Wheel v4 (Step A) — tire substrate + removable rim placeholder
**Decisions**
- D-007: **Tire is the parametric substrate; the RIM is DRAWN by the user** (Step B). No fake spoke-count / dish / lug sliders. Until a rim is drawn, show a minimal dished-disc placeholder — not a fake generator.
- D-008: Sketch Engine plan locked: draw ONE spoke → radial-repeat N (default ON, count adjustable) → toggle OFF for full freehand. "What are you drawing?" inference is ON by default but **toggleable**. Clay assists; never hijacks.

**Done — wheel.ts v4**
- Unified axis: tire + rim both authored as `Manifold.revolve()` cross-sections on the same Z-axis → **no tire↔rim gap**, correct orientation. Both meet exactly at `rBead`.
- Removed fake params: spokes, spokeWidth, dish, hubRadius, lugs. New param set: radius, width, aspect(Sidewall Ratio), shoulder, treadDepth, treadCount, rubberType, wear.
- `buildTireManifold()` and `buildRimManifold()` are **separate exported builders** → enables Step B independent, removable tire/rim objects.
- Built (clay.js 1,517.94 kB), no stray chunks, server built, PM2 restarted. Verified clean (no JS errors) locally + on prod via PlaywrightConsoleCapture.
- Committed `c0de9e8`. Deployed → https://clay-meshdraw.pages.dev (deploy 3821c5f0).

**Next — Step B (Sketch Engine)** — NOT started. Draw stroke → close loop → spoke profile → revolve/extrude via manifold → selectable/removable rim; redraw replaces. Radial-repeat + freehand toggles; toggleable inference.

## 2026-07-14 — Session 2: Name = Clay + Wheel prototype BUILT
**Decisions**
- D-005: **Name locked → "Clay"** (feeling B: living/malleable; never dead geometry). "MeshDraw" retained as internal codename.
- D-006: Build system = **dual Vite build**. `CLIENT=1 vite build` bundles the three.js app to `public/static/clay.js`; `vite build` builds the Hono server to `dist/`. Hono serves an HTML shell.

**Done — V0.5 Wheel smart primitive (the reference implementation)**
- Installed three.js `0.185.1` (OrbitControls, TransformControls, GLTFExporter present).
- `client/semantic/types.ts` — SemanticObject, Param, ParamMap, `uid`, `withParam` (immutable), `groupParams`, `num`, `str`.
- `client/generators/registry.ts` — Generator interface + register/get/list.
- `client/generators/wheel.ts` — WheelGenerator: params → BufferGeometry (lathe tire w/ bevel, wrapped tread blocks, rim ring, hub, spokes). `effectiveTread()` couples rubberType + wear to tread depth. Custom position-only `mergeGeometries()`.
- `client/viewport/viewport.ts` — Viewport class: scene/lights/grid/orbit/transform gizmo; `render(obj)` regenerates mesh; used `getHelper()` for TransformControls r0.185.
- `client/ui/panel.ts` — contextual panel generated from param groups (range/enum/bool rows), live value readouts.
- `client/export/glb.ts` — GLB export.
- `client/main.ts` — wires it all; toolbar (move/rotate/scale/wireframe/reset/export); param change → `withParam` → live `render`.
- `src/index.tsx` — Hono HTML shell + inline SVG favicon. `public/static/clay.css` dark studio UI.
- ecosystem.config.cjs (pm2 app "clay").

**Verified**
- Build: client 741kB (gzip 168kB) + server _worker.js 21kB. ✅
- Server: HTML/JS/CSS all 200. ✅
- Browser (PlaywrightConsoleCapture on public URL): WebGL initializes & renders, **no JS errors** in our code. ✅
- Geometry math sanity-checked (LatheGeometry finite verts). ✅
- Note: local headless screenshot/browser launch flaky in sandbox (WebGL software fallback) — not a code issue.

**Next steps**
1. Sketch Engine (draw → closed loop → mesh) — the other half of the demo.
2. AI layer once a valid LLM key is injected (current env token returns 401).
3. More generators (box/chair/sword/tree) + DNA + Intent Lock UI.

**Security note**
- User pasted a Cloudflare token + GitHub PAT in chat. Advised to ROTATE both; did NOT store/commit them. Will use setup_cloudflare_api_key / setup_github_environment (secure paths) when deploying.


## 2026-07-14 — Session 1: Planning & documentation foundation
**Done**
- Engaged the concept; identified 3 standout differentiators (Semantic Object, Intent Lock, contextual UI).
- Research pass validated feasibility & differentiation (see findings in 00_VISION.md §"Why this wins").
- Created living docs system:
  - `00_VISION.md` — thesis, why-it-wins, scope reality, non-goals, 4 engines.
  - `01_ARCHITECTURE.md` — tech choices (three.js + Hono/CF), layered arch, data flow, rules, open Qs.
  - `02_DATA_MODEL.md` — ★ full type/signature registry incl. SemanticObject, Param, Generator, Wheel schema, Intent/AI/DNA/Export sigs.
  - `03_ROADMAP.md` — V0 / V1 / V2 phases, risk register, demo success metric.
  - `06_NAMING.md` — name candidates & decision framework.
- Confirmed: three.js is correct for V1; do NOT build a renderer/engine.

**Decisions**
- D-001: Store objects as Semantic Objects (parametric), mesh is derived. (Core thesis.)
- D-002: Generators are pure `(params)=>BufferGeometry`.
- D-003: AI proposes param diffs + explanation; user Accepts. Intent Lock enforced at mutation layer.
- D-004: Keep working codename "MeshDraw" until name locked, to not block progress.

**Open questions** (see 01 §"Open architecture questions")
- Q-A1 state store, Q-A2 visual-binding metadata, Q-A3 undo model, Q-A5 AI guardrails.

**Next steps (proposed, awaiting user go-ahead)**
1. Lock the name feeling (draw / living / collaborator) → pick final name.
2. Scaffold V0: add three.js, build viewport + draw→closed-loop→flat mesh→extrude.
3. Wire first Semantic Object (freeform) + depth slider live-update.

**Blockers / needs from user**
- Name direction preference.
- Which smart primitive to prototype first for V1 (Wheel is the reference in docs).
- AI provider preference for /api/intent & /api/edit (affects guardrail design).
