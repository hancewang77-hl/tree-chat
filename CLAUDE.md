# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This is Next.js 16 — read the docs first

Next.js 16 (16.2.3) has breaking changes in APIs, conventions, and file structure vs. earlier versions. Before writing any Next.js code, check the relevant guide in `node_modules/next/dist/docs/`. The docs are organized as:

- `01-app/` — App Router guides (getting started, guides, API reference)
- `02-pages/` — Pages Router
- `03-architecture/` — Architecture docs
- `index.md` — entry point

## Commands

```bash
npm ci           # Install the exact lockfile dependency set
npm run dev      # Start dev server on port 3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint (Next.js flat config)
npm test         # Run Vitest (node environment, tests in src/**/ and hooks/**/)
```

Tests are colocated `*.test.ts` files. Vitest aliases `@/` to the project root (same as tsconfig paths).

## Architecture

This is a **tree-structured AI conversation tool** ("智构树语"). Users explore topics non-linearly by branching a mind-map of prompt/response nodes, visualized in 3D (Three.js) or 2D.

### Tech stack

- **Framework**: Next.js 16 App Router (`app/` directory), React 19 (client components)
- **3D rendering**: `@react-three/fiber` + `@react-three/drei` on Three.js — for the node/layer/edge scene
- **Tree layout**: `d3-hierarchy` (`d3.tree()`) computes positions; nodes are arranged with `nodeSize([Y_SPACING, X_SPACING])`
- **Styling**: Tailwind CSS 4 (via `@tailwindcss/postcss`), inline styles using CSS custom properties
- **AI**: DeepSeek API, called through the OpenAI SDK (base URL: `https://api.deepseek.com`)
- **Math**: KaTeX for LaTeX rendering in the Inspector sidebar
- **Icons**: `lucide-react`

### Design system — Organic Editorial

The app avoids blue/purple AI-chatbot aesthetics. Instead it uses warm, tactile, natural tones. The original design spec (`docs/superpowers/specs/2026-05-12-tree-chat-redesign.md`) defined a lighter palette; the actual implementation uses a richer, deeper set of tones:

- **Base**: cream (`#E8DFD0`), paper (`#D8CCB8`)
- **Text**: charcoal (`#2C2416`), muted warm (`#5F5548`)
- **Accents**: bark brown (`#3D2E1C`), sage green (`#747A55`), olive deep (`#565B3D`), olive soft (`rgba(116,122,85,0.16)`), amber gold (`#C4943A`)
- **Borders**: warm beige (`#C7B89D`), shadow (`rgba(61,46,28,0.13)`)
- **Fonts**: Lora (serif, for headings/titles), Geist (sans, for UI chrome), Geist Mono (code)
- **Texture**: CSS grain overlay on body (`::before` pseudo-element with SVG fractal noise at 0.035 opacity)
- **Dark theme**: `[data-theme="dark"]` selector inverts the palette (dark cream → `#1E1B15`, sage → `#8BAF7A`, amber → `#D4A84A`, etc.). Theme is persisted in localStorage and applied before first paint via inline `<script>` in `layout.tsx`.

CSS custom properties are defined in `app/globals.css`:

- `--bg-cream`, `--bg-paper`, `--text-charcoal`, `--text-muted`
- `--accent-bark`, `--accent-sage`, `--accent-olive-deep`, `--accent-olive-soft`, `--accent-amber`
- `--border-warm`, `--shadow-warm`
- `--font-geist-sans`, `--font-geist-mono`, `--font-lora` (fallback font stacks)

Components use these via inline `style={{ color: "var(--accent-bark)" }}` etc. SVG leaf vein patterns are defined in `src/lib/visualPatterns.ts` — used as CSS `background-image` on cards, sidebars, and empty states.

### File structure

