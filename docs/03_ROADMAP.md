# MeshDraw — Phased Roadmap
> Last updated: 2026-07-14 | Principle: ship a "skateboard," not half a car.

## V0 — Playground skateboard (prove the magic loop)
Goal: **draw a closed shape → it becomes a real 3D mesh you can rotate/move.** No AI yet.
- [ ] three.js viewport: scene, grid, lights, OrbitControls, TransformControls gizmo
- [ ] Toolbar: Draw / Select / Move / Rotate / Scale (local & global)
- [ ] Stroke Engine: capture pointer strokes on a draw plane
- [ ] Closure detection: open loop = nothing; closed loop = mesh
- [ ] Shape Engine: profile → `ShapeGeometry` (flat) → mesh in scene
- [ ] Extrude toggle: flat disk ↔ extruded (box/cylinder) via depth slider
- [ ] Revolve toggle: profile → `LatheGeometry` (circular/spherical extrude)
- [ ] Basic Semantic Object wrapper (even freeform) + live param (depth) slider
- [ ] Export GLB
**Exit criterion:** a non-technical user draws a squiggle circle, closes it, gets a disk, extrudes it into a cylinder, exports GLB. Feels instant.

## V1 — Smart primitives + Intent + Contextual UI (the product)
- [ ] Generator Registry + first 3–5 smart primitives (Wheel, Box, Chair, Sword/Tree)
- [ ] Contextual/morphing property panel driven by generator `contextualUI`
- [ ] Live editing: visual gizmo ↔ numeric ↔ (basic) chat, all mutate params
- [ ] Intent Engine: `/api/intent` returns ranked candidates → "What are you drawing?" chooser
- [ ] Natural-language edit: `/api/edit` → param diff + transparency panel (Accept/Undo/Modify)
- [ ] Intent Lock UI (🔒/🔓 per param group)
- [ ] `normalize()` (straighten/smooth) — distinct from generate
- [ ] DNA save/apply
- [ ] Persistence (localStorage → then D1/R2 with accounts)
**Exit criterion:** draw a circle → "Wheel?" → tune radius/spokes/tread live → "make it a monster-truck tire" → AI proposes diffs respecting locks → export.

## V2 — Pro workflow & fidelity
- [ ] Multi-view (top/front/side + perspective); combine views into form
- [ ] AI Detail Engine (add geometry, preserve silhouette)
- [ ] Topology-preserving refinement / retopo
- [ ] Material Engine (procedural + AI PBR textures, UVs)
- [ ] Inheritance graph (parent→child DNA), constraints (symmetry/mirror/snap)
- [ ] FBX / USD export, rigging groundwork
- [ ] Accounts, projects, sharing

## Risk register (revisit each phase)
| ID | Risk | Mitigation |
|----|------|-----------|
| R1 | AI generating novel topology is unsolved | Lead with parametric smart primitives + freeform fallback |
| R2 | Loop detection on messy strokes is fiddly | Generous closure tolerance + snap + "close shape" affordance |
| R3 | Contextual UI complexity explodes | Drive UI entirely from generator param schema (data, not code) |
| R4 | AI param-fill unreliability | Schema-constrained output; user always Accepts a diff |
| R5 | three.js perf with live regenerate | Debounce + geometry cache keyed by param hash |

## Success metric for the demo
"How has this never existed?" moment = draw → pick intent → drag one slider → watch mesh + related params update live, with zero waiting.
