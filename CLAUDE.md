# CLAUDE.md

Repository guidance for coding agents working on TreeChat.

## Read the bundled Next.js documentation first

This repository uses Next.js 16.3 and React 19. Next.js APIs and conventions may
differ from older releases. Before changing Next.js code, read the relevant
guide in `node_modules/next/dist/docs/` and follow current deprecation notices.

## Product architecture

TreeChat is a nonlinear AI workspace. A user can continue from any historical
node, preserve sibling explorations, return to an old branch, and run several
leaf requests concurrently.

- `/` is the public/competition Landing Page (Server Component).
- `/app` is the client-side 2D tree workspace.
- The workbench is intentionally 2D. Do not restore the deleted legacy 3D
  workbench, camera rig, texture-card, or layer-plane components.
- `TreeProvider` + `treeReducer` own persisted tree state and patch history.
- `d3-hierarchy` computes the 2D tree layout; React renders interactive cards.

## Non-negotiable model-request path

The FastAPI Runtime is authoritative for every model request:

```text
workbench / Next route
  -> POST /v1/tasks
  -> priority scheduler
  -> router
  -> provider or HTTP worker
  -> task registry + session SSE
```

Interactive chat and semantic-card requests use `hooks/useAIChat.ts` and the
browser Runtime client. Auxo is non-streaming to its caller, but its Next route
submits a background-priority Runtime task, waits for the authoritative terminal
record, and propagates cancellation. `/api/chat` and `/api/structure` are legacy
compatibility proxies to the same Runtime.

Never add a browser or Next.js route that calls a model provider directly.
Provider credentials belong only to the FastAPI Runtime/worker environment and
must never use a `NEXT_PUBLIC_` variable.

## Branch-local context invariant

For a target node, the default model context is:

```text
system prompt + project context + root-to-target ancestor path + current input
```

Sibling branches are excluded. The raw questions and answers on the selected
ancestor path are authoritative model memory. Semantic cards are derived,
view-only summaries and must not silently replace the raw branch path. Explicit
leaf references and nutrient excerpts may be added only through their product
rules. Preserve topology provenance (`root_node_id` and `ancestor_node_ids`) on
Runtime submissions so branch-aware routing remains verifiable.

## Important source areas

```text
app/
├── page.tsx                 # Landing Page
├── app/page.tsx             # 2D workbench orchestration
└── api/                     # Auxo + legacy Runtime proxies
runtime/
├── app/                     # registry, scheduler, router, SSE, provider
├── mock_worker/             # development workers
├── real_worker/             # HTTP model-worker gateway
├── vllm/                    # product vLLM launcher
└── tests/                   # Runtime product tests
src/
├── components/              # Landing and workbench UI
├── lib/                     # context, topology, Auxo, nutrients, storage
├── product/                 # product-action boundary
├── runtime/                 # browser/server Runtime clients
├── state/                   # reducer and React context
└── types/                   # shared product types
```

Key behaviors:

- `src/lib/contextCompiler.ts` compiles branch-local context.
- `src/lib/branchTopology.ts` proves the submitted root-to-node topology.
- `runtime/app/task_registry.py` owns server Task state and retry snapshots.
- `runtime/app/scheduler.py` implements priority scheduling and concurrency.
- `runtime/app/router.py` implements worker selection, health, and provenance.
- `src/lib/auxo.ts` validates Auxo input, provenance, graph integrity, and its
  all-or-nothing plan before the reducer creates any nodes.
- Nutrient DOCX/PDF/HTML/text conversion is bounded and security checked; do
  not weaken archive, page, character, or timeout limits.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm test
npm run test:unit
npm run test:component
npm run build

npm run runtime:dev
npm run runtime:test
npm run runtime:mock-workers
```

Run the relevant focused tests while editing, then run TypeScript, lint, the full
Vitest suite, Runtime pytest suite, and production build before handoff.

## Repository boundary

This repository contains product code and product tests. Local research runs,
benchmark runners, raw measurements, deployment diagnostics, and private audit
artifacts are intentionally ignored and must not be added to a product commit.
