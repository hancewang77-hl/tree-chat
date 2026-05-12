# Tree Chat — Frontend Redesign Spec

**Date:** 2026-05-12
**Status:** Approved

## 1. Design Direction

### Aesthetic: Organic Editorial

Tree Chat is a thinking workspace built around the metaphor of tending a garden of ideas. The aesthetic is **warm, tactile, and calm** — like a quiet desk in a sunlit library with a bonsai tree.

- **Tone**: Refined naturalism. Not "forest green everywhere" — subtle wood, paper, and leaf undertones against warm neutrals.
- **Typography**: Serif display headings (Lora or Crimson Text) for titles and node prompts, paired with a refined body font for responses. The current Geist sans is replaced for display use but kept for UI chrome.
- **Color palette**: Warm cream/paper base (`#FBF7F0`), deep bark brown accents (`#3D2E1C`), muted sage for selection (`#7D9B6E`), amber/gold for highlights (`#C4943A`), charcoal text (`#2C2416`).
- **Differentiation**: Deliberately avoids the white/blue/purple AI chatbot aesthetic. No gradients, no glowing orbs, no purple. The app should feel physical — like a tool you reach for on a desk.

### Spatial Philosophy
- Asymmetric three-column layout. The tree canvas is the hero; sidebars are secondary.
- Sidebars feel like pull-out drawers — recessed, shadowed, with visible edge seams.
- Generous negative space around tree nodes. The canvas breathes.
- Subtle grain texture on backgrounds (CSS noise) to evoke paper/wood.

### Motion
- Page load: staggered reveal of sidebar → canvas → toolbar (100ms delays)
- Node selection: subtle scale pulse + warm glow (not neon)
- Layer transitions: smooth 300ms dissolve, not instant jump
- Graft/prune: brief 200ms fade-out of affected nodes

---

## 2. Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│  AppHeader (app name, project title, search, 2D/3D)      │
├────────┬────────────────────────────────┬────────────────┤
│ FOREST │                                │   INSPECTOR    │
│ (left  │      MAIN TREE CANVAS          │ (right         │
│  side- │      (2D or 3D scene)          │  sidebar)      │
│  bar)  │                                │                │
│        │                                │ selected node  │
│ project│                                │ prompt/response│
│ list   │                                │                │
│        │                                │ node actions:   │
│ [+seed]│                                │ [branch][leaf] │
│        │                                │ [graft][prune] │
│        │                                │ [sunlight]     │
├────────┴────────────────────────────────┴────────────────┤
│                  BottomComposer                           │
│  [mode: AI / Note] [prompt input] [send]                  │
└──────────────────────────────────────────────────────────┘

Floating elements:
  - TreeToolbar: vertical icon bar, left edge of canvas
  - ZoomControls: bottom-right of canvas
  - Canopy (minimap): bottom-left overlay on canvas
  - SearchPalette: ⌘K modal overlay
  - RingsPanel: slide-out from right edge
```

---

## 3. Component Tree

```
app/
├── page.tsx                        ← thin shell: Context provider + layout (~60 lines)
├── layout.tsx                      ← unchanged
├── globals.css                     ← add grain texture, tooltip, dialog styles
├── api/chat/route.ts               ← UNCHANGED

