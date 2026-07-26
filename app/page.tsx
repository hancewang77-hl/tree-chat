"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getContextPath } from "@/hooks/useTreeLayout";
import { useAIChat } from "@/hooks/useAIChat";
import { useAuxo } from "@/hooks/useAuxo";
import { compileContext } from "@/src/lib/contextCompiler";
import { compileAuxoInput, type AuxoInputBundle } from "@/src/lib/auxo";
import type { AuxoPlan, MindNode, NodesMap, TreeState } from "@/src/types/tree";
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

// ———— Pure helpers (no React state) ————

// Context anchor: leaves never anchor context themselves — they delegate to
// their parent (falling back to the root). Branch/root nodes anchor directly.
function resolveContextAnchorId<T extends string | undefined>(
  node: MindNode | undefined,
  rootNodeId: T,
): string | T {
  if (!node) return rootNodeId;
  return node.kind === "leaf" ? node.parentId ?? rootNodeId : node.id;
}

// 3D wheel layer switching: may overshoot the occupied layer range by up to
// 2 layers in each direction (layer 0 always counts as occupied).
function wheelTargetLayer(nodes: NodesMap, currentLayer: number, direction: number): number {
  const allLayers = Object.values(nodes).map((n) => n.layer);
  const minL = Math.min(...allLayers, currentLayer, 0);
  const maxL = Math.max(...allLayers, currentLayer, 0);
  return clamp(currentLayer + direction, minL - 2, maxL + 2);
}

