# MeshDraw — Vision & Product Thesis
> Working codename: **MeshDraw** (final name TBD — see `06_NAMING.md`)
> Status: Planning / Requirements
> Last updated: 2026-07-14

---

## One-line pitch
**The first intent-based 3D modeling platform.** You draw an idea; it becomes a *living, parametric asset* that understands what it is — and AI refines *your* creation without ever replacing it.

## The philosophical shift (the whole company)
> The object should never just be a mesh. The object should always be an **idea**. The mesh is simply one *representation* of that idea.

Traditional DCC tools (Blender, Maya) store **dead geometry** — vertices, edges, faces. They don't know a cube is a cube. MeshDraw stores a **Semantic Object**: a typed, parametric description (`Wheel { radius, width, spokes, tread, wear }`) from which the mesh is *generated on demand*. AI edits the **knowledge**, not the triangles.

## Why this wins (validated by research, 2026-07-14)
1. **The frontier agrees.** Academic + industry direction is LLM → *editable structured parameters/code*, not dead meshes:
   - *From Sketch to 3D Tree Parameters Generation* (ACM TOG 2023) — sketch → procedural params. Exactly our Engine 3.
   - *3D-GPT* — instruction-driven procedural modeling via LLM.
   - *MeshCoder / MeshLLM* (NeurIPS 2025) — reconstruct objects into **editable** Blender Python.
   - *Proc3D* (arXiv 2026) — "Procedural 3D Generation **and Parametric Editing**."
   - *Sketch-a-Shape* (Autodesk) — zero-shot sketch→3D.
2. **Competitors' weakness = our wedge.** Every review of Meshy / Tripo / Rodin (2025–2026) repeats: *"requires cleanup," "poor topology," "gaps," "not suitable for complex assets."* They produce dead, un-editable geometry. We attack exactly that.
3. **Trust is the unsolved UX problem.** Creative AI tools "take over." Our **Intent Lock** + *AI edits YOUR thing* is the trust mechanism nobody has nailed.

## The three things that make MeshDraw *not* "another sketch-to-3D"
1. **Semantic Object as source of truth** — living, editable, AI-aware for the object's whole lifecycle.
2. **Intent preservation / Intent Lock** — lockable aspects (🔒 silhouette, 🔓 detail); AI cannot violate locks.
3. **Contextual / morphing UI** (the Figma insight) — a Wheel gets Wheel controls; a Chair gets Chair controls. The UI *becomes* the object.

## The pipeline we are inventing
```
Human Intent → Draw → Structural Interpretation → Semantic Object
   → Procedural Generator → Mesh → AI Refinement (preserves intent) → Texture → Export
```
Contrast with today: `Text → AI Image → AI Mesh → Cleanup` (loses authorship) or `Blender → manual → retopo → texture` (needs expertise).

## Three ways to edit *every* property (non-negotiable UX)
1. **Visual** — grab the wheel, drag its radius.
2. **Numeric** — type `0.55m`.
3. **Conversational** — "make it 20% wider," "aggressive off-road tread."
All three mutate the *same* underlying parameter model, live, no regenerate button.

## Honest scope reality (so we plan truthfully)
- **Reliable & instant:** AI fills parameters of a *known* procedural generator (smart primitives). Ship these first.
- **Hard / partially unsolved:** AI generating novel topology for objects with *no* generator. → Graceful fallback: freeform draw → extrude/revolve/loft → AI mesh-refine.
- **Strategy:** make the parametric path so good people don't miss arbitrary generation. Grow the generator library over time.

## Explicit non-goals (V1)
- Not a renderer/game engine — we stand on three.js (Blender didn't invent Vulkan).
- Not a full Blender replacement.
- Not "type a prompt, get a random mesh" — authorship is sacred.

## The four independent engines (see `01_ARCHITECTURE.md`)
1. **Sketch Engine** (pure geometry, no AI) — strokes, loop detection, triangulation.
2. **Mesh Intelligence / Intent Engine** (AI) — classify what it likely is, offer choices.
3. **Parametric Generator** — smart primitives with exposed variables.
4. **AI Sculptor / Refinement** — edits existing mesh, preserves silhouette & topology.
Plus: Constraint, Material, DNA/Inheritance, Export.