src/
├── types/
│   └── tree.ts                     ← expanded: Project, TreeState, TreeAction
├── lib/
│   ├── utils.ts                    ← unchanged
│   └── storage.ts                  ← NEW: localStorage load/save
├── state/
│   ├── TreeContext.tsx              ← NEW: context + provider + useTree hook
│   └── treeReducer.ts              ← NEW: reducer + all action handlers
├── components/
│   ├── scene/                      ← kept, minor prop adjustments
│   │   ├── TreeScene.tsx
│   │   ├── Node3D.tsx
│   │   ├── CardTexture.tsx
│   │   ├── LayerPlane.tsx
│   │   └── CameraModeRig.tsx
│   ├── layout/
│   │   ├── AppHeader.tsx           ← NEW
│   │   ├── ForestSidebar.tsx       ← NEW
│   │   ├── InspectorSidebar.tsx    ← NEW
│   │   └── BottomComposer.tsx      ← NEW
│   ├── toolbar/
│   │   ├── TreeToolbar.tsx         ← NEW: floating vertical tree-action buttons
│   │   └── ZoomControls.tsx        ← kept, minor restyle
│   ├── overlays/
│   │   ├── CanopyMinimap.tsx       ← NEW: minimap overlay
│   │   ├── RingsPanel.tsx          ← NEW: version history panel
│   │   ├── HarvestDialog.tsx       ← NEW: export dialog
│   │   ├── SearchPalette.tsx       ← NEW: ⌘K search
│   │   └── EmptyState.tsx          ← NEW: "plant a seed" onboarding
│   └── LayerNameDialog.tsx         ← kept
```

### Deleted files
- `src/components/sidebar/PathSidebar.tsx` → split into InspectorSidebar + BottomComposer
- `src/components/toolbar/SceneToolbar.tsx` → replaced by TreeToolbar

---

## 4. Data Model & State

### Types

```ts
type MindNode = {
  id: string;
  prompt: string;
  response: string;
  children: string[];
  parentId: string | null;
  timestamp: number;
  offsetX?: number;
  offsetY?: number;
  layer: number;
};

type NodesMap = Record<string, MindNode>;

type Project = {
  id: string;
  name: string;
  rootNodeId: string;
  nodes: NodesMap;
  createdAt: number;
  updatedAt: number;
};

type Snapshot = {
  projects: Record<string, Project>;
  activeProjectId: string;
};

