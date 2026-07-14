# MeshDraw — Data Model & Type/Signature Registry
> ★ THE CORE INVENTION LIVES HERE. Keep this exact and current.
> Last updated: 2026-07-14 | Status: Draft v0.1 (signatures proposed, not yet implemented)

All types are TypeScript. `THREE` = three.js. Units: meters (SI) internally; UI may display cm.

---

## 1. Stroke Engine types
```ts
interface StrokePoint {
  x: number; y: number;          // canvas/world-projected 2D
  pressure: number;              // 0..1 (1 if device has none)
  t: number;                     // ms timestamp relative to stroke start
}

interface Stroke {
  id: string;                    // uuid
  points: StrokePoint[];
  closed: boolean;               // set by ShapeEngine after closure test
  // derived metrics (computed once, cached):
  avgSpeed: number;              // px/ms — "shaky fast" vs "slow deliberate"
  totalCurvature: number;
  boundingBox: { min: [number,number]; max: [number,number] };
}

// Signatures
function captureStroke(events: PointerEvent[]): Stroke;
function computeStrokeMetrics(s: Stroke): Stroke;   // fills derived fields
```

## 2. Shape Engine types
```ts
interface Loop {
  strokeIds: string[];           // one or many strokes forming a closed region
  profile: [number, number][];   // ordered 2D polygon points
  closed: boolean;
  area: number;
  windingCCW: boolean;
}

// Signatures
function detectLoops(strokes: Stroke[], closeTolerancePx: number): Loop[];
function isClosed(stroke: Stroke, tolPx: number): boolean;   // endpoint distance test
function buildProfile(loop: Loop): THREE.Shape;              // → 2D shape for geometry
function triangulate(shape: THREE.Shape): THREE.BufferGeometry;      // flat mesh
function extrude(shape: THREE.Shape, depth: number, opts?): THREE.BufferGeometry;
function revolve(profile: [number,number][], segments: number): THREE.BufferGeometry; // Lathe
function loft(profiles: THREE.Shape[]): THREE.BufferGeometry;         // V2
```

## 3. ★ Semantic Object (source of truth)
```ts
type SemanticType =
  | 'freeform'          // non-parametric fallback (holds raw profile/mesh)
  | 'wheel' | 'chair' | 'sword' | 'tree' | 'door' | 'box' | 'disk' | 'sphere';
  // registry grows over time

// A single editable parameter, with everything the UI + AI need.
interface Param<T = number | string | boolean> {
  key: string;                   // e.g. "radius"
  label: string;                 // e.g. "Radius"
  value: T;
  type: 'number' | 'enum' | 'bool';
  min?: number; max?: number; step?: number;   // for number
  unit?: 'm' | 'cm' | 'deg' | '';               // display unit
  options?: string[];            // for enum
  editVisual?: VisualBinding;    // how a gizmo maps to this param (Q-A2)
  locked?: boolean;              // ★ Intent Lock — AI cannot modify if true
  group?: string;                // UI section: "Dimensions" | "Rim" | "Tire" ...
}

interface VisualBinding {
  gizmo: 'radial' | 'axis' | 'scale' | 'none';
  axis?: 'x' | 'y' | 'z';
}

interface SemanticObject {
  id: string;                    // uuid, binds to the rendered Mesh
  type: SemanticType;
  label: string;                 // user-facing name
  params: Record<string, Param>; // keyed by Param.key
  intent?: IntentCandidate[];    // classification history
  dna?: DNARef;                  // if instantiated from / linked to a DNA
  parentId?: string;             // inheritance (Q-A6)
  transform: { position:[number,number,number]; rotation:[number,number,number]; scale:[number,number,number] };
  meshCacheKey?: string;         // invalidated on any param change
  freeform?: { profile:[number,number][]; geometry?: SerializedGeometry }; // type==='freeform'
}

// Signatures
function createSemanticObject(type: SemanticType, seed?: Partial<SemanticObject>): SemanticObject;
function setParam(obj: SemanticObject, key: string, value: unknown): SemanticObject; // pure, returns new
function toDNA(obj: SemanticObject): DNA;
function serialize(obj: SemanticObject): string;   // JSON
function deserialize(json: string): SemanticObject;
```

