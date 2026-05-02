"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  Info,
  RotateCcw,
} from "lucide-react";
import type { NodesMap, ToolMode } from "@/src/types/tree";
import type { MindNode } from "@/hooks/useTreeLayout";
import {
  getContextPath,
  getVisibleIdsForPlane,
} from "@/hooks/useTreeLayout";
import { useAIChat } from "@/hooks/useAIChat";
import { useResizableSidebar } from "@/hooks/useResizableSidebar";
import { clamp } from "@/src/lib/utils";
import { TreeScene } from "@/src/components/scene/TreeScene";
import { PathSidebar } from "@/src/components/sidebar/PathSidebar";
import { SceneToolbar } from "@/src/components/toolbar/SceneToolbar";
import { ZoomControls } from "@/src/components/toolbar/ZoomControls";
import { LayerNameDialog } from "@/src/components/LayerNameDialog";

const initialNodes: NodesMap = {
  root: {
    id: "root",
    prompt: "如何构建一个适合理工科教育的下一代AI交互平台？",
    response: `这是一个非常前沿的课题。"智构树语"的核心在于打破线性对话。
要构建这个平台，我们需要从三个维度入手：
1. 交互层：非线性画布
2. 逻辑层：上下文分支控制
3. 场景层：数理逻辑推导演算
你想先从哪个维度展开探索？`,
    children: [],
    parentId: null,
    timestamp: Date.now(),
    offsetX: 0,
    offsetY: 0,
    layer: 0,
  },
};

