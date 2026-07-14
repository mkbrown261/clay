# Clay (codename: MeshDraw)

The first **intent-based 3D modeling platform**. You draw/define an idea; it becomes a *living, parametric asset* that knows what it is. The mesh is always **derived** from the idea — AI refines *your* creation, never replaces it.

> Full product thinking, architecture, data model and roadmap live in [`/docs`](./docs).

## Current status — V0.5: Wheel smart-primitive prototype ✅
The reference implementation of the core thesis is live: a fully **parametric Wheel** rendered in three.js. Every parameter (radius, width, sidewall, bevel, spokes, tread, rubber type, wear) reshapes the mesh **live** — no "apply" button — because the mesh is a pure function of the Semantic Object.

### What works now
- three.js viewport: lights, grid, **OrbitControls** (drag/zoom), **TransformControls** gizmo (move/rotate/scale)
- **Semantic Object + Param model** (`client/semantic/`) — the source of truth
- **Generator Registry** (pure `(params) => BufferGeometry`) with the **Wheel** generator
- **Contextual property panel** generated entirely from the param schema/groups (the UI *becomes* the object)
- Rubber type & wear meaningfully alter tread depth (mud = aggressive, destroyed = bald)
- Wireframe toggle, reset, **GLB export**

### Functional entry points
- `GET /` — the Clay app (HTML shell + `/static/clay.js` + `/static/clay.css`)
- Static assets served from `public/static/` (built) → `dist/static/`

### Not yet implemented
- Sketch/draw engine (draw closed loop → mesh) — V0 in roadmap
- Intent Engine (AI "what are you drawing?") — needs valid LLM key
- Natural-language edit ("make it a monster-truck tire") + Intent Lock
- `normalize()`, DNA/inheritance, more smart primitives, multi-view

### Recommended next steps
1. Add the **Sketch Engine** (pointer strokes → closed-loop detection → flat/extrude/revolve).
2. When an LLM key is provided: `/api/intent` + `/api/edit` (param-diff with transparency).
3. Grow the generator library (box, chair, sword, tree).

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
- **Last updated**: 2026-07-14
