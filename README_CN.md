<h1 align="center">🌳 智构树语 · Tree Chat</h1>
<p align="center"><em>以树的方式思考，而非线性对话。</em></p>
<p align="center">
  <a href="README.md">English</a> ·
  <a href="#核心创新">核心创新</a> ·
  <a href="#快速开始">快速开始</a>
</p>

---

## 为什么是"树"

所有的 AI 对话工具都把你锁在一条线性线程里。你分叉一次，上下文就断裂了，回不到原来的分支。真正的思考不是这样的——它会发散、回溯、探索死胡同，在意想不到的地方冒出新的枝芽。

**Tree Chat 用思维导图取代了聊天线程。** 每一对 prompt/response 都成为树上的一个节点。你可以从任意节点分支出新的方向，挂上叶片笔记作为人工标注，嫁接子树来重组想法，修剪枯枝保持思路清晰。整个对话树被 3D 可视化——每一层是一面磨砂玻璃，每个节点是一张纹理卡片，从根到当前节点的路径以琥珀金色高亮。

本质上，它是一个**伪装成聊天界面的空间思维工具**。

## 核心创新

| 维度 | 传统对话 | Tree Chat |
|------|---------|-----------|
| **结构** | 线性线程——只能前进或回退 | 树图——可在任意节点分支、嫁接、修剪 |
| **导航** | 上下滚动历史记录 | 3D 空间画布，带图层、全景小地图和路径高亮 |
| **探索** | 一个问题一个回答 | 同一 prompt 分支出多个 AI 回答，并排对比 |
| **批注** | 混在对话中 | 叶片笔记——独立的批注节点，不污染 AI 对话链 |
| **历史** | 撤销一条消息 | 年轮系统——全局或节点级补丁历史（最多 50 步） |
| **美学** | 蓝紫渐变 AI 聊天风 | 有机编辑风——纸纹理、衬线字体、植物隐喻 |

### 树喻操作体系

每一个操作都以植物学词汇命名，让心智模型自然直观：

| 操作 | 含义 |
|------|------|
| 🌱 **播种 (Seed)** | 创建一个新项目，种下根问题 |
| 🌿 **分支 (Branch)** | 向 AI 追问——在当前节点下生长出新子节点 |
| 🍃 **叶片 (Leaf)** | 挂载手动笔记（不调用 AI，保持对话链纯净） |
| 🌳 **嫁接 (Graft)** | 两步重定父节点：将整棵子树移动到另一个父节点下 |
| ✂️ **修剪 (Prune)** | 删除一个节点及其全部子树 |
| 🔆 **日照 (Sunlight)** | 聚焦某个节点——选中并跳转到其所在图层 |
| 🗺️ **树冠 (Canopy)** | SVG 全景小地图，展示完整树结构 |
| 💍 **年轮 (Rings)** | 撤销/重做面板——浏览操作历史 |
| 📦 **收获 (Harvest)** | 导出为 Markdown 或 JSON |

### 树感知上下文

- 完整 `response` 继续用于展示、历史和导出；后续模型上下文只读取状态为 `valid` 的轻量语义卡片。
- Context Compiler 按“根任务 → 有效父路径语义 → 显式纳入的 Leaf → 当前任务 → 相关资料片段 → 当前问题”统一编译。
- Leaf 默认不进入 AI 上下文，只有用户显式开启后才会纳入。
- Graft 保留原问题与回答，同时将移动子树的 AI 语义标记为 `stale`，防止旧路径信息继续被使用。

### 视觉设计——有机编辑风 (Organic Editorial)

Tree Chat 刻意避开了 AI 聊天工具千篇一律的"霓虹蓝紫渐变色 + 发光光球"风格，转而采用温暖、有触感的编辑美学，灵感来自植物图鉴和印刷排版：

