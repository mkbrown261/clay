# MeshDraw — Progress Log
> Append-only. Newest at top. This is the "what actually happened" ledger.

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
