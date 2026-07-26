# 叶片（笔记）改造方案：名字 + 正文分离

> 目标读者：拿到本仓库源码后，按本文逐文件改动，完成「叶片」功能改造。  
> 约束：**只改叶片相关逻辑**，不要动 AI 分支、嫁接、修剪、布局主干算法等其他能力。

---

## 1. 背景与问题

### 1.1 旧行为

- 创建叶片时：底部「笔记」模式只有一个文本框，整段笔记写入节点。
- 数据字段：`MindNode.prompt = 整段笔记内容`，`MindNode.response = ""`。
- 场景展示：`LeafAttachment3D` 把 `prompt` 多行绘制成较大卡片。
- 结果：叶片挂在父节点下方时体积偏大，**遮挡 / 重叠父节点**。

### 1.2 新需求

1. **创建**：名字必填 + 笔记内容必填。
2. **场景展示**：只显示叶片名字（小标签），避免遮挡。
3. **查看详情**：点击叶片后，在右侧 Inspector 查看完整笔记正文。
4. **不改**：BRANCH / GRAFT / PRUNE / SEED / AI 请求 / trunk 布局过滤等其它逻辑。

---

## 2. 设计原则（非常重要）

### 2.1 复用现有字段，不新增 schema 字段

继续使用 `MindNode` 的：

| 字段 | 叶片新语义 | 分支原语义（不变） |
|------|------------|--------------------|
| `prompt` | **叶片名字** | 用户提问 |
| `response` | **笔记正文** | AI 回答 |
| `kind` | `"leaf"` | `"branch"` / `"root"` |

**不要**新增 `title` / `name` / `note` 之类字段，这样：

- 无需改 localStorage 结构迁移
- 导出 / 历史 / 选中 / 路径展示都能复用现有链路
- 改动面最小

### 2.2 校验规则

- `name.trim()` 非空
- `content.trim()` 非空
- 任一为空：UI 不可提交；reducer 也直接 `return state`（双保险）

### 2.3 旧数据兼容

历史上已有叶片可能是：

- `prompt = 旧笔记全文`
- `response = ""`

兼容策略：

- 场景：仍用 `prompt` 当「名字」显示（可截断）
- 详情：正文用 `response.trim() || prompt`

不需要强制迁移历史数据。

---

## 3. 涉及文件清单

| # | 文件 | 改什么 |
|---|------|--------|
| 1 | `src/types/tree.ts` | `LEAF` action 类型 |
| 2 | `src/state/treeReducer.ts` | `LEAF` 写入逻辑 |
| 3 | `app/page.tsx` | `handleAddLeaf` 传参 |
| 4 | `src/components/layout/BottomComposer.tsx` | 双字段输入 UI |
| 5 | `src/components/scene/LeafAttachment3D.tsx` | 场景只画名字 |
| 6 | `hooks/useTreeLayout.ts` | 缩小 `LEAF_W` / `LEAF_H` |
| 7 | `src/components/layout/InspectorSidebar.tsx` | 详情展示正文 |
| 8 | `src/state/treeReducer.test.ts` | 同步测试断言 |

### 明确不要改

- `TreeScene.tsx` 的叶片挂载位置公式（可保持原样；尺寸变了会自动更紧凑）
- `getTrunkChildIds` / `getLeafAttachments` 布局过滤逻辑
- AI `BRANCH`、嫁接、修剪、养分上传
- `CardTexture.tsx`（那是主干节点卡片，不是挂件叶片）

---

## 4. 逐文件修改说明

---

### 4.1 `src/types/tree.ts`

找到 `TreeAction` 中的 `LEAF`：

**改前：**

```ts
| { type: "LEAF"; content: string; parentId: string }
```

**改后：**

```ts
| { type: "LEAF"; name: string; content: string; parentId: string }
```

---

### 4.2 `src/state/treeReducer.ts`

找到 `case "LEAF":`。

**改前核心行为：**

- `prompt: action.content`
- `response: ""`
- history label：`Leaf · ${action.content.slice(0, 32)}`

**改后核心行为：**

```ts
case "LEAF": {
  const project = getActiveProject(state);
  if (!project) return state;
  const name = action.name.trim();
  const content = action.content.trim();
  if (!name || !content) return state; // 名字、内容都必填
  const parentId = resolveBranchParent(project.nodes, action.parentId);
  const parent = project.nodes[parentId];
  if (!parent) return state;

  const newNodeId = `note-${crypto.randomUUID()}`;
  const newNode: MindNode = {
    id: newNodeId,
    kind: "leaf",
    prompt: name,       // 名字
    response: content,  // 正文
    children: [],
    parentId,
    timestamp: Date.now(),
    offsetX: 0,
    offsetY: 0,
    layer: state.selectedLayer,
    nutrientRefs: [],
  };
  // ...后面挂到 parent.children、选中新节点、写 history 等逻辑保持不变
  // history label 改为：
  // label: `Leaf · ${name.slice(0, 32)}`,
  // ...
}
```

