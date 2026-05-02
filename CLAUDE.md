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
- **Styling**: Tailwind CSS 4 (via `@tailwindcss/postcss`), inline styles for gradients/blurs
- **AI**: DeepSeek API, called through the OpenAI SDK (base URL: `https://api.deepseek.com`)

### File structure

```
app/
├── page.tsx              # Root page — state + handlers + JSX composition (~480 lines)
├── layout.tsx            # Root layout (Geist fonts, CSS import)
├── globals.css            # Tailwind import, scrollbar styles, theme vars
├── api/chat/route.ts      # POST /api/chat — proxies to DeepSeek API
└── favicon.ico

src/
├── types/
│   └── tree.ts           # MindNode, NodesMap, ToolMode
├── lib/
│   └── utils.ts          # clamp, truncateText, roundRect, drawWrappedText, noRaycast
├── components/
│   ├── scene/
│   │   ├── TreeScene.tsx       # Main 3D scene (canvas, lights, camera, layers)
│   │   ├── LayerPlane.tsx      # Glass-pane layer background
│   │   ├── Node3D.tsx          # Single 3D node with selection UI
│   │   ├── CardTexture.tsx     # Canvas2D → THREE.CanvasTexture card rendering
│   │   └── CameraModeRig.tsx   # Camera position switching effect
│   ├── sidebar/
│   │   └── PathSidebar.tsx     # Right sidebar: path cards, typing indicator, composer
│   ├── toolbar/
│   │   ├── SceneToolbar.tsx    # Bottom toolbar: mode buttons
│   │   └── ZoomControls.tsx    # Zoom in/out + display
│   └── LayerNameDialog.tsx     # Plane naming modal

hooks/
├── useTreeLayout.ts      # D3 tree layout + shared types & constants
├── useAIChat.ts          # DeepSeek API interaction + typing state
└── useResizableSidebar.ts # Sidebar drag-to-resize behavior
```

### Key data model (`page.tsx`)

The core type is `MindNode`:
```ts
type MindNode = {
  id: string;
  prompt: string;
  response: string;
  children: string[];     // child node IDs
  parentId: string | null;
  timestamp: number;
  offsetX?: number;       // manual drag offset
  offsetY?: number;
  layer: number;          // z-axis layer (0 = root)
};
```

All nodes live in a flat `NodesMap` (`Record<string, MindNode>`), keyed by ID. The tree structure comes from `parentId` / `children` references.

### UI modes

- **2D mode**: Shows a single layer at a time (orthographic camera). Scroll switches layers. Node positions computed by D3 tree layout.
- **3D mode**: Shows all layers as stacked glass panes (perspective camera). Each layer is a translucent `LayerPlane` with nodes floating on it.

**Tool modes** (`ToolMode`): `"view"`, `"node"` (drag nodes), `"layerMove"` (move nodes between layers).

### Rendering pipeline

1. `fullTreeLayout` — runs `d3.tree()` on the full hierarchy to compute X/Y positions
2. `layerBoundsMap` — computes bounding boxes per layer for the glass panes
3. `renderedNodes` / `renderedLinks` — filters by visibility (in 2D: only current layer + ancestors; in 3D: all)
4. `CardTexture` — renders each node's prompt/response onto an HTML `<canvas>`, wrapped in a `THREE.CanvasTexture`
5. Edge connections drawn as `<Line>` components; path-to-root highlighted in indigo

### API (`/api/chat`)

POST endpoint that wraps DeepSeek's chat completions. Expects `{ messages, model? }`, returns `{ content }`. Reads `DEEPSEEK_API_KEY` from server env. Uses non-streaming completions with max 2048 tokens.

### State management

All state lives in `app/page.tsx` via 15+ `useState` hooks. No external state library. Layer transitions use `requestAnimationFrame` for smooth interpolation. Extracted components receive state as props.

### Important constants (in `hooks/useTreeLayout.ts`)

- `NODE_W = 3.4`, `NODE_H = 1.75` — card dimensions in 3D world units
- `LAYER_SPACING = 4.2` — z-distance between layers
- `X_SPACING = 4.6`, `Y_SPACING = 2.4` — D3 tree layout spacing

### Known quirks

- The `.env.local` file contains `DEEPSEEK_API_KEY` — ensure it stays in `.gitignore`.
- No tests exist in this project.