```
app/
├── page.tsx                    # TreeProvider shell + app orchestration
├── layout.tsx                  # Root layout (Lora, Geist, Geist Mono fonts)
├── globals.css                 # CSS vars, grain texture, animations
├── api/
│   ├── chat/route.ts           # Streaming DeepSeek answers
│   ├── structure/route.ts      # Post-answer semantic-card extraction
│   └── auxo/route.ts           # Constrained Auxo task-tree planning
└── favicon.ico

src/
├── types/
│   └── tree.ts                 # MindNode, NodesMap, Project, TreeState, TreeAction, ToolMode
├── lib/
│   ├── contextCompiler.ts      # Tree-aware bounded model context
│   ├── auxo.ts                 # Full-input budget + provenance/graph validation
│   ├── deepseek.ts             # Shared runtime model + mode configuration
│   ├── semanticCard.ts         # Semantic-card parsing and validation
│   ├── nutrientMarkdown.ts     # Browser-side DOCX/PDF/HTML/text → Markdown conversion
│   ├── nutrients.ts            # Nutrient ingestion, structure-aware chunking, relevance selection
│   ├── nutrientStorage.ts      # IndexedDB storage for original local attachments
│   ├── storage.ts              # localStorage load/save helpers (schema v2)
│   ├── streamText.ts           # ReadableStream→text helper for SSE responses
│   ├── utils.ts                # clamp, truncateText, roundRect, drawWrappedText, noRaycast
│   ├── visualPatterns.ts       # SVG leaf vein patterns as data URIs (cards, sidebars)
│   └── formatResponse.ts       # Markdown→HTML (KaTeX math), Markdown→plaintext, card summaries
├── state/
│   ├── TreeContext.tsx          # Context provider + useTree/useTreeState/useTreeDispatch hooks
│   └── treeReducer.ts          # Tree actions, patch history, persistence, undo/redo
├── components/
│   ├── scene/                  # 3D rendering (kept from original, palette updated)
│   │   ├── TreeScene.tsx       # Canvas + lights + camera + layers + nodes + edges
│   │   ├── Node3D.tsx          # Single 3D node wrapper
│   │   ├── CardTexture.tsx     # Canvas2D → THREE.CanvasTexture (warm palette)
│   │   ├── LayerPlane.tsx      # Frosted glass layer (warm tones)
│   │   └── CameraModeRig.tsx   # 2D/3D camera switcher
│   ├── layout/
│   │   ├── AppHeader.tsx       # Header: app name, search, 2D/3D, canopy/rings/harvest/help
│   │   ├── ForestSidebar.tsx   # Left sidebar: project list + Seed button
│   │   ├── InspectorSidebar.tsx # Right sidebar: node path + inspector + actions
│   │   └── BottomComposer.tsx  # Bottom bar: AI/Note mode toggle + prompt input
│   ├── toolbar/
│   │   ├── TreeToolbar.tsx     # Floating vertical: Auxo/分支/叶片/嫁接/修剪/聚焦
│   │   └── ZoomControls.tsx    # Zoom in/out
│   ├── overlays/
│   │   ├── EmptyState.tsx      # "Plant a seed" onboarding
│   │   ├── SearchPalette.tsx   # ⌘K fuzzy search modal
│   │   ├── CanopyMinimap.tsx   # SVG tree minimap overlay
│   │   ├── RingsPanel.tsx      # Undo/redo history slide-out
│   │   ├── HarvestDialog.tsx   # Placeholder (export logic in AppHeader)
│   │   ├── HelpDialog.tsx      # Tree metaphor guide (12 features)
│   │   ├── AuxoDialog.tsx      # Root-only task-tree generation dialog
│   │   └── ConfirmDialog.tsx   # Reusable confirmation modal
│   └── LayerNameDialog.tsx     # Plane naming modal

hooks/
├── useTreeLayout.ts            # D3 tree layout + shared types + constants
├── useAIChat.ts                # Streaming chat + semantic-card requests
├── useAuxo.ts                  # Cancelable plan request + client validation
└── useResizableSidebar.ts      # Sidebar drag-to-resize behavior (kept, not used in current layout)
```

### Deleted files (post-redesign)

- `src/components/sidebar/PathSidebar.tsx` → replaced by InspectorSidebar + BottomComposer
- `src/components/toolbar/SceneToolbar.tsx` → replaced by TreeToolbar

### Key data model

```ts
type MindNode = {
  id: string;
  kind: "root" | "branch" | "leaf";
  prompt: string;
  response: string;
  status?: "complete" | "streaming" | "stopped" | "failed";
  error?: string;
  children: string[];
  parentId: string | null;
  timestamp: number;
  offsetX?: number;
  offsetY?: number;
  layer: number;
  nutrientRefs?: string[];
  contextState: "valid" | "missing" | "stale";
  semanticCard?: SemanticCard;
  contextManifest?: ContextManifest;
  includeInContext?: boolean;
  nodeRole?: "answer" | "task-group" | "task";
  taskDescription?: string;
  auxoGenerationId?: string;
  auxoSource?: AuxoSourceReference;
  auxoManifest?: AuxoGenerationManifest; // root only
};

type Project = {
  id: string;
  name: string;
  rootNodeId: string;
  nodes: NodesMap;
  nutrients: Record<string, NutrientItem>;
  activeNutrientIds: string[];
  createdAt: number;
  updatedAt: number;
};

type ToolMode = "view" | "node" | "layerMove" | "graft";

type TreeState = {
  projects: Record<string, Project>; // all saved projects
  activeProjectId: string; // current project
  selectedNodeId: string;
  selectedLayer: number;
  is3DMode: boolean;
  toolMode: ToolMode;
  movingNodeId: string | null;
  pendingNodeLayer: number | null;
  graftSourceId: string | null; // for two-click graft
  zoom2D: number;
  zoom3D: number;
  planeNames: Record<number, string>;
  isCanopyOpen: boolean;
  isRingsOpen: boolean;
  ringsMode: "global" | "node";
  ringsFocusNodeId: string | null;
  history: { past: HistoryEntry[]; future: HistoryEntry[] }; // max 50
};
```

