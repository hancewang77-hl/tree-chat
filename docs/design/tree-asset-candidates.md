# Tree Chat 树资产候选清单

审计日期：2026-08-08
审计范围：当前原始工作区中 `work/` 下已经存在的树模型候选。原始模型目录保持未跟踪，不进入本次提交。

## 结论先行

**当前没有可安全进入竞赛构建的候选。**

授权层面，下面三组本地候选都来自 Poly Haven；候选页的结构化元数据标注 **CC0 1.0 Universal / public domain dedication**，Poly Haven 官方许可证页说明可用于任何目的（包括商业用途）、无需署名、允许再分发。因此，就 Poly Haven 自身声明而言，比赛展示、部署和再分发均允许；但比赛主办方的素材规则仍需单独确认，本文不是法律意见。

技术层面尚未达到“可进入构建”的标准：没有候选接入当前 R3F 场景并完成五视角（正面、侧面、俯视、枝条近景、根部近景）验收，也没有完成 1920×1080 下的帧率、内存和加载时长评估。更具体地，`island_tree_02` 的 glTF 贴图引用路径与当前落盘目录不一致（见下文），因此不能直接把它复制进 `public/` 或生产构建。

## 核验方法与证据边界

- 本地文件大小和 SHA-256 使用当前工作区文件计算；目录总大小是所有模型、glTF、贴图和（若存在）`urls.txt` 的字节总和。
- glTF 结构使用 JSON 读取：每个候选均为 1 个 node、1 个 mesh、3 个 material primitive（base、leaves、branches），不是 3 个可独立变换的场景节点。
- 贴图尺寸使用本机 `sips` 读取；三组候选的 9 张 JPEG 均为 1024×1024。
- 多边形数来自候选官方页面的结构化元数据，属于页面声明，不是本地重新三角化计数。
- 正面/侧面/俯视/枝条/根部的适配是官方缩略图、几何包围盒和材质结构的**初筛判断**；除正面缩略图外，其余角度没有在当前 R3F 场景中实机验收，故均标为“待验收”。

## 授权来源

