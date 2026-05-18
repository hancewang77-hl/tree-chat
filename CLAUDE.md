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
npm run dev      # Start dev server on port 3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Architecture

This is a **tree-structured AI conversation tool** ("智构树语"). Users explore topics non-linearly by branching a mind-map of prompt/response nodes, visualized in 3D (Three.js) or 2D.

### Tech stack

- **Framework**: Next.js 16 App Router (`app/` directory), React 19 (client components)
- **3D rendering**: `@react-three/fiber` + `@react-three/drei` on Three.js — for the node/layer/edge scene
- **Tree layout**: `d3-hierarchy` (`d3.tree()`) computes positions; nodes are arranged with `nodeSize([Y_SPACING, X_SPACING])`
- **Styling**: Tailwind CSS 4 (via `@tailwindcss/postcss`), inline styles using CSS custom properties
- **AI**: DeepSeek API, called through the OpenAI SDK (base URL: `https://api.deepseek.com`)
- **Icons**: `lucide-react`

### Design system — Organic Editorial

The app avoids blue/purple AI-chatbot aesthetics. Instead it uses warm, tactile, natural tones:

- **Base**: cream/paper (`#FBF7F0`), warm paper (`#F5F0E8`)
- **Text**: charcoal (`#2C2416`), muted warm (`#6B5F4F`)
- **Accents**: bark brown (`#3D2E1C`), sage green (`#7D9B6E`), amber gold (`#C4943A`)
- **Borders**: warm beige (`#E0D8C8`)
- **Fonts**: Lora (serif, for headings/titles), Geist (sans, for UI chrome), Geist Mono (code)
- **Texture**: CSS grain overlay on body (`::before` pseudo-element with SVG noise)

CSS custom properties are defined in `app/globals.css`:
- `--bg-cream`, `--bg-paper`, `--text-charcoal`, `--text-muted`
- `--accent-bark`, `--accent-sage`, `--accent-amber`
- `--border-warm`, `--shadow-warm`

Components use these via inline `style={{ color: "var(--accent-bark)" }}` etc.

### File structure (post-redesign, 2026-05-12)

```
app/
├── page.tsx                    # Thin shell: TreeProvider + App (~250 lines)
├── layout.tsx                  # Root layout (Lora, Geist, Geist Mono fonts)
├── globals.css                 # CSS vars, grain texture, animations
├── api/chat/route.ts           # POST /api/chat — proxies to DeepSeek API
└── favicon.ico

src/
├── types/
│   └── tree.ts                 # MindNode, NodesMap, Project, TreeState, TreeAction, ToolMode
├── lib/
│   ├── utils.ts                # clamp, truncateText, roundRect, drawWrappedText
│   ├── storage.ts              # localStorage load/save helpers
│   └── formatResponse.ts       # stripMarkdown (→Canvas2D), renderMarkdownToHTML (→Inspector)
├── state/
│   ├── TreeContext.tsx          # Context provider + useTree/useTreeState/useTreeDispatch hooks
│   └── treeReducer.ts          # 18 action types, pushSnapshot, localStorage sync, undo/redo
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
│   │   ├── TreeToolbar.tsx     # Floating vertical: 分支/叶片/嫁接/修剪/聚焦
│   │   └── ZoomControls.tsx    # Zoom in/out
│   ├── overlays/
│   │   ├── EmptyState.tsx      # "Plant a seed" onboarding
│   │   ├── SearchPalette.tsx   # ⌘K fuzzy search modal
│   │   ├── CanopyMinimap.tsx   # SVG tree minimap overlay
│   │   ├── RingsPanel.tsx      # Undo/redo history slide-out
│   │   ├── HarvestDialog.tsx   # Placeholder (export logic in AppHeader)
│   │   ├── HelpDialog.tsx      # Tree metaphor guide (11 features)
│   │   └── ConfirmDialog.tsx   # Reusable confirmation modal
│   └── LayerNameDialog.tsx     # Plane naming modal

hooks/
├── useTreeLayout.ts            # D3 tree layout + shared types + constants
├── useAIChat.ts                # DeepSeek API interaction + typing state
└── useResizableSidebar.ts      # Sidebar drag-to-resize behavior (kept, not used in current layout)
```

