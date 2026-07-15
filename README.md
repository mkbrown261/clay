# Clay (codename: MeshDraw)

The first **intent-based 3D modeling platform**. You draw/define an idea; it becomes a *living, parametric asset* that knows what it is. The mesh is always **derived** from the idea — AI refines *your* creation, never replaces it.

> Full product thinking, architecture, data model and roadmap live in [`/docs`](./docs).

## Current status — Draw ANY shape → exact solid + Phase 1 Geometry Intelligence ✅
Draw any closed outline and it becomes that **exact shape** in 3D (extrude), fully editable — drag the drawing's own points to reshape it live. Clay now also **understands** what you drew: `analyze_mesh()` (Phase 1 of the roadmap below) reads back tri/vert count, watertight/manifold status, genus, volume, surface area, bounding box, mirror symmetry, corner count, convexity, and a roundness score — all pure browser math (manifold-3d's own solid report + original 2D polygon heuristics), $0 compute, surfaced live in the panel.

### The roadmap (strategic outline, in ship order)
1. **✅ Geometry Intelligence** (`analyze_mesh()`) — Clay can now "see" any object it holds.
2. **Geometry Repair & Optimization** — `repair_topology`, `remesh`, `smooth`, `decimate` (LODs).
3. **Deformation** — extend outline-point dragging into real deformation fields (push/pull/bend regions, not just vertices).
4. **Material Intelligence** — PBR/MaterialX; Clay understands "leather", not "brown".
5. **AI Reasoning Layer** — an LLM reads intent and emits calls against this curated tool set (analyze, repair, remesh, deform, apply_material...). Small toolbox, not raw ops.
6. **Spatial / Texture / Generative** — CV (OpenCV/SAM), Gaussian-splat→mesh, image→3D. Deferred.

Every phase: owned-or-free math only (MIT/MPL libs, published algorithms — no GPL, no per-call server bills), browser-first (WASM on the user's device), and ends with something visible + interactive.

### What works now
- three.js viewport: lights, grid, **OrbitControls** (drag/zoom), **TransformControls** gizmo (move/rotate/scale)
- **Draw → exact solid**: any closed outline → `Manifold.extrude()` (default) or a drawn side-profile → `Manifold.revolve()` (opt-in toggle) — real CAD-grade watertight solids via manifold-3d (MIT, WASM, $0/call)
- **Live-editable drawing**: green outline control points (drag → reshape the actual outline, mesh rebuilds live) + blue axis handles (thickness/scale)
- **`analyze_mesh()`** (`client/analysis/analyzeMesh.ts`) — the "Analysis" panel group: triangles, vertices, watertight, genus, volume, surface area, width/height/depth, symmetry (X/Y), corner count, convexity, roundness %. Recomputed on every edit.
- **Semantic Object + Param model** (`client/semantic/`) — the source of truth; **Constraint Solver** (`client/semantic/constraints.ts`) — drivers declare what they `affects`, derived values recompute automatically
- **Generator Registry** (pure `(params) => BufferGeometry`) with `Extrude` and `Revolve` generators
- **Contextual property panel** generated entirely from the param schema/groups (the UI *becomes* the object)
- Wireframe toggle, reset, object list (multi-shape scenes), **GLB export**

### Functional entry points
- `GET /` — the Clay app (HTML shell + `/static/clay.js` + `/static/clay.css` + `/static/manifold.wasm`)
- Static assets served from `public/static/` (built) → `dist/static/`

### Not yet implemented
- Phases 2–6 above (repair/remesh/decimate, deformation fields, PBR materials, AI tool-calling layer, CV/generative)
- Intent Engine / natural-language edit — needs a valid LLM key
- DNA/inheritance, multi-view

### Recommended next steps
1. Phase 2: `repair_topology` / `remesh` / `smooth` / `decimate` — all published/owned algorithms, browser-side, informed by the `analyze_mesh()` report.
2. Phase 3: turn outline-point dragging into real deformation fields.
3. When an LLM key is provided: wire the AI Reasoning Layer against this curated tool set.

## Data architecture
- **Data model**: `SemanticObject { type, params, transform }` where `params: Record<string, Param>`. See `docs/02_DATA_MODEL.md`.
- **Storage**: in-memory for the prototype (localStorage/D1/R2 planned with accounts).

## Tech stack
- three.js `0.185` · TypeScript · Vite (dual build: client bundle + Hono server) · Hono on Cloudflare Pages

## Local dev
```bash
npm run build            # builds client bundle + server
pm2 start ecosystem.config.cjs
curl http://localhost:3000
```

## Deployment
- **Platform**: Cloudflare Pages · **Status**: ✅ Live
- **Production**: https://clay-meshdraw.pages.dev
- **Last updated**: 2026-07-15