export default function Page() {
  const [displayLayer, setDisplayLayer] = useState(0);
  const [nodes, setNodes] = useState<NodesMap>(initialNodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("root");
  const [inputText, setInputText] = useState("");

  const { isAiTyping, sendMessage } = useAIChat();
  const { sidebarWidth, startResizing } = useResizableSidebar(420);

  const [toolMode, setToolMode] = useState<ToolMode>("view");
  const [is3DMode, setIs3DMode] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [zoom2D, setZoom2D] = useState(105);
  const [zoom3D, setZoom3D] = useState(1);
  const [planeNames, setPlaneNames] = useState<Record<number, string>>({
    0: "根节点层",
  });
  const [isPlaneNameDialogOpen, setIsPlaneNameDialogOpen] = useState(false);
  const [planeNameInput, setPlaneNameInput] = useState("");
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);
  const [pendingNodeLayer, setPendingNodeLayer] = useState<number | null>(null);

  // Animate displayLayer toward selectedLayer
  useEffect(() => {
    let frame = 0;

    function animate() {
      setDisplayLayer((prev) => {
        const next = prev + (selectedLayer - prev) * 0.14;
        if (Math.abs(next - selectedLayer) < 0.001) return selectedLayer;
        return next;
      });

      frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [selectedLayer]);

  // Reset layerMove state when leaving layerMove mode
  useEffect(() => {
    if (toolMode !== "layerMove" || !is3DMode) {
      setMovingNodeId(null);
      setPendingNodeLayer(null);
    }
  }, [toolMode, is3DMode]);

  // Auto-select a node on the current layer when in layerMove + 3D mode
  useEffect(() => {
    if (!is3DMode || toolMode !== "layerMove" || movingNodeId !== null) return;

    const selectedNode = nodes[selectedNodeId];
    if (!selectedNode) return;

    if (selectedNode.layer === selectedLayer) return;

    const candidates = Object.values(nodes).filter(
      (node) => node.layer === selectedLayer,
    );

    if (candidates.length === 0) {
      setSelectedNodeId("root");
      return;
    }

    const best = candidates.reduce((bestNode, currentNode) => {
      const bestDepth = getContextPath(nodes, bestNode.id).length;
      const currentDepth = getContextPath(nodes, currentNode.id).length;

      if (currentDepth < bestDepth) return currentNode;
      if (currentDepth > bestDepth) return bestNode;

      return currentNode.timestamp < bestNode.timestamp
        ? currentNode
        : bestNode;
    });

    if (best.id !== selectedNodeId) {
      setSelectedNodeId(best.id);
    }
  }, [is3DMode, toolMode, movingNodeId, selectedLayer, selectedNodeId, nodes]);

  const currentPath = useMemo(
    () => getContextPath(nodes, selectedNodeId),
    [nodes, selectedNodeId],
  );

  const allLayers = useMemo(
    () => Object.values(nodes).map((n) => n.layer),
    [nodes],
  );
  const minLayer = Math.min(...allLayers, selectedLayer, 0);
  const maxLayer = Math.max(...allLayers, selectedLayer, 0);

  function handleZoomIn() {
    if (is3DMode) {
      setZoom3D((prev) => clamp(prev + 0.2, 0.1, 4.0));
    } else {
      setZoom2D((prev) => clamp(prev + 14, 40, 260));
    }
  }

  function handleZoomOut() {
    if (is3DMode) {
      setZoom3D((prev) => clamp(prev - 0.2, 0.1, 4.0));
    } else {
      setZoom2D((prev) => clamp(prev - 14, 40, 260));
    }
  }

  function handleSceneWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();

    if (!is3DMode) {
      const direction = e.deltaY > 0 ? -1 : 1;
      setZoom2D((prev) => clamp(prev + direction * 14, 10, 260));
      return;
    }

    const direction = e.deltaY > 0 ? 1 : -1;
    const nextLayer = clamp(
      selectedLayer + direction,
      minLayer - 2,
      maxLayer + 2,
    );

    setSelectedLayer(nextLayer);

    if (toolMode === "layerMove" && movingNodeId) {
      setPendingNodeLayer(nextLayer);
    }
  }

  async function handleSendMessage() {
    if (!inputText.trim() || isAiTyping) return;

    const trimmed = inputText.trim();
    const targetParentId = selectedNodeId;

    setInputText("");

    const context = getContextPath(nodes, targetParentId);
    const aiResponse = await sendMessage(
      trimmed,
      context.map((node) => ({
        prompt: node.prompt,
        response: node.response,
      })),
    );

    const newNodeId = `node-${crypto.randomUUID()}`;
    const newNode: MindNode = {
      id: newNodeId,
      prompt: trimmed,
      response: aiResponse,
      children: [],
      parentId: targetParentId,
      timestamp: Date.now(),
      offsetX: 0,
      offsetY: 0,
      layer: selectedLayer,
    };

    setNodes((prev) => {
      const updated = { ...prev, [newNodeId]: newNode };
      updated[targetParentId] = {
        ...updated[targetParentId],
        children: [...updated[targetParentId].children, newNodeId],
      };
      return updated;
    });

    setSelectedNodeId(newNodeId);
  }

  function autoArrange() {
    setNodes((prev) => {
      const updated: NodesMap = {};
      for (const [id, node] of Object.entries(prev)) {
        updated[id] = {
          ...node,
          offsetX: 0,
          offsetY: 0,
        };
      }
      return updated;
    });
  }

  function toggle3DMode() {
    if (!is3DMode) {
      setIs3DMode(true);
      return;
    }

    setIs3DMode(false);

    const visibleIds = getVisibleIdsForPlane(nodes, selectedLayer);
    if (!visibleIds.has(selectedNodeId)) {
      const candidate = Object.values(nodes).find(
        (n) => n.layer === selectedLayer,
      );
      setSelectedNodeId(candidate?.id ?? "root");
    }
  }

  function openPlaneNameDialog(layer: number) {
    if (!is3DMode) return;

    const currentName = planeNames[layer] ?? "";
    setPlaneNameInput(currentName);
    setIsPlaneNameDialogOpen(true);
  }

  function confirmPlaneName() {
    const layer = selectedLayer;
    const next = planeNameInput.trim();

    setPlaneNames((prev) => {
      const updated = { ...prev };

      if (layer === 0) {
        updated[0] = next || "根节点层";
      } else {
        if (next) updated[layer] = next;
        else delete updated[layer];
      }

      return updated;
    });

    setIsPlaneNameDialogOpen(false);
    setPlaneNameInput("");
  }

  function startLayerMove(nodeId: string) {
    const node = nodes[nodeId];
    if (!node || node.id === "root") return;
    if (node.layer !== selectedLayer) return;

    setSelectedNodeId(nodeId);
    setMovingNodeId(nodeId);
    setPendingNodeLayer(node.layer);
  }

  function confirmLayerMove() {
    if (!movingNodeId || pendingNodeLayer === null) return;

    setNodes((prev) => {
      const node = prev[movingNodeId];
      if (!node) return prev;

      return {
        ...prev,
        [movingNodeId]: {
          ...node,
          layer: pendingNodeLayer,
        },
      };
    });

    setMovingNodeId(null);
    setPendingNodeLayer(null);
  }

  const zoom = is3DMode ? zoom3D : zoom2D;

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-[#C9CED6] font-sans text-[#1A1A1A]">
      {/* Background gradient effects */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 35%, rgba(248,250,252,0.68) 0%, rgba(222,227,234,0.88) 34%, rgba(198,204,213,0.96) 70%, rgba(186,192,201,1) 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(60,68,80,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(60,68,80,0.18) 1px, transparent 1px)",
            backgroundSize: "52px 52px",
          }}
        />
        <div
          className="absolute left-[-8%] top-[4%] h-[520px] w-[760px] opacity-[0.18]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(160,170,210,0.22) 0%, rgba(160,170,210,0.10) 30%, rgba(160,170,210,0.03) 55%, transparent 76%)",
            filter: "blur(72px)",
          }}
        />
        <div
          className="absolute bottom-[-12%] right-[-8%] h-[640px] w-[900px] opacity-[0.16]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.34) 0%, rgba(220,224,232,0.18) 32%, rgba(180,186,198,0.08) 56%, transparent 78%)",
            filter: "blur(92px)",
          }}
        />
        <div
          className="absolute bottom-[-10%] left-[10%] h-[320px] w-[80%] opacity-[0.10]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 36%, transparent 72%)",
            filter: "blur(56px)",
          }}
        />
      </div>

      {/* Main area */}
      <div className="relative flex flex-1 flex-col">
        {/* Header */}
        <header className="z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/78 px-8 shadow-[0_8px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          <div className="flex items-center gap-4 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-200 bg-white text-indigo-600 shadow-[0_10px_24px_rgba(99,102,241,0.10)]">
              <BrainCircuit size={20} />
            </div>
            <div>
              <h1 className="text-[17px] font-semibold tracking-[0.01em] text-slate-900">
                智构树语
              </h1>
              <p className="text-[12px] font-medium text-slate-500">
                {is3DMode
                  ? "3D Layered Thinking Space"
                  : "2D Plane Thinking Space"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[12px] text-slate-500 md:block">
              {is3DMode
                ? `3D · z = ${selectedLayer}`
                : `2D · z = ${selectedLayer}`}
            </div>

            <button
              onClick={autoArrange}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
              title="自动整理"
            >
              <RotateCcw size={17} />
            </button>
          </div>
        </header>

        {/* 3D/2D Scene */}
        <div
          className="relative flex-1 overflow-hidden"
          onWheel={handleSceneWheel}
        >
          <TreeScene
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            selectedLayer={selectedLayer}
            displayLayer={displayLayer}
            planeNames={planeNames}
            is3DMode={is3DMode}
            toolMode={toolMode}
            movingNodeId={movingNodeId}
            pendingNodeLayer={pendingNodeLayer}
            zoom2D={zoom2D}
            zoom3D={zoom3D}
            onSelectNode={setSelectedNodeId}
            onStartLayerMove={startLayerMove}
            onSelectLayer={setSelectedLayer}
            onRenameLayer={openPlaneNameDialog}
            onConfirmLayerMove={confirmLayerMove}
          />
        </div>

        {/* Info tooltip */}
        <div className="pointer-events-none absolute bottom-7 left-7 z-20">
          <div className="flex max-w-[430px] items-start gap-3 rounded-2xl border border-white/70 bg-white/86 px-4 py-3.5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <Info className="mt-0.5 shrink-0 text-indigo-500" size={16} />
            <p className="text-[12px] leading-6 text-slate-600">
              3D 模式下节点、连线、玻璃平面都在同一 3D
              坐标系内。滚轮缩放与拖动由场景相机控制；双击平面可命名。再次点击
              3D 按钮可切回当前平面的 2D 浏览。
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <SceneToolbar
          toolMode={toolMode}
          is3DMode={is3DMode}
          selectedLayer={selectedLayer}
          onToolChange={setToolMode}
          onToggle3D={toggle3DMode}
          onAutoArrange={autoArrange}
          onOpenNameDialog={openPlaneNameDialog}
        />

        {/* Zoom controls */}
        <ZoomControls
          zoom={zoom}
          is3DMode={is3DMode}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
      </div>

      {/* Resize handle */}
      <div
        className="z-40 w-1.5 cursor-col-resize bg-slate-200/85 transition-colors hover:bg-indigo-400 active:bg-indigo-600"
        onMouseDown={startResizing}
      />

      {/* Sidebar */}
      <PathSidebar
        currentPath={currentPath}
        selectedNodeId={selectedNodeId}
        selectedLayer={selectedLayer}
        isAiTyping={isAiTyping}
        inputText={inputText}
        sidebarWidth={sidebarWidth}
        onInputChange={setInputText}
        onSend={handleSendMessage}
      />

      {/* Layer name dialog */}
      <LayerNameDialog
        isOpen={isPlaneNameDialogOpen}
        selectedLayer={selectedLayer}
        planeNameInput={planeNameInput}
        onInputChange={setPlaneNameInput}
        onConfirm={confirmPlaneName}
        onCancel={() => {
          setIsPlaneNameDialogOpen(false);
          setPlaneNameInput("");
        }}
      />
    </div>
  );
}