### State management — useReducer + Context

All state is managed by `treeReducer` via `TreeContext`. No useState for tree data. Key patterns:

- **Dispatch** from any component via `useTreeDispatch()`
- **Read** state via `useTreeState()` or full context via `useTree()`
- **Handlers in page.tsx** wrapped in `useCallback` with `useRef` for latest state (avoids stale closures in async AI calls)
- **localStorage** is synced after mutating actions; persisted workspaces use schema version 2 and normalize legacy nodes on load
- **Patch history** stores affected node/project before-and-after values (max 50). Global and node-specific undo/redo merge child edges without replacing unrelated later work
- **Semantic cards** are derived data: updating them does not add Rings noise, but their latest values are synchronized into relevant history snapshots

### Tree-aware model context

- Full AI responses remain the source for display, export, and history; subsequent requests use compact `valid` semantic cards instead of replaying full answers.
- `contextCompiler.ts` compiles root task → valid parent-path semantics → explicitly enabled Leaf notes → current task → relevant nutrient chunks → current question.
- `missing`, `stale`, failed, incomplete, duplicate, and over-budget context is excluded and recorded in a per-node `ContextManifest`.
- Leaf notes are isolated by default. A user must explicitly enable `includeInContext`.
- Graft preserves prompts and responses while marking only answer semantics in the moved subtree `stale`; immutable Auxo task source remains valid.
- Auxo compiles the root task plus every enabled ready Nutrient within a 50,000-character hard budget. Nutrients travel as contiguous lossless chunks with offsets, allowing server-side reconstruction and exact validation even when a question crosses chunk boundaries.
- Before chunk transport Auxo extracts explicit numbered questions into stable source units. The fixed non-thinking `deepseek-v4-flash` planner returns only source-unit IDs and hierarchy, never copied question text or free descriptions.
- Every detected source unit must map to exactly one atomic task in source order. Auxo also validates DFS preorder, parents, cycles, duplicates, a 40-node cap, and four-layer depth before one atomic write; any failure produces zero writes.
- Auxo task/task-group source text is included directly on the selected parent path; execution uses the generation-time Nutrient ID snapshot, and sibling answers remain excluded.

### Tree-metaphor action system (12 core action groups)

| Action   | Dispatch                         | Behavior                                            |
| -------- | -------------------------------- | --------------------------------------------------- |
| Seed     | `SEED`                           | Create project with root node, save to localStorage |
| Auxo     | `APPLY_AUXO_PLAN`                | Atomically apply a validated pending task tree      |
| Branch   | streaming actions                | Stream `/api/chat`, then extract a semantic card    |
| Leaf     | `LEAF` / `TOGGLE_LEAF_CONTEXT`   | Add a manual note and optionally include it         |
| Graft    | `GRAFT_START` → `GRAFT_CONFIRM`  | Re-parent safely and invalidate moved semantics     |
| Prune    | `PRUNE`                          | Delete node + subtree (root protected, cycle-safe)  |
| Sunlight | `SUNLIGHT`                       | Select node, jump to its layer, highlight path      |
| Canopy   | `TOGGLE_CANOPY`                  | Toggle SVG minimap overlay                          |
| Rings    | `TOGGLE_RINGS` / `UNDO` / `REDO` | Global and node-specific patch undo/redo            |
| Harvest  | (in AppHeader)                   | Export as Markdown or JSON                          |
| Forest   | `SWITCH_PROJECT`                 | Change active project                               |
| Nutrient | nutrient actions                 | Convert, add, remove, and enable local references   |

### Response formatting pipeline

AI responses pass through two formatting layers:

1. **Canvas2D cards** (`CardTexture`): `stripMarkdown()` → removes markdown syntax, replaces code/math with `[代码块]`/`[公式]`, produces clean plain text
2. **Inspector sidebar** (`InspectorSidebar`): `renderMarkdownToHTML()` → converts to HTML with styled code blocks, math containers, lists, headings, bold/italic

