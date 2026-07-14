# MeshDraw — Progress Log
> Append-only. Newest at top. This is the "what actually happened" ledger.

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
