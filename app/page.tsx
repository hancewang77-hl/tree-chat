"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getContextPath } from "@/hooks/useTreeLayout";
import { useAIChat } from "@/hooks/useAIChat";
import { clamp } from "@/src/lib/utils";
import { TreeProvider, useTreeState, useTreeDispatch } from "@/src/state/TreeContext";
import { TreeScene } from "@/src/components/scene/TreeScene";
import { AppHeader } from "@/src/components/layout/AppHeader";
import { ForestSidebar } from "@/src/components/layout/ForestSidebar";
import { InspectorSidebar } from "@/src/components/layout/InspectorSidebar";
import { BottomComposer } from "@/src/components/layout/BottomComposer";
import { TreeToolbar } from "@/src/components/toolbar/TreeToolbar";
import { ZoomControls } from "@/src/components/toolbar/ZoomControls";
import { EmptyState } from "@/src/components/overlays/EmptyState";
import { SearchPalette } from "@/src/components/overlays/SearchPalette";
import { CanopyMinimap } from "@/src/components/overlays/CanopyMinimap";
import { RingsPanel } from "@/src/components/overlays/RingsPanel";
import { LayerNameDialog } from "@/src/components/LayerNameDialog";

function App() {
  const state = useTreeState();
  const dispatch = useTreeDispatch();
  const { isAiTyping, sendMessage } = useAIChat();

  const activeProject = state.projects[state.activeProjectId];
  const nodes = useMemo(() => activeProject?.nodes ?? {}, [activeProject]);
  const isEmpty = !activeProject;

  const [error, setError] = useState<string | null>(null);
  const [renameLayer, setRenameLayer] = useState<number | null>(null);
  const [planeNameInput, setPlaneNameInput] = useState("");

  // Refs for latest values used in callbacks — avoids stale closures
  const nodesRef = useRef(nodes);
  const stateRef = useRef(state);
  useEffect(() => { nodesRef.current = nodes; });
  useEffect(() => { stateRef.current = state; });

  // Animate displayLayer toward selectedLayer
  const [displayLayer, setDisplayLayer] = useState(state.selectedLayer);

  useEffect(() => {
    let frame = 0;
    function animate() {
      setDisplayLayer((prev) => {
        const next = prev + (state.selectedLayer - prev) * 0.14;
        if (Math.abs(next - state.selectedLayer) < 0.001) return state.selectedLayer;
        return next;
      });
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [state.selectedLayer]);

  // Auto-select a node on the current layer when in layerMove + 3D mode
  useEffect(() => {
    if (!state.is3DMode || state.toolMode !== "layerMove" || state.movingNodeId !== null) return;

    const selectedNode = nodes[state.selectedNodeId];
    if (!selectedNode) return;
    if (selectedNode.layer === state.selectedLayer) return;

    const candidates = Object.values(nodes).filter((n) => n.layer === state.selectedLayer);
    if (candidates.length === 0) {
      dispatch({ type: "SELECT_NODE", nodeId: activeProject?.rootNodeId ?? "root" });
      return;
    }

    const best = candidates.reduce((bestNode, currentNode) => {
      const bestDepth = getContextPath(nodes, bestNode.id).length;
      const currentDepth = getContextPath(nodes, currentNode.id).length;
      if (currentDepth < bestDepth) return currentNode;
      if (currentDepth > bestDepth) return bestNode;
      return currentNode.timestamp < bestNode.timestamp ? currentNode : bestNode;
    });

    if (best.id !== state.selectedNodeId) {
      dispatch({ type: "SELECT_NODE", nodeId: best.id });
    }
  }, [state.is3DMode, state.toolMode, state.movingNodeId, state.selectedLayer, state.selectedNodeId, nodes, activeProject?.rootNodeId, dispatch]);

  const currentPath = useMemo(
    () => getContextPath(nodes, state.selectedNodeId),
    [nodes, state.selectedNodeId],
  );

  const handleZoomIn = useCallback(() => {
    if (stateRef.current.is3DMode) {
      dispatch({ type: "SET_ZOOM", zoom3D: clamp(stateRef.current.zoom3D + 0.2, 0.1, 4.0) });
    } else {
      dispatch({ type: "SET_ZOOM", zoom2D: clamp(stateRef.current.zoom2D + 14, 10, 260) });
    }
  }, [dispatch]);

  const handleZoomOut = useCallback(() => {
    if (stateRef.current.is3DMode) {
      dispatch({ type: "SET_ZOOM", zoom3D: clamp(stateRef.current.zoom3D - 0.2, 0.1, 4.0) });
    } else {
      dispatch({ type: "SET_ZOOM", zoom2D: clamp(stateRef.current.zoom2D - 14, 10, 260) });
    }
  }, [dispatch]);

  const handleSceneWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const s = stateRef.current;
    if (!s.is3DMode) {
      const direction = e.deltaY > 0 ? -1 : 1;
      dispatch({ type: "SET_ZOOM", zoom2D: clamp(s.zoom2D + direction * 14, 10, 260) });
      return;
    }
    const direction = e.deltaY > 0 ? 1 : -1;
    const allLayers = Object.values(nodesRef.current).map((n) => n.layer);
    const minL = Math.min(...allLayers, s.selectedLayer, 0);
    const maxL = Math.max(...allLayers, s.selectedLayer, 0);
    const nextLayer = clamp(s.selectedLayer + direction, minL - 2, maxL + 2);
    dispatch({ type: "SET_LAYER", layer: nextLayer });
  }, [dispatch]);

  const handleSendMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isAiTyping || !activeProject) return;

    setError(null);
    const s = stateRef.current;
    const n = nodesRef.current;
    const targetParentId = s.selectedNodeId;
    const projectId = s.activeProjectId;
    const context = getContextPath(n, targetParentId);

    try {
      const aiResponse = await sendMessage(
        prompt.trim(),
        context.map((node) => ({ prompt: node.prompt, response: node.response })),
      );

      if (stateRef.current.activeProjectId !== projectId) return;

      dispatch({
        type: "BRANCH",
        prompt: prompt.trim(),
        response: aiResponse,
        parentId: targetParentId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI 请求失败，请检查网络连接和 API 配置";
      setError(message);
    }
  }, [isAiTyping, activeProject, sendMessage, dispatch]);

  const handleAddLeaf = useCallback((content: string) => {
    if (!content.trim() || !activeProject) return;
    const s = stateRef.current;
    dispatch({ type: "LEAF", content: content.trim(), parentId: s.selectedNodeId });
  }, [activeProject, dispatch]);

  const handleStartLayerMove = useCallback((nodeId: string) => {
    const n = nodesRef.current;
    const s = stateRef.current;
    const node = n[nodeId];
    if (!node || node.id === "root") return;
    if (node.layer !== s.selectedLayer) return;
    dispatch({ type: "SELECT_NODE", nodeId });
    dispatch({ type: "SET_NODE_OFFSET", nodeId, offsetX: node.offsetX ?? 0, offsetY: node.offsetY ?? 0 });
  }, [dispatch]);

  const handleSelectNode = useCallback((id: string) => {
    const s = stateRef.current;
    if (s.toolMode === "graft" && s.graftSourceId) {
      dispatch({ type: "GRAFT_CONFIRM", newParentId: id });
    } else {
      dispatch({ type: "SELECT_NODE", nodeId: id });
    }
  }, [dispatch]);

  const zoom = state.is3DMode ? state.zoom3D : state.zoom2D;

  if (isEmpty) {
    return <EmptyState />;
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden font-sans">
      <ForestSidebar />

      {/* Main area */}
      <div className="relative flex flex-1 flex-col min-w-0">
        {error && (
          <div
            className="absolute top-3 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-[13px] font-medium shadow-lg animate-fade-up"
            style={{ background: "rgba(180, 60, 40, 0.92)", color: "#FFF", backdropFilter: "blur(8px)" }}
          >
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-3 text-white/70 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
        <AppHeader />

        {/* Scene */}
        <div className="relative flex-1 overflow-hidden" onWheel={handleSceneWheel}>
          <TreeScene
            nodes={nodes}
            selectedNodeId={state.selectedNodeId}
            selectedLayer={state.selectedLayer}
            displayLayer={displayLayer}
            planeNames={state.planeNames}
            is3DMode={state.is3DMode}
            toolMode={state.toolMode}
            movingNodeId={state.movingNodeId}
            pendingNodeLayer={state.pendingNodeLayer}
            zoom2D={state.zoom2D}
            zoom3D={state.zoom3D}
            onSelectNode={handleSelectNode}
            onStartLayerMove={handleStartLayerMove}
            onSelectLayer={(layer) => dispatch({ type: "SET_LAYER", layer })}
            onRenameLayer={(layer) => {
              setRenameLayer(layer);
              setPlaneNameInput(state.planeNames[layer] ?? "");
            }}
            onConfirmLayerMove={() => {}}
          />

          <TreeToolbar />

          <ZoomControls
            zoom={zoom}
            is3DMode={state.is3DMode}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
          />

          {state.isCanopyOpen && <CanopyMinimap />}
        </div>

        <BottomComposer
          key="composer"
          onSend={handleSendMessage}
          onAddLeaf={handleAddLeaf}
        />
      </div>

      <InspectorSidebar currentPath={currentPath} />

      <SearchPalette />
      <RingsPanel />
      {renameLayer !== null && (
        <LayerNameDialog
          isOpen={true}
          selectedLayer={renameLayer}
          planeNameInput={planeNameInput}
          onInputChange={setPlaneNameInput}
          onConfirm={() => {
            dispatch({ type: "RENAME_PLANE", layer: renameLayer, name: planeNameInput.trim() });
            setRenameLayer(null);
          }}
          onCancel={() => setRenameLayer(null)}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <TreeProvider>
      <App />
    </TreeProvider>
  );
}