- **底色**：奶油纸 (`#FBF7F0`)、暖羊皮纸 (`#F5F0E8`)
- **字体**：Lora（衬线标题）+ Geist（无衬线界面）+ Geist Mono（代码）
- **肌理**：全局 CSS 噪点叠加——触摸感如纸张，而非玻璃
- **强调色**：树皮棕、鼠尾草绿、琥珀金——不发光的配色，会呼吸的界面

### 3D 空间画布

节点悬浮在堆叠的玻璃平面上（图层）。2D 模式下每次查看一个图层，3D 透视模式下所有图层同时可见。相机平滑追踪到新创建/选中的节点，之后释放控制权，允许鼠标自由探索。

- **2D 模式**：正交俯视视角，支持平移拖拽，适合浏览大型树
- **3D 模式**：等距透视视角，支持旋转观察，适合层次审视
- **平滑追踪**：新建节点时相机动画跟随，到位后自动释放，不影响自由探索

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Next.js 16](https://nextjs.org) (App Router) |
| 3D 渲染 | [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + [Drei](https://github.com/pmndrs/drei) on Three.js |
| 树布局 | [d3-hierarchy](https://github.com/d3/d3-hierarchy) (`d3.tree()`) |
| AI | DeepSeek API，通过 OpenAI SDK 调用 |
| 样式 | Tailwind CSS 4 + CSS 自定义属性 |
| 部署 | Cloudflare Workers (OpenNext) |
| 图标 | [Lucide React](https://lucide.dev) |

## 快速开始

### 环境要求

- Node.js 20+
- [DeepSeek API key](https://platform.deepseek.com/api_keys)

### 安装

```bash
git clone https://github.com/hancewang77-hl/tree-chat.git
cd tree-chat
npm ci
```

在项目根目录创建 `.env.local`：

```env
DEEPSEEK_API_KEY=sk-your-key-here
```

Key 只在服务端 Route Handler 中读取；不要使用 `NEXT_PUBLIC_` 前缀，也不要将 `.env.local` 提交到 Git。新增或修改 Key 后需重启开发服务。

### 开发

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

### 生产构建

```bash
npm run build
npm start
```

### 部署到 Cloudflare Workers

```bash
npm run build
npx @opennextjs/cloudflare build
npx wrangler deploy
```

## 项目架构

```
app/
├── page.tsx           # TreeProvider 外壳与应用流程编排
├── layout.tsx         # 根布局（字体）
├── globals.css        # CSS 变量、噪点肌理、动画
└── api/
    ├── chat/route.ts       # 流式回答 → DeepSeek
    └── structure/route.ts  # 回答完成后整理语义卡片

src/
├── types/tree.ts                  # MindNode, Project, TreeState, Actions
├── state/
│   ├── TreeContext.tsx            # useReducer + Context 提供者
│   └── treeReducer.ts            # Tree actions、补丁历史、localStorage 同步
├── components/
│   ├── scene/                    # 3D 画布、节点、图层、连线、相机
│   ├── layout/                   # 顶栏、侧栏、底部输入
│   ├── toolbar/                  # 树工具栏、缩放控件
│   └── overlays/                 # 小地图、历史、搜索、对话框
├── hooks/
│   ├── useTreeLayout.ts          # D3 树布局 + 常量
│   └── useAIChat.ts              # DeepSeek API 交互
└── lib/
    ├── contextCompiler.ts        # Tree-aware Context Compiler
    ├── semanticCard.ts           # 语义卡片校验与格式化
    ├── nutrients.ts              # 资料提取、分块与轻量相关性选择
    ├── utils.ts                  # Canvas2D 工具、clamp 等
    ├── formatResponse.ts         # Markdown→HTML、Markdown→纯文本
    └── storage.ts                # localStorage 辅助函数
```

## Star History

<a href="https://star-history.com/#hancewang77-hl/tree-chat&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=hancewang77-hl/tree-chat&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=hancewang77-hl/tree-chat&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=hancewang77-hl/tree-chat&type=Date" />
  </picture>
</a>

## License

MIT