- 候选页：
  - [Island Tree 01](https://polyhaven.com/a/island_tree_01)
  - [Island Tree 02](https://polyhaven.com/a/island_tree_02)
  - [Island Tree 03](https://polyhaven.com/a/island_tree_03)
- Poly Haven 许可证页：[https://polyhaven.com/license](https://polyhaven.com/license)
- CC0 文本：[https://creativecommons.org/publicdomain/zero/1.0/](https://creativecommons.org/publicdomain/zero/1.0/)
- 供应方：Poly Haven；页面作者为 Rob Tuytel、Rico Cilliers。
- 官方授权措辞摘要：可用于任何目的（含商业）、无需署名（署名受欢迎）、可再分发。请在最终交付中保留来源链接和本清单，便于审计追溯。

## 候选总览

| 候选 | 当前本地位置 | 格式与大小 | 官方多边形数（页面声明） | 形态初筛 | 当前状态 |
| --- | --- | --- | ---: | --- | --- |
| `island_tree_01` | `work/island_tree_01_1k/` | glTF 2.0 + `.bin` + 9×JPEG；66,338,778 B（约 63.3 MiB） | 3,729,692 | 360°较好、冠层偏高，不够宽低 | 待接入、待性能验收 |
| `island_tree_02` | `work/island_tree_02_1k/` | glTF 2.0 + `.bin` + 9×JPEG；46,172,406 B（约 44.0 MiB） | 1,762,064 | 最宽最低，最接近目标穹顶 | **视觉首选；贴图路径未修复，不能直接构建** |
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

## 候选 B：`island_tree_02`（暂定首选）

### 文件、来源与授权

- 文件位置：`work/island_tree_02_1k/island_tree_02.gltf`、`island_tree_02.bin` 和根目录下 9 张 JPEG。
- 来源链接：[https://polyhaven.com/a/island_tree_02](https://polyhaven.com/a/island_tree_02)。供应方 Poly Haven；作者 Rob Tuytel、Rico Cilliers。
- 格式：glTF 2.0（JSON）+ binary buffer + JPEG PBR 贴图；1 node / 1 mesh / 3 material primitives。
- 授权：候选页标注 CC0 1.0 Universal；按 Poly Haven 许可证页，可用于比赛展示、部署和再分发，无署名义务。比赛规则仍需另行确认。
- 几何包围盒（glTF accessor 合并初筛）：约 `4.208 × 3.407 × 4.071`（宽×高×深，模型单位）。

### 大小与 SHA-256

核心文件：

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `island_tree_02.bin` | 40,686,576 | `427d69ccc1ea12d1fb9c6af89691563b4a097f39a6f34c15be6e45ef5e5fd4ce` |
| `island_tree_02.gltf` | 8,545 | `d8c5d9ead41cdbef91a648f40ff60470faa19eb3a7010e59e44cb1a01250f75d` |
| 目录合计（含 9 张贴图） | 46,172,406 | 目录无单一原生 hash；请按逐文件 hash 复核 |

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
- 正面：**最佳**，宽低冠层和露出的扭曲树干最符合当前 1920×1080 评审构图（官方正面缩略图）。
- 侧面：良好（推测 360°几何覆盖，待实机）；俯视：良好（冠层近圆，待实机）。
- 枝条近景：良好，外伸枝梢可作为 Page 5 的候选焦点；根部近景：可用，但根部与树干是一体几何，不能独立剪辑或动画。
- 近圆形树冠：**满足度最高**；360°分枝：基本满足；宽低穹顶：**三者中最接近**。

### 未核实风险（阻断直接接入）

- glTF 里的 9 个 `images[].uri` 都是 `textures/...`，但当前本地文件实际位于 `work/island_tree_02_1k/` 根目录，9 条引用全部检查为 MISSING。不要在原始目录上直接改写；应先重新下载或在副本中修复路径，并重新计算 hash。
- 约 1,762,064 个多边形（官方页面声明），仍可能对移动端/低端 GPU 过重；需做 LOD、实例化和纹理压缩评估。
- 叶片材质为 `alphaMode: BLEND`，透明排序、双面和阴影设置尚未在 R3F 验收。
- 当前没有完成正面、侧面、俯视、枝条近景、根部近景五关键帧的浏览器截图验收。

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

### 暂定视觉首选：`island_tree_02`

理由：约 `46,172,406 B`（约 44.0 MiB）的本地 bundle 是三者中最小的，官方多边形数也最低；它的宽低、近圆冠层和 360° 外伸枝梢最贴近当前 Plan 的“宽低穹顶 + 枝条近景”目标。

授权结论：Poly Haven 候选页和官方许可证页均声明 **CC0 1.0 Universal**，允许比赛展示、部署、商业使用和再分发，无强制署名。建议仍在项目发布页保留作者与来源链接，且让比赛负责人确认赛规。

准入结论：**暂不准入竞赛构建。** 必须先在副本中修复贴图路径、重新做 SHA-256 清单，并在共享 R3F 场景完成五视角、透明材质、性能和加载回归；这些步骤完成前，不应把它当作生产资产。

### 其他候选决策

- `island_tree_01`：可作为备选，树干/根部近景表现好，但冠层偏高，且体积接近 63 MB。
- `island_tree_03`：不建议作为主角；多主干、沙地底座、4.76M 多边形和 81 MiB 级 bundle 都不符合当前评审目标。

## 预览与再分发处理

- 本次没有创建 `docs/design/tree-candidates/`，也没有把 `/private/tmp/` 中的临时 PNG 缩略图复制进仓库。
- 原因：当前没有稳定的浏览器探针来完成五视角实机截图；即使来源为 CC0，也应只提交必要、经过压缩的预览，避免在资产尚未验收时扩大再分发范围。
- 后续若补预览，只放正面、侧面、俯视、枝条近景、根部近景等必要 WebP，全部小于 5 MB，并在文件旁保留来源和许可证链接。

## 下一步清单

1. 重新下载 `island_tree_02` 的完整 1K glTF bundle，或在副本中把 9 个 `images[].uri` 与文件位置对齐；不要修改本次审计所记录的原始文件。
2. 在 `NarrativeTreeScene` 的共享场景接入候选，分别锁定 Page 4–8 的五个关键帧并截图。
3. 测量首屏加载、GPU 内存、帧率和透明叶片排序；必要时制作 LOD、压缩贴图和更小的部署包。
4. 由项目负责人/比赛负责人确认 CC0 资产在具体比赛规则中的展示、部署和再分发要求，并把确认结果附到发布记录。
5. 通过上述准入门槛后，再把“生产副本”放到受版本控制的资产目录；本次 `work/` 原始目录继续保持不提交。