### Deleted files (post-redesign)
- `src/components/sidebar/PathSidebar.tsx` → replaced by InspectorSidebar + BottomComposer
- `src/components/toolbar/SceneToolbar.tsx` → replaced by TreeToolbar

### Key data model

```ts
type MindNode = {
  id: string; prompt: string; response: string;
  children: string[]; parentId: string | null;
  timestamp: number; offsetX?: number; offsetY?: number; layer: number;
};

type Project = {
  id: string; name: string; rootNodeId: string;
  nodes: NodesMap; createdAt: number; updatedAt: number;
};

type ToolMode = "view" | "node" | "layerMove" | "graft";

type TreeState = {
  projects: Record<string, Project>;  // all saved projects
  activeProjectId: string;            // current project
  selectedNodeId: string; selectedLayer: number;
  is3DMode: boolean; toolMode: ToolMode;
  movingNodeId: string | null; pendingNodeLayer: number | null;
  graftSourceId: string | null;       // for two-click graft
  zoom2D: number; zoom3D: number;
  planeNames: Record<number, string>;
  isCanopyOpen: boolean; isRingsOpen: boolean;
  history: { past: Snapshot[]; future: Snapshot[] };  // max 50
};
```

### State management — useReducer + Context

All state is managed by `treeReducer` via `TreeContext`. No useState for tree data. Key patterns:

- **Dispatch** from any component via `useTreeDispatch()`
- **Read** state via `useTreeState()` or full context via `useTree()`
- **Handlers in page.tsx** wrapped in `useCallback` with `useRef` for latest state (avoids stale closures in async AI calls)
- **localStorage** synced after every mutating action (SEED, BRANCH, LEAF, GRAFT_CONFIRM, PRUNE, UNDO, REDO)
- **Snapshots** pushed to `history.past[]` before mutations (max 50). UNDO/REDO restore full project state

### Tree-metaphor action system (10 core actions)

| Action | Dispatch | Behavior |
|--------|----------|----------|
| Seed | `SEED` | Create project with root node, save to localStorage |
| Branch | `BRANCH` | Add AI-generated child node (calls /api/chat) |
| Leaf | `LEAF` | Add manual note node (no API call) |
| Graft | `GRAFT_START` → `GRAFT_CONFIRM` | Two-click re-parent: select source → click target |
| Prune | `PRUNE` | Delete node + subtree (root protected, cycle-safe) |
| Sunlight | `SUNLIGHT` | Select node, jump to its layer, highlight path |
| Canopy | `TOGGLE_CANOPY` | Toggle SVG minimap overlay |
| Rings | `TOGGLE_RINGS` / `UNDO` / `REDO` | History panel + snapshot restore |
| Harvest | (in AppHeader) | Export as Markdown or JSON |
| Forest | `SWITCH_PROJECT` | Change active project |

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

### API (`/api/chat`)

POST endpoint wrapping DeepSeek's chat completions. Expects `{ messages, model? }`, returns `{ content }`. Reads `DEEPSEEK_API_KEY` from server env. Non-streaming, max 2048 tokens.

### Important constants (in `hooks/useTreeLayout.ts`)

- `NODE_W = 3.4`, `NODE_H = 1.75` — card dimensions in 3D world units
- `LAYER_SPACING = 4.2` — z-distance between layers
- `X_SPACING = 4.6`, `Y_SPACING = 2.4` — D3 tree layout spacing

### Known quirks

- The `.env.local` file contains `DEEPSEEK_API_KEY` — ensure it stays in `.gitignore`.
- No tests exist in this project.
- `CameraModeRig.tsx` has an `eslint-disable` for `react-hooks/immutability` — Three.js requires direct camera property mutation.
- `useResizableSidebar.ts` exists but is not wired into the current layout (sidebars use fixed widths).
