"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getContextPath } from "@/hooks/useTreeLayout";
import { useAIChat } from "@/hooks/useAIChat";
import { useAuxo } from "@/hooks/useAuxo";
import { compileContext } from "@/src/lib/contextCompiler";
import { compileAuxoInput } from "@/src/lib/auxo";
import { DEEPSEEK_MODEL } from "@/src/lib/deepseek";
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
import { AuxoDialog } from "@/src/components/overlays/AuxoDialog";

const CHAT_MODEL = DEEPSEEK_MODEL;

function App() {
  const state = useTreeState();
  const dispatch = useTreeDispatch();
  const { isAiTyping, isTypingRef, sendMessage, structureNode, stopStreaming } = useAIChat();
  const {
    generatePlan: generateAuxoPlan,
    isGenerating: isAuxoGenerating,
    isGeneratingRef: isAuxoGeneratingRef,
    cancel: cancelAuxo,
  } = useAuxo();

  const activeProject = state.projects[state.activeProjectId];
  const nodes = useMemo(() => activeProject?.nodes ?? {}, [activeProject]);
  const isEmpty = !activeProject;

  const [error, setError] = useState<string | null>(null);
  const [structuringNodeIds, setStructuringNodeIds] = useState<Set<string>>(() => new Set());
  const structuringNodeIdsRef = useRef<Set<string>>(new Set());
  const [renameLayer, setRenameLayer] = useState<number | null>(null);
  const [planeNameInput, setPlaneNameInput] = useState("");
  const [isAuxoOpen, setIsAuxoOpen] = useState(false);
  const [auxoError, setAuxoError] = useState<string | null>(null);

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
  const selectedContextAnchorId = useMemo(() => {
    const selectedNode = nodes[state.selectedNodeId];
    if (!selectedNode) return activeProject?.rootNodeId;
    return selectedNode.kind === "leaf"
      ? selectedNode.parentId ?? activeProject?.rootNodeId
      : selectedNode.id;
  }, [activeProject?.rootNodeId, nodes, state.selectedNodeId]);
  const isSelectedContextStructuring = selectedContextAnchorId
    ? structuringNodeIds.has(selectedContextAnchorId)
    : false;

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

  const finalizeSemanticCard = useCallback(async ({
    projectId,
    nodeId,
    parentId,
    prompt,
    response,
  }: {
    projectId: string;
    nodeId: string;
    parentId: string;
    prompt: string;
    response: string;
  }) => {
    if (!response.trim() || structuringNodeIdsRef.current.has(nodeId)) return;
    structuringNodeIdsRef.current.add(nodeId);
    setStructuringNodeIds((current) => new Set(current).add(nodeId));
    try {
      const semanticCard = await structureNode(prompt, response);
      dispatch({
        type: "SET_NODE_SEMANTICS",
        projectId,
        nodeId,
        expectedParentId: parentId,
        semanticCard,
      });
    } catch (semanticError) {
      console.warn("语义卡片整理失败，已保留完整回答：", semanticError);
    } finally {
      structuringNodeIdsRef.current.delete(nodeId);
      setStructuringNodeIds((current) => {
        const next = new Set(current);
        next.delete(nodeId);
        return next;
      });
    }
  }, [dispatch, structureNode]);

  const handleRetrySemantics = useCallback((nodeId: string) => {
    const s = stateRef.current;
    const project = s.projects[s.activeProjectId];
    const node = project?.nodes[nodeId];
    if (
      !project ||
      !node ||
      node.kind !== "branch" ||
      node.contextState !== "missing" ||
      node.status !== "complete" ||
      !node.parentId ||
      !node.response.trim()
    ) {
      return;
    }
    void finalizeSemanticCard({
      projectId: project.id,
      nodeId,
      parentId: node.parentId,
      prompt: node.prompt,
      response: node.response,
    });
  }, [finalizeSemanticCard]);

  const handleSendMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isTypingRef.current || !activeProject) return;

    setError(null);
    const s = stateRef.current;
    const projectId = s.activeProjectId;
    const project = s.projects[projectId];
    if (!project) return;
    const selectedNode = project.nodes[s.selectedNodeId];
    const selectedAnchorId = selectedNode?.kind === "leaf"
      ? selectedNode.parentId ?? project.rootNodeId
      : selectedNode?.id ?? project.rootNodeId;
    if (structuringNodeIdsRef.current.has(selectedAnchorId)) {
      setError("当前节点的模型上下文正在整理，请稍候再追问。");
      return;
    }
    let streamingNodeId: string | null = null;

    try {
      const compiled = compileContext({
        project,
        selectedNodeId: s.selectedNodeId,
        prompt: prompt.trim(),
        model: CHAT_MODEL,
        compiledAt: Date.now(),
      });
      const targetParentId = compiled.anchorNodeId;
      const nodeId = `node-${crypto.randomUUID()}`;
      streamingNodeId = nodeId;
      const nutrientRefs = [...project.activeNutrientIds];

      dispatch({
        type: "STREAM_BRANCH_START",
        projectId,
        nodeId,
        prompt: prompt.trim(),
        parentId: targetParentId,
        nutrientRefs,
        contextManifest: compiled.manifest,
      });

      const response = await sendMessage(
        compiled.messages,
        (partialResponse) => {
          dispatch({
            type: "STREAM_BRANCH_UPDATE",
            projectId,
            nodeId,
            response: partialResponse,
          });
        },
      );

      dispatch({
        type: "STREAM_BRANCH_FINISH",
        projectId,
        nodeId,
        status: "complete",
      });

      await finalizeSemanticCard({
        projectId,
        nodeId,
        parentId: targetParentId,
        prompt: prompt.trim(),
        response,
      });
    } catch (err) {
      const aborted =
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name?: unknown }).name === "AbortError";

      if (aborted && streamingNodeId) {
        dispatch({
          type: "STREAM_BRANCH_FINISH",
          projectId,
          nodeId: streamingNodeId,
          status: "stopped",
        });
        return;
      }

      const message = err instanceof Error ? err.message : "AI 请求失败，请检查网络连接和 API 配置";
      if (streamingNodeId) {
        dispatch({
          type: "STREAM_BRANCH_FAIL",
          projectId,
          nodeId: streamingNodeId,
          error: message,
        });
      }
      setError(message);
    }
  }, [activeProject, dispatch, finalizeSemanticCard, isTypingRef, sendMessage]);

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

  const handleOpenAuxo = useCallback(() => {
    const currentState = stateRef.current;
    const project = currentState.projects[currentState.activeProjectId];
    const root = project?.nodes[project.rootNodeId];
    if (!project || !root || currentState.selectedNodeId !== root.id) return;
    if (root.children.length > 0) {
      setError("Auxo 仅用于空白根任务。请新建项目，或先撤销/修剪现有分支。");
      return;
    }
    setAuxoError(null);
    setIsAuxoOpen(true);
  }, []);

  const handleCancelAuxo = useCallback(() => {
    if (isAuxoGeneratingRef.current) cancelAuxo();
    setIsAuxoOpen(false);
  }, [cancelAuxo, isAuxoGeneratingRef]);

  const handleGenerateAuxo = useCallback(async () => {
    if (isAuxoGeneratingRef.current) return;
    setAuxoError(null);

    const startingState = stateRef.current;
    const project = startingState.projects[startingState.activeProjectId];
    const root = project?.nodes[project.rootNodeId];
    if (!project || !root || startingState.selectedNodeId !== root.id) {
      setAuxoError("请先选中当前项目的根节点。");
      return;
    }
    if (root.children.length > 0) {
      setAuxoError("根节点已有内容。为防止重复或覆盖，Auxo 本次不会创建节点。");
      return;
    }

    try {
      const input = compileAuxoInput(project);
      const plan = await generateAuxoPlan(input.request);

      const latestState = stateRef.current;
      const latestProject = latestState.projects[project.id];
      const latestRoot = latestProject?.nodes[root.id];
      if (!latestProject || !latestRoot || latestProject.rootNodeId !== root.id) {
        throw new Error("请求期间目标项目已被删除或根节点已变化，本次没有创建节点。");
      }
      if (latestRoot.children.length > 0) {
        throw new Error("请求期间根节点已产生新内容，本次没有合并 Auxo 计划。");
      }
      const latestInput = compileAuxoInput(latestProject);
      if (latestInput.inputFingerprint !== input.inputFingerprint) {
        throw new Error("请求期间根任务或启用资料发生变化，请重新运行 Auxo。");
      }

      dispatch({
        type: "APPLY_AUXO_PLAN",
        projectId: project.id,
        rootNodeId: root.id,
        generationId: `auxo-run-${crypto.randomUUID()}`,
        inputFingerprint: input.inputFingerprint,
        nutrientRefs: input.nutrientRefs,
        plan,
      });
      setIsAuxoOpen(false);
    } catch (auxoFailure) {
      const message = auxoFailure instanceof Error
        ? auxoFailure.message
        : "Auxo 生成失败，本次没有创建任何节点。";
      setAuxoError(message);
    }
  }, [dispatch, generateAuxoPlan, isAuxoGeneratingRef]);

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
            onOpenNodeRings={(nodeId) => dispatch({ type: "OPEN_NODE_RINGS", nodeId })}
          />

          <TreeToolbar
            onOpenAuxo={handleOpenAuxo}
            isAuxoGenerating={isAuxoGenerating}
          />

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
          isAiTyping={isAiTyping}
          isContextPreparing={isSelectedContextStructuring}
          onStop={stopStreaming}
        />
      </div>

      <InspectorSidebar
        currentPath={currentPath}
        onRetrySemantics={handleRetrySemantics}
        structuringNodeIds={structuringNodeIds}
      />

      <SearchPalette />
      <RingsPanel />
      {isAuxoOpen && activeProject && (
        <AuxoDialog
          rootTask={activeProject.nodes[activeProject.rootNodeId]?.prompt ?? activeProject.name}
          nutrients={activeProject.activeNutrientIds.flatMap((nutrientId) => {
            const nutrient = activeProject.nutrients[nutrientId];
            return nutrient
              ? [{
                  id: nutrient.id,
                  name: nutrient.name,
                  extractedCharCount: nutrient.extractedCharCount,
                }]
              : [];
          })}
          isGenerating={isAuxoGenerating}
          error={auxoError}
          onGenerate={handleGenerateAuxo}
          onCancel={handleCancelAuxo}
        />
      )}
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