type TreeState = {
  projects: Record<string, Project>;
  activeProjectId: string;
  selectedNodeId: string;
  selectedLayer: number;
  is3DMode: boolean;
  toolMode: "view" | "node" | "layerMove" | "graft";
  movingNodeId: string | null;
  pendingNodeLayer: number | null;
  graftSourceId: string | null;
  zoom2D: number;
  zoom3D: number;
  planeNames: Record<number, string>;
  isCanopyOpen: boolean;
  isRingsOpen: boolean;
  history: { past: Snapshot[]; future: Snapshot[] };
};
```

### Reducer Actions

| Action | Payload | Effect |
|--------|---------|--------|
| `SEED` | `{ name }` | Create project with root, set active, push snapshot |
| `BRANCH` | `{ prompt, response, parentId }` | Add AI child node, push snapshot |
| `LEAF` | `{ content, parentId }` | Add manual note node, push snapshot |
| `GRAFT_START` | `{ nodeId }` | Set graftSourceId, enter graft mode |
| `GRAFT_CONFIRM` | `{ newParentId }` | Re-parent node + subtree, push snapshot |
| `GRAFT_CANCEL` | none | Exit graft mode |
| `PRUNE` | `{ nodeId }` | Delete node + all descendants, push snapshot |
| `SUNLIGHT` | `{ nodeId }` | Select node, set layer, highlight path |
| `SELECT_NODE` | `{ nodeId }` | Set selected node |
| `SET_LAYER` | `{ layer }` | Change active layer |
| `TOGGLE_3D` | none | Flip 2D/3D |
| `TOGGLE_CANOPY` | none | Open/close minimap |
| `TOGGLE_RINGS` | none | Open/close history panel |
| `SWITCH_PROJECT` | `{ projectId }` | Change active project |
| `UNDO` | none | Restore previous snapshot |
| `REDO` | none | Restore next snapshot |
| `SET_ZOOM` | `{ zoom2D?, zoom3D? }` | Update zoom |
| `RENAME_PLANE` | `{ layer, name }` | Set plane name |

### Context Shape

```ts
TreeContext = {
  state: TreeState;
  dispatch: React.Dispatch<TreeAction>;
  isAiTyping: boolean;
  sendMessage: (prompt, contextPath) => Promise<string>;
}
```

### Persistence

- `projects` serialized to `localStorage.setItem("tree-chat-projects")` on every state change
- `useReducer` lazy-initializes from localStorage
- History snapshots are in-memory only, max 50 entries
- UI-only state (zoom, panel toggles, tool mode) not persisted

---

## 5. Tree-Metaphor Button Map

### Floating TreeToolbar (vertical, left of canvas)

| # | Label | Icon | Behavior |
|---|-------|------|----------|
| 1 | Branch | `GitBranch` | AI child node: opens composer in AI mode |
| 2 | Leaf | `StickyNote` | Manual note: opens composer in note mode |
| 3 | Graft | `Scissors` | Two-click re-parent: click source → click target |
| 4 | Prune | `Trash2` | Delete node + subtree (confirm if has children) |
| 5 | Sunlight | `Sun` | Focus path: jump to node layer, highlight ancestors |

### Header Bar

| # | Label | Icon | Behavior |
|---|-------|------|----------|
| 6 | Search | `Search` | ⌘K palette: fuzzy-search all nodes by prompt text |
| — | 2D/3D | `Box`/`Layers` | Toggle between views |

### Overlay Triggers

| # | Label | Icon | Behavior |
|---|-------|------|----------|
| 7 | Canopy | `LayoutGrid` | Minimap overlay: birds-eye tree view, click to navigate |
| 8 | Rings | `History` | History panel: undo/redo timeline with timestamps |
| 9 | Harvest | `Download` | Export dialog: markdown or JSON |

### ForestSidebar (left)

| # | Label | Icon | Behavior |
|---|-------|------|----------|
| 10 | Seed | `Plus` | New project: prompts for name, creates root, switches to it |
| 11 | Forest | `Trees` | Toggle project list sidebar |

### InspectorSidebar (right) — contextual on selected node

| Action | Shown | Behavior |
|--------|-------|----------|
| Branch | always | Same as toolbar Branch |
| Leaf | always | Same as toolbar Leaf |
| Prune | not root | Same as toolbar Prune |

### BottomComposer

- **AI mode**: sends prompt + context to `/api/chat`, dispatches `BRANCH`
- **Note mode**: creates node with text content directly, dispatches `LEAF`
- Enter to send, Shift+Enter for newline
- Mode switches automatically when Leaf/Branch buttons clicked

---

## 6. Implementation Notes

### State Management
- `useReducer` with lazy initialization from localStorage
- Snapshot pushed to `history.past[]` before every mutating action (SEED, BRANCH, LEAF, GRAFT_CONFIRM, PRUNE)
- `future[]` cleared on new mutations (standard undo/redo pattern)
- Max 50 snapshots; oldest evicted

### Scene Integration
- `TreeScene` reads `state.projects[state.activeProjectId].nodes` from context
- Node interactions (click, drag) dispatch to reducer
- `toolMode === "graft"` changes node click behavior: first click = source, second = target
- Existing 3D rendering pipeline preserved; props replaced with context reads

### API Compatibility
- `/api/chat` route unchanged
- `useAIChat` hook wrapped into context for `sendMessage`

### localStorage Structure
```json
{
  "projects": {
    "<uuid>": {
      "id": "<uuid>",
      "name": "Project Name",
      "rootNodeId": "root",
      "nodes": { "root": { ... }, "node-<uuid>": { ... } },
      "createdAt": 1715500000000,
      "updatedAt": 1715500000000
    }
  }
}
```

### Mobile
- Left sidebar collapses to hamburger drawer
- Right sidebar collapses to bottom sheet
- 3D mode disabled below 768px width
- Composer pins to bottom with safe-area padding

---

## 7. Verification Checklist

1. `npm run build` — no TypeScript errors
2. `npm run dev` — empty state renders "plant a seed"
3. Seed → creates project, shows root node on canvas
4. Branch → AI generates response, child node appears
5. Leaf → manual note node created without API call
6. Graft → two-click flow re-parents node correctly
7. Prune → deletes node + subtree, confirm for nodes with children
8. Sunlight → highlights path, jumps to correct layer
9. Canopy → minimap opens, click navigates to node
10. Rings → undo/redo restores state correctly
11. Harvest → exports markdown + JSON
12. Forest → switching projects works, state isolated
13. Refresh → all projects restored from localStorage
14. 2D/3D → both modes render, toggle works
15. Mobile viewport → layout responsive, no overflow
16. Search (⌘K) → finds nodes, jumps on select
