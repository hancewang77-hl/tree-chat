# Tree Chat 树资产候选清单

审计日期：2026-08-08

一手来源补充核验：2026-08-09
审计范围：当前原始工作区中 `work/` 下已经存在的树模型候选。原始模型目录保持未跟踪，不进入本次提交。

## 结论先行

**当前没有可安全进入竞赛构建的候选。** `island_tree_02` 的分层结论如下：

| 决策层 | 结论 | 原因 |
| --- | --- | --- |
| 许可 | **GO** | 3D 模型及随模型提供的贴图为 CC0；具体赛规仍需项目负责人确认 |
| 原始 1K glTF 直接集成 | **NO-GO** | 9 条贴图路径失配、44.03 MiB 传输、1,762,064 tris、无可运行 LOD、世界空间冠幅未核实、根部不可独立控制 |
| 由原模型制作生产衍生资产 | **条件 GO** | 必须通过本文的文件、validator、冠幅、结构、几何、传输、GPU、FPS 和五机位准入门 |

Poly Haven 官方许可证允许商业使用、修改和再分发，也不强制署名。该许可只覆盖 CC0 资产本身。Poly Haven 的官方预览图、Logo、网页文案和用户提交渲染仍受网站知识产权条款保护，不能当作 CC0 素材复制进仓库。若产品运行时使用 Poly Haven live API，还需按 API 条款标注来源并发送唯一 User-Agent；静态托管下载后的 CC0 资产不受这项 API 使用条件约束。

技术层面没有候选完成当前 Page 4–8 五个真实相机关键帧的验收，也没有完成 1920×1080 核显档的帧率、GPU 预算和加载评估。`island_tree_02` 不能直接复制进 `public/` 或生产构建。

## 核验方法与证据边界

- 本地文件大小和 SHA-256 使用当前工作区文件计算；目录总大小是所有模型、glTF、贴图和（若存在）`urls.txt` 的字节总和。
- glTF 结构使用 JSON 读取：每个候选均为 1 个 node、1 个 mesh、3 个 material primitive（base、leaves、branches），不是 3 个可独立变换的场景节点。
- 贴图尺寸使用本机 `sips` 读取；三组候选的 9 张 JPEG 均为 1024×1024。
- 多边形数、官方尺寸、LOD 标记和下载文件依赖使用 Poly Haven 官方 `info` / `files` API 复核。`island_tree_02` 的精确官方值为 `1,762,064` tris。
- 正面/侧面/俯视/枝条/根部的适配是官方缩略图、几何包围盒和材质结构的**初筛判断**；除正面缩略图外，其余角度没有在当前 R3F 场景中实机验收，故均标为“待验收”。
- 2026-08-09 的一手来源复核没有重新下载模型。原始工作区的 SHA-256 和落盘布局仍属于 2026-08-08 的本地证据；本次只用官方 API 交叉核对元数据、依赖路径和文件大小。

## 授权来源

