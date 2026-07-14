# MeshDraw — System Architecture
> Last updated: 2026-07-14 | Status: Draft v0.1

## Tech decision (V1)
- **Renderer:** three.js (r16x). Gives us OrbitControls, TransformControls (gizmos), Raycaster, geometry helpers (`ShapeGeometry`, `ExtrudeGeometry`, `LatheGeometry`), GLTF/OBJ/STL exporters — for free.
- **Frontend framework:** Vanilla TS + lightweight state store for V0; evaluate React/Svelte at V1 when contextual-UI panels grow.
- **App shell / API:** Hono on Cloudflare Pages (this repo). Static viewport + `/api/*` for AI calls (keys stay server-side).
- **AI layer:** server-side proxy routes to an LLM/vision model. Never expose keys to the browser.
- **Persistence:** Semantic Objects serialize to JSON ("DNA"). Cloudflare D1 (project/asset metadata) + R2 (exported binaries) when we add accounts. In-memory + localStorage for V0 playground.

## The layered architecture
```
MeshDraw
├── Viewport            three.js scene, camera, lights, grid, gizmos, raycasting
├── Stroke Engine       capture every stroke: points, pressure, speed, direction, curvature, closed?
├── Shape Engine        loop detection → triangulate → extrude / loft / revolve
├── Constraint Engine   snap, symmetry, grid, mirror
├── Intent Engine       AI classification → ranked candidates + prompt suggestions
├── Semantic Object     ★ SOURCE OF TRUTH — typed parametric description (see 02_DATA_MODEL.md)
├── Generator Registry  smart primitives: params → mesh (Wheel, Chair, Sword, Tree, Door...)
├── Refinement Engine   topology cleanup, smoothing, bevels (AI Sculptor)
├── Detail Engine (AI)  add geometry, preserve silhouette
├── Material Engine     procedural / AI textures, PBR
├── DNA / Inheritance   save, apply, parent→child param inheritance
└── Export              GLB / GLTF / OBJ / STL (USD/FBX later)
```

## Data flow (the golden path)
```
pointer events
   → StrokeEngine.captureStroke()        → Stroke[]
   → ShapeEngine.detectLoops(strokes)    → Loop[] (closed?)
   → ShapeEngine.buildProfile(loop)      → THREE.Shape (2D profile)
   → IntentEngine.classify(strokeData)   → IntentCandidate[]  (async, non-blocking)
   → [user picks candidate OR "freeform"]
   → SemanticObject created { type, params }
   → GeneratorRegistry.get(type).generate(params) → THREE.BufferGeometry
   → Viewport renders Mesh, binds to SemanticObject.id
   → user edits params (visual/numeric/chat) → regenerate() → live update
```

## Key architectural rules
1. **Mesh is derived, never authoritative.** Any edit mutates the Semantic Object, then `regenerate()`.
2. **Generators are pure functions:** `(params) => BufferGeometry`. Deterministic, testable, no side effects.
3. **AI is a mutation source, not a geometry source** (for parametric objects): it proposes param diffs, user accepts.
4. **Every AI action is transparent:** returns a diff + confidence, user Accept / Undo / Modify.
5. **Intent Lock is enforced at the mutation layer:** locked params cannot be changed by AI.
6. **Freeform fallback** produces a `type: "freeform"` Semantic Object holding the raw profile/mesh; still an object, just non-parametric.

## Module boundaries (folders — to be created as we build)
```
src/
  viewport/      scene, camera, controls, gizmos, raycast
  stroke/        capture + stroke math (curvature, closure)
  shape/         loop detection, triangulation, extrude/lathe/loft
  semantic/      SemanticObject types, store, serialization (DNA)
  generators/    registry + one file per smart primitive
  intent/        client for /api/intent classification
  refine/        topology + smoothing ops
  material/      PBR + texture
  ui/            contextual panels, toolbar, chat
  export/        GLB/OBJ/STL
server (Hono):
  src/index.tsx  app + /api routes
  /api/intent    classify strokes → candidates
  /api/edit      natural-language → param diff (guarded by Intent Lock)
```

## Open architecture questions (track & resolve)
- Q-A1: State store choice (Zustand-like vanilla vs signals vs framework)? — OPEN
- Q-A2: How is a param "editable visually" declared? (gizmo binding metadata on each param) — see 02
- Q-A3: Undo/redo model — command stack over Semantic Object diffs. — LEANING command-stack
- Q-A4: Multi-view (top/front/side + perspective) — V2, but keep camera abstraction ready.
- Q-A5: AI param-fill determinism / guardrails (schema-constrained output). — OPEN
