# TreeChat

TreeChat is a non-linear AI workspace. Each user question and model answer is a node in a 2D conversation tree, so you can branch from any history point, keep multiple directions, return to an earlier branch, and continue working without losing the surrounding structure.

## Product capabilities

- Branch-local context: a request is compiled from the system prompt, project context, the selected node's root-to-ancestor path, explicitly pinned/quoted material, and the current question. Sibling branches are excluded by default.
- Task Runtime: every model request is a server-side task with a queued/running/terminal lifecycle, priority scheduling, streaming events, cancellation, retry, timeout, and task telemetry.
- Worker routing: the Runtime can use a local provider or HTTP workers, with health-aware routing policies and branch topology metadata preserved end to end.
- Product tools: named leaf notes, graft/prune operations, semantic cards, nutrient files, Auxo task-tree planning, search, minimap, and history rings.

## Quick start

Requirements: Node.js 20+, Python 3.11+, and an AI provider configuration appropriate for the Runtime mode you choose.

```bash
npm ci
python -m pip install -r runtime/requirements.txt
```

Start the Runtime (terminal 1):

```bash
npm run runtime:dev
```

Start the Next.js application (terminal 2):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The public landing page is `/`; the interactive TreeChat workbench is `/app`.

For a local development setup without an external model worker, the Runtime supports its configured mock/provider modes. The browser talks to the Runtime URL (`http://127.0.0.1:8000` by default); set `NEXT_PUBLIC_TREECHAT_RUNTIME_URL` when it is hosted elsewhere.

## Architecture

```text
app/
├── page.tsx                 # public landing page
├── app/page.tsx             # interactive TreeChat workbench
├── layout.tsx               # root layout and global styles
└── api/                     # compatibility proxies

runtime/
├── app/                     # task registry, scheduler, router, SSE events
├── mock_worker/             # local development worker
├── real_worker/             # HTTP worker gateway
└── vllm/                    # optional local vLLM launcher

src/
├── state/                   # tree reducer and persisted workspace state
├── components/              # workbench UI, tree scene, tools, dialogs
├── product/                 # product action seam into the Runtime
├── runtime/                 # browser Runtime client and SSE/task handling
└── lib/                     # branch topology, context compiler, nutrients, Auxo
```

## Validation

```bash
npm test
npm run test:unit
npm run test:component
python -m pytest runtime/tests -q
npm run build
```

The repository contains the product source and its automated tests. Private research runs and their raw measurements are intentionally kept outside the public source tree.

## License

MIT