- 候选页：
  - [Island Tree 01](https://polyhaven.com/a/island_tree_01)
  - [Island Tree 02](https://polyhaven.com/a/island_tree_02)
  - [Island Tree 03](https://polyhaven.com/a/island_tree_03)
- Poly Haven 许可证页：[https://polyhaven.com/license](https://polyhaven.com/license)
- CC0 文本：[https://creativecommons.org/publicdomain/zero/1.0/](https://creativecommons.org/publicdomain/zero/1.0/)
- Poly Haven 官方元数据 API：[info/island_tree_02](https://api.polyhaven.com/info/island_tree_02)、[files/island_tree_02](https://api.polyhaven.com/files/island_tree_02)
- 供应方：Poly Haven；页面作者为 Rob Tuytel、Rico Cilliers。
- 官方授权措辞摘要：CC0 资产可用于任何目的（含商业）、无需署名（署名受欢迎）、可修改和再分发。请在最终交付中保留作者、来源链接、许可链接和转换记录，便于审计追溯。
- Poly Haven [Terms of Service](https://polyhaven.com/license#terms) 将官方 Logo、资产示例渲染、网页文案和用户提交渲染排除在 CC0 资产之外。项目预览必须由团队从 CC0 模型自行渲染。
- Poly Haven [API 使用说明](https://polyhaven.com/our-api) 要求 live API 使用者标注 Poly Haven 来源并发送唯一 User-Agent；生产站点若不调用 live API，则不触发该 API 条件。

## 候选总览

| 候选 | 当前本地位置 | 格式与大小 | 官方多边形数（页面声明） | 形态初筛 | 当前状态 |
| --- | --- | --- | ---: | --- | --- |
| `island_tree_01` | `work/island_tree_01_1k/` | glTF 2.0 + `.bin` + 9×JPEG；66,338,778 B（约 63.3 MiB） | 3,729,692 | 360°较好、冠层偏高，不够宽低 | 待接入、待性能验收 |
| `island_tree_02` | `work/island_tree_02_1k/` | glTF 2.0 + `.bin` + 9×JPEG；46,172,406 B（约 44.0 MiB） | 1,762,064 | 最宽最低；世界空间冠幅待复测 | **衍生制作候选；原始包 NO-GO** |
| `island_tree_03` | `work/island_tree_03_1k/` | glTF 2.0 + `.bin` + 9×JPEG；84,886,976 B（约 81.0 MiB） | 4,760,490 | 多主干、带沙地底座，不符合主角树 | 不建议作为主角 |

> 用户要求避免提交约 44–63 MB 的原始 GLB/FBX/贴图模型。本清单只记录候选，不包含任何原始模型；`island_tree_03` 也明显超过该体积范围。

## 候选 A：`island_tree_01`

### 文件、来源与授权

- 文件位置：`work/island_tree_01_1k/island_tree_01.gltf`、`island_tree_01.bin`、`textures/` 下 9 张 JPEG；同目录有下载 URL 记录 `urls.txt`。
- 来源链接：[https://polyhaven.com/a/island_tree_01](https://polyhaven.com/a/island_tree_01)。供应方 Poly Haven；作者 Rob Tuytel、Rico Cilliers。
- 格式：glTF 2.0（JSON）+ binary buffer + JPEG PBR 贴图；1 node / 1 mesh / 3 material primitives。
- 授权：候选页标注 CC0 1.0 Universal；按 Poly Haven 许可证页，可用于比赛展示、部署和再分发，无署名义务。比赛规则仍需另行确认。
- 几何包围盒（glTF accessor 合并初筛）：约 `4.755 × 5.027 × 4.818`（宽×高×深，模型单位）。

### 大小与 SHA-256

核心文件：

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `island_tree_01.bin` | 60,709,812 | `1faa817b46e24ed6fc90d3ec72188a0dc5ac75e82c89b3dd3c5fdaecf7cc005c` |
| `island_tree_01.gltf` | 8,576 | `78e905a40670bfabb2760601d4d9a6c17193a50d68e6271c66893eb7bd75906d` |
| 目录合计（含 9 张贴图和 `urls.txt`） | 66,338,778 | 目录无单一原生 hash；请按逐文件 hash 复核 |

贴图均为 1024×1024 JPEG，逐文件 hash：

| 类型 | 文件 | SHA-256 |
| --- | --- | --- |
| base normal | `textures/island_tree_01_nor_gl_1k.jpg` | `ca22e428e1b1ebac47b2fc67ec355700c8779d6628d2fc6c3ebae9002988f63e` |
| base diffuse | `textures/island_tree_01_diff_1k.jpg` | `51bff9a3a6ed7d89ff4c73f01708b7267ed8d7a82b0cb12343741894f708218f` |
| base ARM | `textures/island_tree_01_arm_1k.jpg` | `bf972dff0fbc71f146b4c02103fc3596477a49a9eff46b87b13c89b7b90d18ca` |
| leaves normal | `textures/island_tree_01_leaves_nor_gl_1k.jpg` | `07ba461c0c95da4e49a42981766bdb6191d4c3c4d815796c082266dcc3cecdb8` |
| leaves diffuse | `textures/island_tree_01_leaves_diff_1k.jpg` | `f56d762a1507754752abf164cc12acbc1e87ce87fa609ac44b98a1b0037c89d8` |
| leaves ARM | `textures/island_tree_01_leaves_arm_1k.jpg` | `90da3a072dbcb052715b1313b9dbc69a4aa8a09a31a4b3868411a2bb51d72037` |
| branches normal | `textures/island_tree_01_branches_nor_gl_1k.jpg` | `2d67393ba76a0f49cf965fa0c99d8c16268e71e87b1203d35539bfdb971a514e` |
| branches diffuse | `textures/island_tree_01_branches_diff_1k.jpg` | `bee5ec22196e9e31ad0c95a5a9b4636571cc0124d5bb27a92f1e307d289cc60d` |
| branches ARM | `textures/island_tree_01_branches_arm_1k.jpg` | `9e3f82263247ce4f619692cea4c4f6fe9936ff465a86623481849062642c7d05` |

### 结构与视角适配初筛

- 独立部件：有独立的 base、leaves、branches **材质 primitive**；没有独立树干 node，也没有独立 root mesh。树干和可见根部整合在 base primitive 中。
- 正面：良好；树干、根 flare 和冠层层次清晰（官方正面缩略图）。
- 侧面：良好（推测 360°几何覆盖，待实机）；俯视：良好（冠层横向覆盖完整，待实机）。
- 枝条近景：良好，branches primitive 可单独改材质但不能在场景树中单独动画；根部近景：良好，根部可见但不是独立可拆部件。
- 近圆形树冠：基本满足；360°分枝：基本满足；宽低穹顶：**部分满足**，整体高度和上收趋势偏强。

### 未核实风险

- `.bin` 接近 63 MB，仍需确认首屏加载、GPU 内存和竞赛服务器带宽；不能原样提交仓库。
- 目前没有在 Tree Chat 的共享 R3F 场景中验证 alpha blending、法线方向、枝条近景和根部遮挡。
- 只有 LOD0；需要单独制作或确认 LOD/压缩方案。

## 候选 B：`island_tree_02`（衍生制作候选）

### 文件、来源与授权

- 文件位置：`work/island_tree_02_1k/island_tree_02.gltf`、`island_tree_02.bin` 和根目录下 9 张 JPEG。
- 来源链接：[https://polyhaven.com/a/island_tree_02](https://polyhaven.com/a/island_tree_02)。供应方 Poly Haven；作者 Rob Tuytel、Rico Cilliers。
- 格式：glTF 2.0（JSON）+ binary buffer + JPEG PBR 贴图；1 node / 1 mesh / 3 material primitives。
- 授权：候选页标注 CC0 1.0 Universal；按 Poly Haven 许可证页，可用于比赛展示、部署和再分发，无署名义务。比赛规则仍需另行确认。
- glTF accessor 原始范围合并初筛：约 `4.208 × 3.407 × 4.071`（宽×高×深，模型单位）。这个数值没有证明它是加载后的世界空间包围盒。
- Poly Haven 官方 API 的 `dimensions` 为 `[8485.513, 4078.616, 3408.904]` mm，资产页同时标注 `8.5m wide`。官方尺寸与 accessor 原始范围冲突，说明场景节点或对象变换可能改变了横向尺寸。若前两个数值对应两个水平轴，横向长短轴比约为 `2.08:1`，不满足“俯视近圆形冠幅”。接入前必须在 `GLTFLoader` 加载、更新世界矩阵后用世界空间 `Box3` 复测，不能继续用 accessor 原始范围判定冠幅。

### 大小与 SHA-256

核心文件：

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `island_tree_02.bin` | 40,686,576 | `427d69ccc1ea12d1fb9c6af89691563b4a097f39a6f34c15be6e45ef5e5fd4ce` |
| `island_tree_02.gltf` | 8,545 | `d8c5d9ead41cdbef91a648f40ff60470faa19eb3a7010e59e44cb1a01250f75d` |
| 目录合计（含 9 张贴图） | 46,172,406 | 目录无单一原生 hash；请按逐文件 hash 复核 |

官方 `files` API 精确给出相同总量：glTF `8,545 B`、几何 bin `40,686,576 B`、9 张 1K JPEG 合计 `5,477,285 B`，总计 `46,172,406 B`（约 `44.03 MiB`）。官方 1K、2K、4K、8K glTF 条目全部引用同一份 `40,686,576 B` 几何 bin；提高或降低纹理分辨率不会减少 1,762,064 tris。官方 metadata 的 `lods: true` 说明源资产具备 LOD/几何节点相关制作信息，**不代表当前 glTF 包含可在 Three.js 中切换的运行时 LOD**。

贴图均为 1024×1024 JPEG，逐文件 hash：

| 类型 | 文件 | SHA-256 |
| --- | --- | --- |
| base normal | `island_tree_02_nor_gl_1k.jpg` | `1580d5a42d02f4ede51bfb03972ab0aef3d8acafbd3692276879171007bb70ec` |
| base diffuse | `island_tree_02_diff_1k.jpg` | `8fc20397ab5d514c119d7a025868414d78e436138d3867a4b7ba12334a72ec3a` |
| base ARM | `island_tree_02_arm_1k.jpg` | `ada61dd4fad023e699b6314b8b76590017b301719bf74ffc9e20b95893ed62b6` |
| leaves normal | `island_tree_02_leaves_nor_gl_1k.jpg` | `07ba461c0c95da4e49a42981766bdb6191d4c3c4d815796c082266dcc3cecdb8` |
| leaves diffuse | `island_tree_02_leaves_diff_1k.jpg` | `f56d762a1507754752abf164cc12acbc1e87ce87fa609ac44b98a1b0037c89d8` |
| leaves ARM | `island_tree_02_leaves_arm_1k.jpg` | `90da3a072dbcb052715b1313b9dbc69a4aa8a09a31a4b3868411a2bb51d72037` |
| branches normal | `island_tree_02_branches_nor_gl_1k.jpg` | `2d67393ba76a0f49cf965fa0c99d8c16268e71e87b1203d35539bfdb971a514e` |
| branches diffuse | `island_tree_02_branches_diff_1k.jpg` | `bee5ec22196e9e31ad0c95a5a9b4636571cc0124d5bb27a92f1e307d289cc60d` |
| branches ARM | `island_tree_02_branches_arm_1k.jpg` | `9e3f82263247ce4f619692cea4c4f6fe9936ff465a86623481849062642c7d05` |

### 结构与视角适配初筛

- 独立部件：有独立的 base、leaves、branches **材质 primitive**；没有独立树干 node，也没有独立 root mesh。树干和根部整合在 base primitive 中。
- 正面：宽低冠层和露出的扭曲树干适合当前 1920×1080 评审构图（官方正面缩略图）。
- 侧面：待实机。俯视：**暂不通过**；官方尺寸暴露出约 `2:1` 横向比例风险，必须完成世界空间复测和顶部截图后再判断。
- 枝条近景：良好，外伸枝梢可作为 Page 5 的候选焦点；根部近景：只能作为 root flare 参考，根部与树干是一体几何，不能独立剪辑或动画。
- 360°分枝和宽低穹顶仍可进入视觉初筛；“近圆形树冠满足度最高”的旧结论撤回，等待世界空间证据。

### 未核实风险（阻断直接接入）

- glTF 里的 9 个 `images[].uri` 都是 `textures/...`，但当前本地文件实际位于 `work/island_tree_02_1k/` 根目录，9 条引用全部检查为 MISSING。不要在原始目录上直接改写；应先重新下载或在副本中修复路径，并重新计算 hash。
- 官方精确多边形数为 `1,762,064` tris。该数值和 40.7 MB 几何 bin 已超过本文为普通核显设置的直接准入预算，原始资产判定为 NO-GO，而不是“可能过重”。
- 1K–8K glTF 共用同一份完整几何 bin；必须自行制作并导出生产 LOD。
- 叶片材质为 `alphaMode: BLEND`，透明排序、双面和阴影设置尚未在 R3F 验收。
- 当前只有 base、leaves、branches 三个 material primitive，没有独立 root node。Page 7 若需要可读的根部叙事，生产衍生资产必须拆出或补充 root mesh。
- 当前没有完成代码中 Page 4 完整树、Page 5 枝条、Page 6 树干、Page 7 根部、Page 8 树冠五个真实相机关键帧的浏览器截图验收。清单原先使用的“正面、侧面、俯视、枝条、根部”不能代替实际五机位。

## 候选 C：`island_tree_03`

### 文件、来源与授权

- 文件位置：`work/island_tree_03_1k/island_tree_03.gltf`、`island_tree_03.bin`、`textures/` 下 9 张 JPEG；同目录有 `urls.txt`。
- 来源链接：[https://polyhaven.com/a/island_tree_03](https://polyhaven.com/a/island_tree_03)。供应方 Poly Haven；作者 Rob Tuytel、Rico Cilliers。
- 格式：glTF 2.0（JSON）+ binary buffer + JPEG PBR 贴图；1 node / 1 mesh / 3 material primitives。
- 授权：候选页标注 CC0 1.0 Universal；按 Poly Haven 许可证页，可用于比赛展示、部署和再分发，无署名义务。比赛规则仍需另行确认。
- 几何包围盒（glTF accessor 合并初筛）：约 `2.972 × 2.615 × 2.913`（宽×高×深，模型单位）。

### 大小与 SHA-256

核心文件：

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `island_tree_03.bin` | 79,562,548 | `ac0631f236502155307ac0320b53201a0d3bab6348699ad9edd3172322aaf08b` |
| `island_tree_03.gltf` | 8,557 | `5efbe24ad6fc769db55ac771eec7a2ee7aa389c5667656f279d0743e455ef04a` |
| 目录合计（含 9 张贴图和 `urls.txt`） | 84,886,976 | 目录无单一原生 hash；请按逐文件 hash 复核 |

贴图均为 1024×1024 JPEG，逐文件 hash：

| 类型 | 文件 | SHA-256 |
| --- | --- | --- |
| base normal | `textures/island_tree_03_nor_gl_1k.jpg` | `c8d37a704416decd72b43b78b13ef23ffbb9f0df1db6686289784af02aff7db6` |
| base diffuse | `textures/island_tree_03_diff_1k.jpg` | `e7fc1f1e82cd2fb3deee5fb3ca821e8f54b3a6e5ba414a31b87692fbfc12464a` |
| base ARM | `textures/island_tree_03_arm_1k.jpg` | `58e95c08ab80cf9bacdb5e1b7a89c842cdbaca68110d3d675e0e26cf835fa2fa` |
| leaves normal | `textures/island_tree_03_leaves_nor_gl_1k.jpg` | `07ba461c0c95da4e49a42981766bdb6191d4c3c4d815796c082266dcc3cecdb8` |
| leaves diffuse | `textures/island_tree_03_leaves_diff_1k.jpg` | `f56d762a1507754752abf164cc12acbc1e87ce87fa609ac44b98a1b0037c89d8` |
| leaves ARM | `textures/island_tree_03_leaves_arm_1k.jpg` | `90da3a072dbcb052715b1313b9dbc69a4aa8a09a31a4b3868411a2bb51d72037` |
| branches normal | `textures/island_tree_03_branches_nor_gl_1k.jpg` | `2d67393ba76a0f49cf965fa0c99d8c16268e71e87b1203d35539bfdb971a514e` |
| branches diffuse | `textures/island_tree_03_branches_diff_1k.jpg` | `bee5ec22196e9e31ad0c95a5a9b4636571cc0124d5bb27a92f1e307d289cc60d` |
| branches ARM | `textures/island_tree_03_branches_arm_1k.jpg` | `9e3f82263247ce4f619692cea4c4f6fe9936ff465a86623481849062642c7d05` |

### 结构与视角适配初筛

- 独立部件：有独立的 base、leaves、branches **材质 primitive**；没有独立树干 node，也没有独立 root mesh。根、树干和沙地底座整合在 base primitive 中。
- 正面：一般；多主干和沙地底座会分散 Page 4 的单树主角焦点（官方正面缩略图）。
- 侧面：一般（待实机）；俯视：一般，沙地底座会破坏近圆形冠层的纯净轮廓（待实机）。
- 枝条近景：良好，枝条层次丰富；根部近景：良好但会带出大块沙地底座。
- 近圆形树冠：部分满足；360°分枝：基本满足；宽低穹顶：不满足，形态更像低矮多主干风塑树。

### 未核实风险

- 约 4,760,490 个多边形且 `.bin` 约 79.6 MB，明显超过当前构建预算；不应原样提交或部署。
- 多主干、沙地底座与 Page 4–8 的单一树干/根部叙事冲突。
- 仍未完成 R3F 材质、透明排序、阴影和五关键帧实机验收。

## 推荐与准入结论

### `island_tree_02`：只保留为衍生制作候选

它仍是三者中体积和多边形数最低的候选，宽低树形、扭曲树干和外伸枝梢适合完整树、枝条与树干镜头。官方世界尺寸与 accessor 范围的冲突使“近圆冠层”失去证据支持；在 Page 8 顶视复测前，不再把它称为视觉首选。

- **许可 GO：** Poly Haven 候选页和官方许可证页均声明 CC0 1.0 Universal，允许修改、部署、商业使用和再分发，无强制署名。项目仍应保留作者、来源、许可和转换记录，并让比赛负责人确认赛规。
- **原始 1K glTF 直接集成 NO-GO：** 贴图路径失配、44.03 MiB 传输、1,762,064 tris、无可运行 LOD、冠幅冲突和根部不可独立控制均未过门。
- **生产衍生资产条件 GO：** 团队需从同一源树制作分区节点、三档 LOD、压缩几何和纹理，并通过下面所有准入项。

### `island_tree_02` 准入表

所有强制项都需通过；性能均值不能抵消文件、冠幅或结构失败。

| 准入门 | GO 标准 | 当前结论 |
| --- | --- | --- |
| 文件完整性 | 官方 MD5 与项目 SHA-256 可追踪；`GLTFLoader` 请求 0 个缺失资源、0 个 404；生产副本中的 URI 与实际目录一致 | **NO-GO**：原始落盘目录有 9 条 MISSING |
| glTF validator | Khronos [glTF Validator](https://github.com/KhronosGroup/glTF-Validator) 报告 0 error；所有 warning 逐条审阅并记录豁免 | 未验证 |
| 世界空间冠幅 | 加载并更新世界矩阵后测量；水平长短轴比 `<= 1.15`，顶部八方向均有连续冠层覆盖；`1.15–1.25` 需用户特批，`> 1.25` 直接淘汰 | **疑似 NO-GO**：官方尺寸提示约 `2.08:1`，待复测 |
| 结构 | 生产资产至少拆分 `trunk/root`、`primary branches`、`leaves`；Page 7 有独立或同源补充 root mesh；Page 4–8 共享同一世界变换和树身份 | **NO-GO**：当前 1 mesh / 3 material primitives，无独立 root |
| 几何 | 核显路径活动总量 `<= 350k tris/frame`；建议近、中、远三档约 `350k / 150k / 50k`；投射阴影的几何 `<= 100k tris`，叶片不投射实时阴影 | **NO-GO**：原始 `1,762,064` tris，且只有完整几何 bin |
| 传输 | Page 4 前所需基础树 `<= 8 MiB`；按需加载的全部局部高模累计 `<= 16 MiB`；树资产不阻塞首屏 LCP | **NO-GO**：原始 1K 包 `44.03 MiB` |
| GPU 预算 | KTX2/BasisU 等 GPU 压缩贴图估算 `<= 32 MiB`；树的几何与贴图合计估算 `<= 96 MiB`；无 WebGL context loss | 未验证；9 张 1K JPEG 解码为 RGBA8 并带 mipmap 时理论值约 `48 MiB` |
| FPS 与渲染 | 1920×1080、DPR 1、普通核显、生产构建：中位 `>= 45 FPS`、1% low `>= 30 FPS`、draw calls `<= 60`；无持续透明排序闪烁或明显 LOD 跳变 | 未测试；当前 Canvas 上限 DPR 1.5 且开启阴影，不能视为已通过 |
| 五机位 | 使用代码中的五个 `CAMERA_KEYS` 逐一截图：Page 4 完整树、Page 5 枝条、Page 6 树干、Page 7 根部、Page 8 树冠；无裁切、穿模、贴图缺失、叶片排序错误，局部功能焦点可读 | 未测试 |

普通核显策略：Page 4 和 Page 8 使用中等 LOD；Page 5、6、7 保留中等整树作连续背景，并按章节加载同源枝条、树干或根部局部高模。运行时按页面进度切换局部 LOD，不能只依赖相机距离。核显档将 Canvas DPR 限为 `1`，关闭叶片阴影，静止时维持 demand frameloop。几何可使用 Meshopt/Draco，纹理使用 KTX2/BasisU；Three.js `GLTFLoader` 支持这些扩展。

### 其他候选决策

- `island_tree_01`：可作为备选，树干/根部近景表现好，但冠层偏高，且体积接近 63 MB。
- `island_tree_03`：不建议作为主角；多主干、沙地底座、4.76M 多边形和 81 MiB 级 bundle 都不符合当前评审目标。

## 预览与再分发处理

- 本次没有创建 `docs/design/tree-candidates/`，也没有把 `/private/tmp/` 中的临时 PNG 缩略图复制进仓库。
- Poly Haven 官方预览图、正交图、Logo、网页文案和用户提交渲染不属于 CC0 资产范围，不能复制进仓库。CC0 覆盖的是模型及其资产贴图。
- 后续只提交团队从 CC0 模型自行渲染的 Page 4–8 五机位 WebP，全部小于 5 MB，并在文件旁保留模型来源和许可证链接。

## 下一步清单

1. 由项目负责人/比赛负责人确认 CC0 资产在具体比赛规则中的展示、部署和再分发要求，并把结果附到发布记录。
2. 在保持审计原件不变的前提下取得完整官方 1K bundle，按官方 `files` API 的 `textures/...` 依赖布局建立生产副本，并核对官方 MD5 与项目 SHA-256。
3. 先在 `GLTFLoader` 世界空间中测量两个水平轴并拍摄 Page 8 顶视。长短轴比 `> 1.25` 时立即淘汰该候选，不再投入 LOD 和压缩制作。
4. 冠幅过门后，再拆分树干/根、主枝和叶片，制作三档 LOD、Meshopt/Draco 几何和 KTX2/BasisU 贴图，并用 Khronos validator 验证。
5. 在 `NarrativeTreeScene` 的共享场景运行实际 Page 4–8 五个关键帧，记录截图、网络传输、GPU 预算、FPS、draw calls、透明排序和 WebGL context 状态。
6. 所有准入门通过后，再把生产衍生资产放到受版本控制的资产目录；`work/` 审计原件继续保持不提交。