**注意：**

- `resolveBranchParent`、挂到父节点、`kind: "leaf"`、`persist` / `pushHistory` 等流程**不要改**。
- 只改字段赋值与必填校验。

---

### 4.3 `app/page.tsx`

找到 `handleAddLeaf`。

**改前：**

```ts
const handleAddLeaf = useCallback((content: string) => {
  if (!content.trim() || !activeProject) return;
  const s = stateRef.current;
  dispatch({ type: "LEAF", content: content.trim(), parentId: s.selectedNodeId });
}, [activeProject, dispatch]);
```

**改后：**

```ts
const handleAddLeaf = useCallback((name: string, content: string) => {
  if (!name.trim() || !content.trim() || !activeProject) return;
  const s = stateRef.current;
  dispatch({
    type: "LEAF",
    name: name.trim(),
    content: content.trim(),
    parentId: s.selectedNodeId,
  });
}, [activeProject, dispatch]);
```

`BottomComposer` 的 `onAddLeaf={handleAddLeaf}` 绑定方式不变，只是签名变了。

---

### 4.4 `src/components/layout/BottomComposer.tsx`

这是改动最多的 UI 文件。

#### 4.4.1 Props 签名

```ts
onAddLeaf: (name: string, content: string) => void;
```

#### 4.4.2 新增 state / ref

```ts
const [leafName, setLeafName] = useState("");
const leafNameRef = useRef<HTMLInputElement>(null);
const modeRef = useRef<ComposerMode>("ai");
```

`modeRef` 用于外部 `composer-focus` 事件时判断当前模式，避免闭包拿到旧 `mode`。

#### 4.4.3 模式切换与聚焦

在监听 `composer-mode` / `composer-focus` 时：

- `composer-mode`：同步 `modeRef.current = nextMode`，再 `setMode(nextMode)`
- `composer-focus`：若当前是 note，聚焦 `leafNameRef`；否则聚焦 `textareaRef`
- `emitComposerMode` 里也先写 `modeRef.current = nextMode`

#### 4.4.4 提交条件

```ts
const canSubmit =
  mode === "ai" ? Boolean(text.trim()) : Boolean(leafName.trim() && text.trim());

function handleSubmit() {
  if (!canSubmit) return;
  setBurst(true);
  setTimeout(() => setBurst(false), 500);
  if (mode === "ai") {
    onSend(text);
    setText("");
  } else {
    onAddLeaf(leafName, text);
    setLeafName("");
    setText("");
  }
}
```

#### 4.4.5 placeholder

```ts
const placeholder =
  mode === "ai"
    ? `在 z = ${state.selectedLayer} 层继续延伸你的思考... (Enter 发送)`
    : "填写叶片笔记内容... (Enter 保存)";
```

#### 4.4.6 输入区 UI

把原来单个 textarea 容器改为纵向布局，在 note 模式下先渲染名字输入框：

要点：

1. 外层容器：`flex flex-1 flex-col gap-2 ...`（原来是 `items-end` 单行）
2. `mode === "note"` 时显示：

```tsx
<input
  ref={leafNameRef}
  type="text"
  className="w-full bg-transparent text-[13px] font-medium outline-none placeholder:opacity-40 relative z-[1]"
  placeholder="叶片名字（必填）"
  value={leafName}
  onChange={(e) => setLeafName(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      textareaRef.current?.focus(); // 名字回车 → 跳到正文
    }
  }}
  style={{
    color: "var(--text-charcoal)",
    borderBottom: "1px solid var(--border-warm)",
    paddingBottom: 6,
  }}
/>
```

3. 下面仍是原来的 `textarea`（笔记正文）
4. 发送按钮：`disabled={!canSubmit}`，样式也用 `canSubmit` 判断，不要再用 `text.trim()` 单独判断

**不要改**：AI 模式、养分上传、土壤线 SVG、模式切换按钮外观。

---

### 4.5 `src/components/scene/LeafAttachment3D.tsx`

目标：场景挂件**只显示名字**，不再绘制多行笔记正文。

#### 4.5.1 import

去掉不再需要的 `drawWrappedText`，保留：

```ts
import { noRaycast, truncateText } from "@/src/lib/utils";
```

#### 4.5.2 纹理函数

把原来的 `createLeafCardTexture(prompt, timestamp, selected)`  
改成更轻量的 `createLeafNameTexture(name, selected)`：

- canvas 建议更小：例如 `480 × 160`（旧版偏大，适合长文本）
- 只绘制：
  - 小标签 `LEAF`
  - 一行名字：`truncateText(name.trim() || "未命名叶片", 22)`
- 不再绘制日期行、多行 wrap 文本、复杂叶脉装饰（可按视觉适度简化）

组件内：

```ts
const texture = useMemo(
  () => createLeafNameTexture(node.prompt, selected),
  [node.prompt, selected],
);
```