// Representative node for a layer: shallowest context path wins; ties break
// to the earliest timestamp.
function pickLayerRepresentative(nodes: NodesMap, candidates: MindNode[]): MindNode {
  return candidates.reduce((bestNode, currentNode) => {
    const bestDepth = getContextPath(nodes, bestNode.id).length;
    const currentDepth = getContextPath(nodes, currentNode.id).length;
    if (currentDepth < bestDepth) return currentNode;
    if (currentDepth > bestDepth) return bestNode;
    return currentNode.timestamp < bestNode.timestamp ? currentNode : bestNode;
  });
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

type AuxoRootDrift = "missing-root" | "root-not-empty" | "fingerprint-changed";

// Shared by the double Auxo validation (once when the plan request returns,
// once again right before the confirmed write). Any drift aborts the merge
// with zero writes: the project/root was deleted or replaced, the root grew
// children during the request, or the root task + enabled nutrients no longer
// match the fingerprint the plan was generated from. Checks run in this
// order; the fingerprint is only compiled once the root is known to exist.
function detectAuxoRootDrift(
  state: TreeState,
  projectId: string,
  rootNodeId: string,
  inputFingerprint: string,
): AuxoRootDrift | null {
  const latestProject = state.projects[projectId];
  const latestRoot = latestProject?.nodes[rootNodeId];
  if (!latestProject || !latestRoot || latestProject.rootNodeId !== rootNodeId) {
    return "missing-root";
  }
  if (latestRoot.children.length > 0) return "root-not-empty";
  if (compileAuxoInput(latestProject).inputFingerprint !== inputFingerprint) {
    return "fingerprint-changed";
  }
  return null;
}

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
  const [auxoPreview, setAuxoPreview] = useState<{
    plan: AuxoPlan;
    request: AuxoInputBundle;
    rootNodeId: string;
    projectId: string;
  } | null>(null);

  // Ref mirrors of the latest state/nodes, refreshed after every commit.
  // Stable useCallback handlers and long-running async flows (streaming,
  // Auxo) read these instead of captured values, so code after an await
  // always observes the post-dispatch tree rather than a stale closure.
  const nodesRef = useRef(nodes);
  const stateRef = useRef(state);
  useEffect(() => { nodesRef.current = nodes; });
  useEffect(() => { stateRef.current = state; });

  // ———— Layer animation ————

  // Animate displayLayer toward selectedLayer: eased each rAF frame
  // (factor 0.14) and snapped once within 0.001 to end the loop.
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

    const best = pickLayerRepresentative(nodes, candidates);

    if (best.id !== state.selectedNodeId) {
      dispatch({ type: "SELECT_NODE", nodeId: best.id });
    }
  }, [state.is3DMode, state.toolMode, state.movingNodeId, state.selectedLayer, state.selectedNodeId, nodes, activeProject?.rootNodeId, dispatch]);

  const currentPath = useMemo(
    () => getContextPath(nodes, state.selectedNodeId),
    [nodes, state.selectedNodeId],
  );
  const selectedContextAnchorId = useMemo(
    () => resolveContextAnchorId(nodes[state.selectedNodeId], activeProject?.rootNodeId),
    [activeProject?.rootNodeId, nodes, state.selectedNodeId],
  );
  const isSelectedContextStructuring = selectedContextAnchorId
    ? structuringNodeIds.has(selectedContextAnchorId)
    : false;

  // ———— Zoom & wheel ————

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

  // 2D: wheel zooms. 3D: wheel scrolls layers instead.
  const handleSceneWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const s = stateRef.current;
    if (!s.is3DMode) {
      const direction = e.deltaY > 0 ? -1 : 1;
      dispatch({ type: "SET_ZOOM", zoom2D: clamp(s.zoom2D + direction * 14, 10, 260) });
      return;
    }
    const direction = e.deltaY > 0 ? 1 : -1;
    dispatch({ type: "SET_LAYER", layer: wheelTargetLayer(nodesRef.current, s.selectedLayer, direction) });
  }, [dispatch]);

  // ———— Branch flow (streaming answer + semantic card) ————

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
    const selectedAnchorId = resolveContextAnchorId(project.nodes[s.selectedNodeId], project.rootNodeId);
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
      if (isAbortError(err) && streamingNodeId) {
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

  // ———— Node selection & layer move ————

  // Arms (or re-arms) a cross-layer move: the wheel then picks the target
  // layer (SET_LAYER mirrors it into pendingNodeLayer) and the node's ✓
  // button commits via LAYER_MOVE_CONFIRM. Reducer guards root/leaf again.
  const handleStartLayerMove = useCallback((nodeId: string) => {
    const node = nodesRef.current[nodeId];
    if (!node || node.kind === "root" || node.kind === "leaf") return;
    dispatch({ type: "LAYER_MOVE_START", nodeId });
  }, [dispatch]);

  const handleConfirmLayerMove = useCallback(() => {
    dispatch({ type: "LAYER_MOVE_CONFIRM" });
  }, [dispatch]);

  const handleSelectNode = useCallback((id: string) => {
    const s = stateRef.current;
    if (s.toolMode === "graft" && s.graftSourceId) {
      dispatch({ type: "GRAFT_CONFIRM", newParentId: id });
    } else {
      dispatch({ type: "SELECT_NODE", nodeId: id });
    }
  }, [dispatch]);

  // ———— Auxo choreography ————
  // Auxo only ever targets an empty root. Guards run at every step — dialog
  // open, request start, after the plan returns, and on confirmed write; the
  // latter two share detectAuxoRootDrift (the double fingerprint check).

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
    setAuxoPreview(null);
    setIsAuxoOpen(true);
  }, []);

  const handleCancelAuxo = useCallback(() => {
    if (isAuxoGeneratingRef.current) cancelAuxo();
    setIsAuxoOpen(false);
    setAuxoPreview(null);
  }, [cancelAuxo, isAuxoGeneratingRef]);

  const handleDiscardAuxoPreview = useCallback(() => {
    setAuxoPreview(null);
    setAuxoError(null);
  }, []);

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

      // 第一重校验：计划基于请求时的快照生成，返回后必须对照最新 state。
      const drift = detectAuxoRootDrift(stateRef.current, project.id, root.id, input.inputFingerprint);
      if (drift === "missing-root") {
        throw new Error("请求期间目标项目已被删除或根节点已变化，本次没有创建节点。");
      }
      if (drift === "root-not-empty") {
        throw new Error("请求期间根节点已产生新内容，本次没有合并 Auxo 计划。");
      }
      if (drift === "fingerprint-changed") {
        throw new Error("请求期间根任务或启用资料发生变化，请重新运行 Auxo。");
      }

      setAuxoPreview({ plan, request: input, rootNodeId: root.id, projectId: project.id });
    } catch (auxoFailure) {
      const message = auxoFailure instanceof Error
        ? auxoFailure.message
        : "Auxo 生成失败，本次没有创建任何节点。";
      setAuxoError(message);
    }
  }, [generateAuxoPlan, isAuxoGeneratingRef]);

  const handleConfirmAuxoPlan = useCallback(() => {
    const preview = auxoPreview;
    if (!preview) return;

    // 第二重校验：预览停留期间树可能继续变化，写入前需再验一次指纹。
    const drift = detectAuxoRootDrift(
      stateRef.current,
      preview.projectId,
      preview.rootNodeId,
      preview.request.inputFingerprint,
    );
    if (drift) {
      setAuxoError(
        drift === "missing-root"
          ? "目标项目已被删除或根节点已变化，本次没有创建节点。"
          : drift === "root-not-empty"
            ? "根节点已产生新内容，本次没有合并 Auxo 计划。"
            : "根任务或启用资料发生变化，请重新运行 Auxo。",
      );
      setAuxoPreview(null);
      return;
    }

    dispatch({
      type: "APPLY_AUXO_PLAN",
      projectId: preview.projectId,
      rootNodeId: preview.rootNodeId,
      generationId: `auxo-run-${crypto.randomUUID()}`,
      inputFingerprint: preview.request.inputFingerprint,
      nutrientRefs: preview.request.nutrientRefs,
      plan: preview.plan,
    });
    setAuxoPreview(null);
    setIsAuxoOpen(false);
  }, [auxoPreview, dispatch]);

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
            onConfirmLayerMove={handleConfirmLayerMove}
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
          plan={auxoPreview?.plan}
          onGenerate={handleGenerateAuxo}
          onConfirm={handleConfirmAuxoPlan}
          onDiscard={handleDiscardAuxoPreview}
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
