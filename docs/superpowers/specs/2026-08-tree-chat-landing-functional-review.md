# Tree Chat Landing 功能评审记录

**评审日期：** 2026-08-09

**评审范围：** `/` 九章产品页、`/app` 关键可访问性、竞赛/公共双站点展示、1920×1080 浏览器验收

**权威计划：** `TC前端设计文档-文字版Plan.md`

## 本次交付

### Page 2 播种闭环

1. Seed 按钮通过 `aria-pressed` 暴露播种状态，并更新可读状态文案。
2. 普通动效依次展示种子、萌芽与成熟树 SVG：成熟树延迟 `480ms` 出现、动画 `760ms`，完整画面额外驻留 `280ms`。
3. 总计 `1520ms` 后平滑滚动到 `#dilemma`（Page 3）；在 `1519ms` 前不得提前离页。
4. 章节指示器同步切换为 `03 / 9 · 困境与解法`。
5. `prefers-reduced-motion: reduce` 下不做插值或等待，直接定位到 Page 3。

当前中间态是概念级 SVG，不宣称为完整 3D 生长或写实树资产。

### Page 4–8 同树连续镜头

五章继续复用同一个 `NarrativeTreeScene`、同一个 Canvas 和同一份程序化树几何。当前终版关键帧为：

| 页面 | position | target | 验收目的 |
| --- | --- | --- | --- |
| Page 4 | `[0, 2.2, 16]` | `[0, 2.35, 0]` | 完整树建立镜头 |
| Page 5 | `[3.28, 9.01, 7.99]` | `[-0.54, 3.4, 1.37]` | `primary-05` 主枝近景；右侧文案安全 |
| Page 6 | `[-7.8, 5.2, 7.6]` | `[-0.85, 2.15, 0]` | 树干/年轮特写 |
| Page 7 | `[6.6, 4.4, 7.6]` | `[0, -1.7, 0]` | 根 flare 与放射状表面根清晰 |
| Page 8 | `[0, 18, 1.8]` | `[0, 4.65, 0]` | 近圆形树冠俯视与七个功能标签 |

Page 5 旧机位位于冠层世界空间包络内，实拍几乎完全遮住主枝；新机位在冠幅外瞄准真实主枝中段。Page 7 改为瞄准平移后的根部，根系已落入画面下四分之一并保持左侧文案可读。

### 导航、Logo 与工作台可访问性

- 顶部导航由 CSS 独立控制滚动态，不再与 anime.js 双重驱动；高度切换不做补间，背景、边框与模糊效果负责视觉过渡。
- 银色树枝 Logo 的渐变色标改为可按浅色滚动态覆盖，避免浅底银白图标失去对比度。
- AppHeader、树工具栏、缩放按钮、模式切换和输入区补充稳定的可访问名称及 `aria-pressed` 状态。
- ConfirmDialog 使用 `alertdialog` 与描述关联；LayerNameDialog、SearchPalette、AuxoDialog 使用命名模态对话框语义。
- 四个模态框共用 body portal 与模态栈：固定遮罩覆盖整个工作台，背景 siblings 在打开期间进入 `inert` / `aria-hidden`，只由栈顶消费 Escape，并逐层恢复触发控件焦点。
- Tab / Shift+Tab 在栈顶对话框内循环；其他模态打开时，Search 的 Ctrl/Cmd+K 与 `search-toggle` 均不响应，避免搜索改写待修剪目标；LayerNameDialog 仍保留 Enter 确认。
- 上传错误通过 live status 宣告。

### 公共版与竞赛版展示隔离

- `app/page.tsx` 在服务端读取请求 Host，通过 `src/lib/siteProfile.ts` 解析展示 profile。
- 只有规范化后与 `TREECHAT_PUBLIC_HOST` 完全相等的 Host 才返回公共版；竞赛 Host、未知、缺失、畸形与伪造后缀均 fail-closed 到竞赛版。
- 公共版保留 GitHub/MIT；竞赛版替换为中性 `Local-first` 事实，不输出账号、仓库 URL 或许可外链，并设置 `noindex,nofollow`。
- 身份常量仅存在于 server module；`LandingPage` 只接收展示对象，shared client module 不含公共身份文案。
- 运行时变量、Cloudflare 单 Worker 双域名方案和发布检查见 `docs/design/competition-deployment-profile.md`。

