<h1 align="center">🌳 智构树语 · Tree Chat</h1>
<p align="center"><em>Think in trees, not threads.</em></p>

---

## Why Tree Chat

Every AI conversation tool forces you into a single, linear thread. You branch once, fork the context, and lose the thread you came from. Real thinking doesn't work that way — it fans out, backtracks, explores dead ends, and sprouts in unexpected directions.

**Tree Chat replaces the chat thread with a mind-map.** Every prompt/response pair becomes a node in a tree. You can branch off any node to explore alternatives, attach leaf notes for manual annotations, graft subtrees to reorganize ideas, and prune dead branches to keep your thinking clean. The entire conversation is visualized in 3D — each layer a glass plane, each node a textured card, the path-to-root highlighted in amber gold.

It's a **spatial thinking tool** disguised as a chat interface.

## Innovation

| Dimension | Conventional Chat | Tree Chat |
|-----------|-------------------|-----------|
| **Structure** | Linear thread — you can only go forward or back | Tree graph — branch, graft, prune at any node |
| **Navigation** | Scroll up/down through history | 3D spatial canvas with layers, minimap, and path highlighting |
| **Exploration** | One answer per prompt | Branch multiple AI responses from the same prompt, compare side-by-side |
| **Annotation** | Mixed with conversation | Leaf notes — detached manual annotations that don't pollute the AI chain |
| **History** | Undo a message | Rings system — full undo/redo with snapshot history (max 50) |
| **Aesthetic** | Blue/purple AI-chatbot generic | Organic editorial — paper textures, serif typography, botanical metaphors |

### Tree-Metaphor Action System

Every action is named after a botanical operation, making the mental model intuitive:

| Action | What it does |
|--------|-------------|
| 🌱 **Seed** | Create a new project with a root question |
| 🌿 **Branch** | Ask AI a follow-up — spawns a new child node |
| 🍃 **Leaf** | Attach a manual note (no AI call, keeps context clean) |
| 🌳 **Graft** | Two-click re-parent: move a subtree to a different parent |
| ✂️ **Prune** | Delete a node and its entire subtree |
| 🔆 **Sunlight** | Focus on a node — selects it and jumps to its layer |
| 🗺️ **Canopy** | SVG minimap overlay showing the full tree structure |
| 💍 **Rings** | Undo/redo panel — browse through snapshot history |
| 📦 **Harvest** | Export as Markdown or JSON |

### Visual Design — Organic Editorial

Tree Chat deliberately avoids the generic AI-chatbot aesthetic (neon blues, purple gradients, glowing orbs). Instead it uses a warm, tactile, editorial palette inspired by botanical field guides and print typography:

- **Base tones**: cream paper (`#FBF7F0`), warm parchment (`#F5F0E8`)
- **Typography**: Lora (serif headings) + Geist (sans-serif UI) + Geist Mono (code)
- **Texture**: CSS grain overlay on every surface — it feels like paper, not glass
- **Accents**: bark brown, sage green, amber gold — nothing glows, everything breathes

### 3D Spatial Canvas

Nodes live on stacked glass planes (layers). You view one layer at a time in 2D mode, or all layers in 3D perspective. The camera smoothly tracks to newly created nodes, and you can freely orbit the 3D scene with mouse drag.

- **2D mode**: Orthographic top-down view, pan-enabled for exploring large trees
- **3D mode**: Perspective isometric view, rotation-enabled for layer inspection
- **Smooth tracking**: Camera animates to newly created/selected nodes, then releases control for free exploration

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| 3D Rendering | [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + [Drei](https://github.com/pmndrs/drei) on Three.js |
| Tree Layout | [d3-hierarchy](https://github.com/d3/d3-hierarchy) (`d3.tree()`) |
| AI | DeepSeek API via OpenAI SDK |
| Styling | Tailwind CSS 4 + CSS custom properties |
| Deployment | Cloudflare Workers (OpenNext) |
| Icons | [Lucide React](https://lucide.dev) |

## Getting Started

### Prerequisites

- Node.js 20+
- A [DeepSeek API key](https://platform.deepseek.com/api_keys)

### Setup

```bash
git clone https://github.com/hancewang77-hl/tree-chat.git
cd tree-chat
npm install
```

Create `.env.local`:

```env
DEEPSEEK_API_KEY=sk-your-key-here
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

### Deploying to Cloudflare Workers

```bash
npm run build
npx @opennextjs/cloudflare build
npx wrangler deploy
```

## Architecture

```
app/
├── page.tsx           # Thin shell: TreeProvider + App
├── layout.tsx         # Root layout (fonts)
├── globals.css        # CSS vars, grain texture, animations
└── api/chat/route.ts  # POST /api/chat → DeepSeek

src/
├── types/tree.ts                  # MindNode, Project, TreeState, Actions
├── state/
│   ├── TreeContext.tsx            # useReducer + Context provider
│   └── treeReducer.ts            # 18 action types, localStorage sync, undo/redo
├── components/
│   ├── scene/                    # 3D Canvas, nodes, layers, edges, camera
│   ├── layout/                   # Header, sidebars, composer
│   ├── toolbar/                  # TreeToolbar, ZoomControls
│   └── overlays/                 # Minimap, history, search, dialogs
├── hooks/
│   ├── useTreeLayout.ts          # D3 tree layout + constants
│   └── useAIChat.ts              # DeepSeek API interaction
└── lib/
    ├── utils.ts                  # Canvas2D helpers, clamp, etc.
    ├── formatResponse.ts         # Markdown→HTML, Markdown→Plaintext
    └── storage.ts                # localStorage helpers
```

## License

MIT