## 4. Generator Registry (smart primitives)
```ts
interface Generator {
  type: SemanticType;
  defaultParams: () => Record<string, Param>;   // authoritative param schema per type
  generate: (params: Record<string, Param>) => THREE.BufferGeometry;  // PURE
  contextualUI?: UISchema;      // how the morphing panel renders (see 03_UX.md)
}

const GeneratorRegistry: Map<SemanticType, Generator>;

// Signatures
function registerGenerator(g: Generator): void;
function getGenerator(type: SemanticType): Generator;
function regenerate(obj: SemanticObject): THREE.BufferGeometry;   // uses registry + cache
```

### Example generator schema — WHEEL (reference implementation target)
```ts
// defaultParams() for 'wheel' — groups drive the contextual UI
{
  radius:     { key:'radius',     label:'Radius',     value:0.55, type:'number', min:0.1, max:2, step:0.01, unit:'m',  group:'Dimensions', editVisual:{gizmo:'radial'} },
  width:      { key:'width',      label:'Width',      value:0.28, type:'number', min:0.05,max:1, step:0.01, unit:'m',  group:'Dimensions', editVisual:{gizmo:'axis',axis:'z'} },
  sidewall:   { key:'sidewall',   label:'Sidewall Height', value:0.12, type:'number', min:0, max:0.4, step:0.01, unit:'m', group:'Dimensions' },
  bevel:      { key:'bevel',      label:'Bevel',      value:0.02, type:'number', min:0, max:0.1, step:0.005, unit:'m', group:'Dimensions' },
  spokes:     { key:'spokes',     label:'Spokes',     value:8,    type:'number', min:3, max:12, step:1, group:'Rim' },
  rimOffset:  { key:'rimOffset',  label:'Offset',     value:0,    type:'number', min:-0.1,max:0.1,step:0.005,unit:'m',group:'Rim' },
  treadDepth: { key:'treadDepth', label:'Tread Depth',value:0.02, type:'number', min:0, max:0.08, step:0.005, unit:'m', group:'Tire' },
  rubberType: { key:'rubberType', label:'Rubber Type',value:'street', type:'enum', options:['mud','street','performance','winter'], group:'Tire' },
  wear:       { key:'wear',       label:'Wear',       value:'new', type:'enum', options:['new','used','destroyed'], group:'Wear' },
}
```

## 5. Intent Engine types
```ts
interface IntentCandidate {
  type: SemanticType | string;   // string allows "not-yet-a-generator" labels
  label: string;                 // "Wheel", "Coin", "Shield"
  confidence: number;            // 0..1
  hasGenerator: boolean;         // can we build it parametrically?
}

// Signatures (client → /api/intent)
function classifyStrokes(strokes: Stroke[], profile: Loop[]): Promise<IntentCandidate[]>;
```

## 6. AI Edit / Refinement types
```ts
interface ParamDiff { key: string; from: unknown; to: unknown; }

interface AIEditResult {
  intentDetected?: string;       // "Wheel"
  confidence: number;
  diffs: ParamDiff[];            // proposed param changes (respecting locks)
  explanation: string[];         // ["Increased radius","Added tread"...] — transparency
  blockedByLock: string[];       // params AI wanted to change but were locked
}

// Signatures (client → /api/edit)
function requestNaturalLanguageEdit(objId: string, prompt: string): Promise<AIEditResult>;
function applyEdit(obj: SemanticObject, result: AIEditResult): SemanticObject; // after user Accept
function normalize(obj: SemanticObject): SemanticObject;   // straighten/smooth, preserve intent — distinct from Generate
```

## 7. DNA / Inheritance
```ts
interface DNA { id:string; name:string; type:SemanticType; params:Record<string,Param>; }
type DNARef = { dnaId: string };

// Signatures
function saveDNA(obj: SemanticObject, name: string): DNA;
function applyDNA(obj: SemanticObject, dna: DNA): SemanticObject;
```

## 8. Export
```ts
type ExportFormat = 'glb' | 'gltf' | 'obj' | 'stl';
function exportObject(obj: SemanticObject, fmt: ExportFormat): Promise<Blob>;
```

---
## Naming conventions (enforce across codebase)
- Types: `PascalCase`. Functions: `camelCase`. Param keys: `camelCase` short nouns.
- Generators are **pure**; mutations return **new** objects (immutable-style) to feed undo stack.
- `SemanticObject.id` == the three.js `Mesh.userData.semanticId`.