## 验证证据

| 检查 | 2026-08-09 结果 |
| --- | --- |
| `git diff --check` | 通过 |
| `npm run lint` | 通过 |
| `npx tsc --noEmit --incremental false` | 通过 |
| `npm test` | 通过；35 个测试文件、279 个测试 |
| `npm run build` | 通过；`/` 为动态 Host-aware 页面，`/app` 为静态页面，3 个 API 为动态路由 |
| 1920×1080 九章截图 | Page 1–9、Page 2 播种前/成熟态均已重新生成 |
| 浏览器审计 | 9 个页面；水平溢出 `0`；控制台/WebGL error `0` |
| 双 Host 交错请求 | 正反两个方向共 8 次交错请求均返回正确 profile 与 robots，无缓存串版 |
| 竞赛 HTML 身份扫描 | 作者/仓库串（不区分大小写）`0`；公开归属标签（精确大小写）`0` |
| 竞赛引用客户端脚本 | 8/8 返回 200；上述身份串与归属标签 `0`。不区分大小写的通用 `github` 扫描另命中 3 处第三方依赖 URL：`react-use-measure` 1 处、`core-js` 2 处，均不含本项目作者、仓库或公开归属标签 |
| robots | 竞赛版 `noindex,nofollow`；公共版保留可索引设置 |
| `/app` 双 Host | 均返回 200 |
| API 空请求烟测 | 配置非真实占位 Key 后，chat/structure/auxo 均在外部调用前返回 400 |

浏览器图片与审计 JSON 保存在本机 Codex 可视化工作目录，不进入生产仓库。真实 DeepSeek 回答未在本轮调用：当前 clone 不携带 `.env.local`，也未把任何真实 Key 写入命令、文档或构建产物。

## 与原 Plan 的对照

### 已基本满足

- 九章叙事、透明到浅色实底的固定导航、首屏/顶部/页尾 CTA。
- 深森林绿、银色树枝概念 Logo、Page 3 三层无环树与线性对话对照。
- Page 4–8 使用同一场景、同一树，通过相机关键帧连续移动。
- 晴空渐变、云层、WebGL 静态 fallback、无脚本核心内容降级。
- Page 5 主枝清晰且右侧四项动作可读；Page 7 根系清晰；Page 8 七个标签无重叠。
- 1920×1080 固定竞赛画布、九个 snap stop、reduced-motion 和关键键盘语义。

### 明确保留的差距

- **写实树：** 当前树仍是程序化概念资产，不是植物扫描或影视级 PBR。`island_tree_02` 原始 1K glTF 因 1.762M tris、44.03MiB、资源路径、结构、疑似冠幅比例和未完成性能验收而判定直接集成 NO-GO。详见 `docs/design/tree-asset-candidates.md`。
- **Page 2：** 已有完整可读的成熟树驻留帧，但仍不是 3D 生长镜头。
- **Page 5 布局：** 本轮保留右侧编辑式信息轨道，功能可读性高于按原文字面拆成左侧上下两段；这属于有记录的设计偏离。
- **Page 4 羽化双图层：** 原 Plan 标为待定，本轮不实现，避免临近提交引入昂贵的双场景渲染。
- **响应式：** 本轮只承诺竞赛评审视口 `1920×1080`。原 Plan 的多分辨率适配尚未启动，不能把当前版本宣称为移动端完成。
- **品牌终稿：** 当前内联枝条 Logo 是精修概念资产；缺少用户提供的最终矢量品牌文件。
- **真实部署：** 尚未取得现有 Cloudflare Worker 精确名称、public workers.dev Host、竞赛域名与部署流水线证据，因此没有盲加或执行 OpenNext/Wrangler 部署。

## 发布判断

当前可定义为：**Tree Chat 1920×1080 竞赛功能评审候选版**。

代码、构建、浏览器构图、双 profile 隔离和关键可访问性已通过本地门禁；在配置真实 `DEEPSEEK_API_KEY`、确认 Cloudflare Worker/域名、完成部署后双 Host 回归前，不应宣称“竞赛域名已上线”。在最终树资产、响应式和品牌矢量稿完成前，也不应宣称“最终视觉稿”。
