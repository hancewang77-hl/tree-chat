# 智构树语 · TreeChat

TreeChat 是一个非线性的 AI 工作台。每个问题和回答都保存为 2D 对话树上的节点，因此可以从任意历史节点继续追问，同时保留多个探索方向，并在旧分支之间来回工作。

## 产品能力

- 分支本地上下文：请求默认由系统提示词、项目全局资料、当前节点的根到祖先路径、用户明确固定/引用的内容和当前问题组成；兄弟分支默认不会进入上下文。
- Task Runtime：每次模型请求都是服务端显式 Task，具备 queued/running/终态生命周期、优先级调度、流式事件、取消、重试、超时和任务遥测。
- Worker 路由：Runtime 可连接本地 Provider 或 HTTP Worker，并携带分支拓扑信息进行健康感知路由。
- 产品工具：命名叶片、嫁接/修剪、语义卡片、资料文件、Auxo 任务树规划、搜索、树冠小地图和年轮历史。

## 快速开始

环境要求：Node.js 20+、Python 3.11+，以及所选 Runtime 模式所需的模型配置。

```bash
npm ci
python -m pip install -r runtime/requirements.txt
```

终端 1 启动 Runtime：

```bash
npm run runtime:dev
```

终端 2 启动 Next.js：

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。`/` 是公开介绍页，`/app` 是交互式 TreeChat 工作台。

本地开发可使用 Runtime 已配置的 mock/provider 模式；浏览器默认连接 `http://127.0.0.1:8000`，Runtime 部署在其他地址时设置 `NEXT_PUBLIC_TREECHAT_RUNTIME_URL`。

## 代码结构

```text
app/
├── page.tsx                 # 公开 Landing Page
├── app/page.tsx             # 交互式 TreeChat 工作台
├── layout.tsx               # 根布局与全局样式
└── api/                     # 兼容代理

runtime/
├── app/                     # Task Registry、调度器、路由器、SSE 事件
├── mock_worker/             # 本地开发 Worker
├── real_worker/             # HTTP Worker 网关
└── vllm/                    # 可选的本地 vLLM 启动脚本

src/
├── state/                   # 树 Reducer 与持久化工作区状态
├── components/              # 工作台 UI、树场景、工具与对话框
├── product/                 # 产品动作到 Runtime 的边界
├── runtime/                 # 浏览器 Runtime 客户端与 SSE/Task 处理
└── lib/                     # 分支拓扑、上下文编译、资料与 Auxo
```

## 验证

```bash
npm test
npm run test:unit
npm run test:component
python -m pytest runtime/tests -q
npm run build
```

公开仓库只包含 TreeChat 产品源代码及其自动化测试；私人研究运行、原始数据和分析报告不放入公开源树。

## 许可证

MIT