### UI modes

- **2D mode** (default): Shows a single layer at a time (orthographic camera). Scroll switches layers.
- **3D mode**: Shows all layers as stacked glass panes (perspective camera).
- **Graft mode** (`toolMode: "graft"`): Node clicks trigger GRAFT_CONFIRM instead of SELECT_NODE.

### Rendering pipeline

1. `useTreeLayout` runs `d3.tree()` on the full hierarchy to compute X/Y positions
2. `renderedNodes` / `renderedLinks` filters by visibility
3. `CardTexture` renders each node onto HTML `<canvas>`, wrapped in `THREE.CanvasTexture`
4. Edge connections drawn as `<Line>` components; path-to-root highlighted in amber gold (`#C4943A`)
5. Layer glass panes rendered in warm cream/beige tones

### DeepSeek APIs

- Runtime model selection is centralized in `src/lib/deepseek.ts`; chat, semantic structuring, and Auxo use `deepseek-v4-flash` with thinking explicitly disabled (`DEEPSEEK_NON_THINKING = { type: "disabled" }`).
- `POST /api/chat` — per-IP rate limit 30/min. Accepts compiled messages, streams via SSE (`max_tokens: 2048`). Non-streaming mode available. Supports `AbortController` cancellation.
- `POST /api/structure` — per-IP rate limit 30/min. Accepts one prompt/response pair (max 50K chars combined). Returns validated JSON semantic card via `response_format: { type: "json_object" }` with `temperature: 0.1`, `max_tokens: 1200`.
- `POST /api/auxo` — per-IP rate limit 6/min (stricter). 45s server timeout (`AbortController`), 55s client timeout. Accepts bounded root task + all enabled Markdown chunks (max 700KB body). Returns validated plan via `response_format: { type: "json_object" }` with `temperature: 0.1`, `max_tokens: 8000`. Plan is validated both server-side and client-side before any nodes are created.
- All routes read `DEEPSEEK_API_KEY` only from the server environment. Rate limit maps are cleared when exceeding 10,000 entries.

### Important constants (in `hooks/useTreeLayout.ts`)

- `NODE_W = 3.4`, `NODE_H = 1.75` — branch/root card dimensions in 3D world units
- `LEAF_W = 1.9`, `LEAF_H = 0.78` — leaf note card dimensions (smaller, lighter)
- `LAYER_SPACING = 4.2` — z-distance between layers
- `X_SPACING = 4.6`, `Y_SPACING = 2.4` — D3 tree layout spacing
- `zoom2D` default 105 (range 10–260), `zoom3D` default 1 (range 0.1–4.0)

### Nutrient file processing

Nutrients are user-uploaded local files converted to Markdown entirely in the browser (no server upload). The pipeline:

- **DOCX** → mammoth.js → HTML → Turndown (+ GFM plugin) → Markdown. ZIP bomb detection validates archive structure before extraction (max 2000 entries, 50MB uncompressed, 20MB per entry, 200× compression ratio).
- **PDF** → unpdf (PDF.js) extracts text per page. Max 200 pages, 200K chars, 20s extraction timeout. No OCR — image-only PDFs are rejected.
- **HTML** → Turndown (+ GFM plugin) → Markdown.
- **Plain text / Markdown** → normalized directly.
- **Images** → saved as blob in IndexedDB (`tree-chat-nutrients`); not converted to text.
- **Legacy .doc** → rejected with guidance to save as .docx.
- **File limits**: 10MB max per file, 200K chars max extracted Markdown.

Nutrients are chunked (target 1600 chars/chunk), scored for relevance against the current query, and the top-N relevant chunks (max 8, budget 8000 chars) are included in compiled context.

### Known quirks

- Local DeepSeek credentials belong in ignored `.env.local`; never expose them through a `NEXT_PUBLIC_` variable or commit them.
- Semantic-card extraction is a second DeepSeek request after each completed answer. Failure is non-fatal and can be retried from the Inspector.
- `CameraModeRig.tsx` has an `eslint-disable` for `react-hooks/immutability` — Three.js requires direct camera property mutation.
- `useResizableSidebar.ts` exists but is not wired into the current layout (sidebars use fixed widths).
- Math rendering in the Inspector uses KaTeX (`katex` package). The CSS is imported in `layout.tsx`.
- Layer transitions in `page.tsx` use `requestAnimationFrame` with exponential easing (factor 0.14) for smooth animated scrolling between layers.
- Dark theme (`[data-theme="dark"]`) is applied via inline `<script>` in `layout.tsx` before first paint to avoid FOUC.