点击逻辑（`onSelect`）保持不变——点击后仍走现有 `SELECT_NODE`，右侧会显示详情。

完整参考实现见仓库当前文件；若对方仓库文件较旧，可直接用「只画名字」的精简版替换整个纹理绘制函数。

---

### 4.6 `hooks/useTreeLayout.ts`

缩小叶片世界尺寸，让挂件更像标签：

**改前：**

```ts
export const LEAF_W = 1.9;
export const LEAF_H = 0.78;
```

**改后：**

```ts
export const LEAF_W = 1.55;
export const LEAF_H = 0.48;
```

`TreeScene.tsx` / `CameraFocusRig.tsx` 已引用这两个常量，**一般不用再改位置公式**。

---

### 4.7 `src/components/layout/InspectorSidebar.tsx`

找到选中节点详情里 `selectedNode.kind === "leaf"` 的分支。

**改前：** 正文也显示 `selectedNode.prompt`（因为旧数据正文就在 prompt）

**改后：**

```tsx
{selectedNode.kind === "leaf" ? (
  <div
    className="rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap"
    style={{
      background: "rgba(116, 122, 85, 0.08)",
      borderColor: "rgba(116, 122, 85, 0.22)",
      color: "var(--text-charcoal)",
    }}
  >
    {selectedNode.response.trim() || selectedNode.prompt}
  </div>
) : selectedNode.response ? (
  // ...分支逻辑保持不变
```

说明：

- 上方 `<h3>{selectedNode.prompt}</h3>` 继续当「名字」标题，无需改。
- `whitespace-pre-wrap` 方便保留笔记换行。
- `response || prompt` 兼容旧叶片。

Context Path 列表里已有 `node.response` 预览逻辑，通常**不用改**。

---

### 4.8 `src/state/treeReducer.test.ts`

若仓库有 LEAF 测试，同步改成新 action：

```ts
state = treeReducer(state, {
  type: "LEAF",
  name: "Observation",
  content: "A local observation",
  parentId: "root",
});

const leaf = findNodeByPrompt(state, "Observation");
expect(leaf?.kind).toBe("leaf");
expect(leaf?.response).toBe("A local observation");
```

注意：`findNodeByPrompt` 现在应按**名字**查找，不再按正文查找。

---

## 5. 数据流总览（改完后）

```text
用户切换「笔记」模式
  → 输入 leafName（必填）
  → 输入 text 正文（必填）
  → BottomComposer.handleSubmit
  → page.handleAddLeaf(name, content)
  → dispatch({ type: "LEAF", name, content, parentId })
  → treeReducer:
       prompt = name
       response = content
       kind = "leaf"
       挂到父节点 children
  → TreeScene 渲染 LeafAttachment3D（只显示 prompt/名字）
  → 用户点击叶片 → SELECT_NODE
  → InspectorSidebar：标题=prompt，正文=response
```

---

## 6. 验收清单

按下列步骤手工验证：

1. 启动 `npm run dev`，打开页面。
2. 选中某个节点，切到「笔记」模式。
3. 只填名字不填内容 → 发送按钮禁用。
4. 只填内容不填名字 → 发送按钮禁用。
5. 名字 + 内容都填 → 可保存。
6. 场景中叶片只显示名字，不应再出现大段正文卡片遮挡父节点。
7. 点击叶片 → 右侧详情标题是名字，正文是笔记内容。
8. 再创建一个 AI 分支 → 行为与改造前一致（确认没误伤）。
9. （可选）`npm test -- src/state/treeReducer.test.ts hooks/useTreeLayout.test.ts`

---

## 7. 常见坑

1. **只改了 UI 没改 reducer**：会出现名字进了 content、或 TypeScript 报错。必须 4.1～4.3 一起改。
2. **新增了独立字段**：会破坏现有持久化与导出，不建议。
3. **改了 trunk 布局**：叶片本来就不进 `d3.tree` 主干；不要为了“防重叠”去改 `getTrunkChildIds`。
4. **忘记旧数据兼容**：详情若只读 `response`，旧叶片会空白；必须 `response || prompt`。
5. **发送按钮仍用 `text.trim()`**：note 模式下会出现「有内容但无名字也能点」的假可用状态。

---

## 8. 建议修改顺序

推荐按依赖顺序改，减少中间态编译错误：

1. `src/types/tree.ts`
2. `src/state/treeReducer.ts`
3. `app/page.tsx`
4. `BottomComposer.tsx`
5. `LeafAttachment3D.tsx`
6. `hooks/useTreeLayout.ts`
7. `InspectorSidebar.tsx`
8. 更新测试并跑一遍

---

## 9. 一句话总结

> 把叶片从「单字段整段笔记卡片」改成「名字存 prompt、正文存 response」；创建双必填；场景只显示名字；点击后在 Inspector 看正文；其它树逻辑保持不动。
