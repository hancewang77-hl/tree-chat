"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getContextPath, canAttachLeaf } from "@/hooks/useTreeLayout";
import { useAIChat } from "@/hooks/useAIChat";
import { useAuxo } from "@/hooks/useAuxo";
import {
  getBranchTopology,
  type BranchTopology,
} from "@/src/lib/branchTopology";
import { compileAuxoInput, type AuxoInputBundle } from "@/src/lib/auxo";
import { submitTreeChatAction } from "@/src/product/productAction";
import type { AuxoPlan, TreeState } from "@/src/types/tree";
import { TreeProvider, useTreeState, useTreeDispatch } from "@/src/state/TreeContext";
import { TreeScene } from "@/src/components/scene/TreeScene";
import { AppHeader } from "@/src/components/layout/AppHeader";
import { ForestSidebar } from "@/src/components/layout/ForestSidebar";
import { InspectorSidebar } from "@/src/components/layout/InspectorSidebar";
import { BottomComposer } from "@/src/components/layout/BottomComposer";
import { TreeToolbar } from "@/src/components/toolbar/TreeToolbar";
import { EmptyState } from "@/src/components/overlays/EmptyState";
import { SearchPalette } from "@/src/components/overlays/SearchPalette";
import { CanopyMinimap } from "@/src/components/overlays/CanopyMinimap";
import { RingsPanel } from "@/src/components/overlays/RingsPanel";
import { LayerNameDialog } from "@/src/components/LayerNameDialog";
import { LeafNameDialog } from "@/src/components/overlays/LeafNameDialog";
import { AuxoDialog } from "@/src/components/overlays/AuxoDialog";
import { TASK_PRIORITY } from "@/src/runtime/task";

const CHAT_MODEL = "deepseek-chat";

type AuxoRootDrift = "missing-root" | "root-not-empty" | "fingerprint-changed";

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
  const {
    activeChatNodeIds,
    tasks,
    sendMessage,
    retryMessage,
    structureNode,
    stopStreaming,
  } = useAIChat();
  const {
    generatePlan: generateAuxoPlan,
    isGenerating: isAuxoGenerating,
    isGeneratingRef: isAuxoGeneratingRef,
    cancel: cancelAuxo,
  } = useAuxo();

  const activeProject = state.projects[state.activeProjectId];
  const nodes = useMemo(() => activeProject?.nodes ?? {}, [activeProject]);
  const isEmpty = !activeProject;
  const retryableAnswerNodeIds = useMemo(
    () =>
      new Set(
        Object.values(tasks)
          .filter(
            (task) =>
              task.session_id === activeProject?.id &&
              task.task_type === "chat_generation" &&
              (task.state === "failed" || task.state === "cancelled"),
          )
          .map((task) => task.node_id),
      ),
    [activeProject?.id, tasks],
  );

  const [error, setError] = useState<string | null>(null);
  const [structuringNodeIds, setStructuringNodeIds] = useState<Set<string>>(() => new Set());
  const structuringNodeIdsRef = useRef<Set<string>>(new Set());
  const [renameLayer, setRenameLayer] = useState<number | null>(null);
  const [planeNameInput, setPlaneNameInput] = useState("");
  const [leafNameDialogOpen, setLeafNameDialogOpen] = useState(false);
  const [leafNameInput, setLeafNameInput] = useState("");
  const [pendingLeafName, setPendingLeafName] = useState<string | null>(null);
  const [isAuxoOpen, setIsAuxoOpen] = useState(false);
  const [auxoError, setAuxoError] = useState<string | null>(null);
  const [auxoPreview, setAuxoPreview] = useState<{
    plan: AuxoPlan;
    request: AuxoInputBundle;
    rootNodeId: string;
    projectId: string;
  } | null>(null);

  // Ref for latest state used in callbacks — avoids stale closures
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

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

  const finalizeSemanticCard = useCallback(async ({
    projectId,
    nodeId,
    parentId,
    prompt,
    response,
    topology,
  }: {
    projectId: string;
    nodeId: string;
    parentId: string;
    prompt: string;
    response: string;
    topology: BranchTopology;
  }) => {
    if (!response.trim() || structuringNodeIdsRef.current.has(nodeId)) return;
    structuringNodeIdsRef.current.add(nodeId);
    setStructuringNodeIds((current) => new Set(current).add(nodeId));
    try {
      const semanticCard = await structureNode({
        sessionId: projectId,
        nodeId,
        priority: TASK_PRIORITY.Background,
        prompt,
        response,
        topology,
      });
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
      topology: getBranchTopology(project.nodes, project.rootNodeId, nodeId),
    });
  }, [finalizeSemanticCard]);

  const handleSendMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim() || !activeProject) return;

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
    try {
      const result = await submitTreeChatAction({
        treeState: s,
        prompt,
        model: CHAT_MODEL,
        priority: TASK_PRIORITY.ForegroundInteractive,
        dispatch,
        sendChat: sendMessage,
      });
      if (result.status === "stopped") return;
      const { prepared, response } = result;
      await finalizeSemanticCard({
        projectId: prepared.projectId,
        nodeId: prepared.nodeId,
        parentId: prepared.parentNodeId,
        prompt: prepared.prompt,
        response,
        topology: prepared.topology,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI 请求失败，请检查网络连接和 API 配置";
      setError(message);
    }
  }, [activeProject, dispatch, finalizeSemanticCard, sendMessage]);

  const handleRetryAnswer = useCallback(async (nodeId: string) => {
    const s = stateRef.current;
    const project = s.projects[s.activeProjectId];
    const node = project?.nodes[nodeId];
    if (!project || !node || node.kind !== "branch" || !node.parentId) return;
    const sourceTask = Object.values(tasks)
      .filter(
        (task) =>
          task.session_id === project.id &&
          task.node_id === nodeId &&
          task.task_type === "chat_generation" &&
          (task.state === "failed" || task.state === "cancelled"),
      )
      .sort((left, right) => right.attempt - left.attempt || right.created_at - left.created_at)[0];
    if (!sourceTask) {
      setError("当前浏览器会话中找不到可重试的服务器 Task");
      return;
    }

    setError(null);
    dispatch({
      type: "STREAM_BRANCH_UPDATE",
      projectId: project.id,
      nodeId,
      response: "",
    });
    try {
      const response = await retryMessage({
        taskId: sourceTask.task_id,
        onText: (partialResponse) => {
          dispatch({
            type: "STREAM_BRANCH_UPDATE",
            projectId: project.id,
            nodeId,
            response: partialResponse,
          });
        },
      });
      dispatch({
        type: "STREAM_BRANCH_FINISH",
        projectId: project.id,
        nodeId,
        status: "complete",
      });
      await finalizeSemanticCard({
        projectId: project.id,
        nodeId,
        parentId: node.parentId,
        prompt: node.prompt,
        response,
        topology: getBranchTopology(project.nodes, project.rootNodeId, nodeId),
      });
    } catch (retryError) {
      const aborted =
        typeof retryError === "object" &&
        retryError !== null &&
        "name" in retryError &&
        (retryError as { name?: unknown }).name === "AbortError";
      if (aborted) {
        dispatch({
          type: "STREAM_BRANCH_FINISH",
          projectId: project.id,
          nodeId,
          status: "stopped",
        });
        return;
      }
      const message = retryError instanceof Error
        ? retryError.message
        : "服务器重试失败";
      dispatch({
        type: "STREAM_BRANCH_FAIL",
        projectId: project.id,
        nodeId,
        error: message,
      });
      setError(message);
    }
  }, [dispatch, finalizeSemanticCard, retryMessage, tasks]);

  const handleAddLeaf = useCallback((name: string, content: string) => {
    const leafName = name.trim();
    const leafContent = content.trim();
    if (!leafName || !leafContent || !activeProject) return;
    const s = stateRef.current;
    dispatch({
      type: "LEAF",
      name: leafName,
      content: leafContent,
      parentId: s.selectedNodeId,
    });
    setPendingLeafName(null);
  }, [activeProject, dispatch]);

  const handleRequestLeafName = useCallback(() => {
    const s = stateRef.current;
    const project = s.projects[s.activeProjectId];
    if (!project) return;
    if (!canAttachLeaf(project.nodes, s.selectedNodeId)) {
      setError("每个节点最多只能挂载 3 片叶子");
      return;
    }
    setLeafNameInput("");
    setLeafNameDialogOpen(true);
  }, []);

  const handleConfirmLeafName = useCallback(() => {
    const nextName = leafNameInput.trim();
    if (!nextName) return;
    setPendingLeafName(nextName);
    setLeafNameDialogOpen(false);
    window.dispatchEvent(new CustomEvent("composer-mode", { detail: "note" }));
    window.dispatchEvent(new CustomEvent("composer-focus"));
  }, [leafNameInput]);

  useEffect(() => {
    const handleLeafNameRequest = () => handleRequestLeafName();
    window.addEventListener("leaf-name-request", handleLeafNameRequest);
    return () => window.removeEventListener("leaf-name-request", handleLeafNameRequest);
  }, [handleRequestLeafName]);

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
      const plan = await generateAuxoPlan({
        sessionId: project.id,
        rootNodeId: root.id,
        request: input.request,
      });
      const drift = detectAuxoRootDrift(
        stateRef.current,
        project.id,
        root.id,
        input.inputFingerprint,
      );
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
      setAuxoError(
        auxoFailure instanceof Error
          ? auxoFailure.message
          : "Auxo 生成失败，本次没有创建任何节点。",
      );
    }
  }, [generateAuxoPlan, isAuxoGeneratingRef]);

  const handleConfirmAuxoPlan = useCallback(() => {
    const preview = auxoPreview;
    if (!preview) return;

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

  const handleSelectNode = useCallback((id: string) => {
    const s = stateRef.current;
    if (s.toolMode === "graft" && s.graftSourceId) {
      dispatch({ type: "GRAFT_CONFIRM", newParentId: id });
    } else {
      dispatch({ type: "SELECT_NODE", nodeId: id });
    }
  }, [dispatch]);

  const canCreateLeaf = activeProject
    ? canAttachLeaf(nodes, state.selectedNodeId)
    : false;

  if (isEmpty) {
    return <EmptyState />;
  }

  return (
    <div className="workbench-shell relative flex h-screen w-full overflow-hidden font-sans">
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
        <div className="relative flex-1 overflow-hidden">
          <TreeScene
            nodes={nodes}
            selectedNodeId={state.selectedNodeId}
            selectedLayer={state.selectedLayer}
            toolMode={state.toolMode}
            movingNodeId={state.movingNodeId}
            pendingNodeLayer={state.pendingNodeLayer}
            zoom2D={state.zoom2D}
            onSelectNode={handleSelectNode}
            onConfirmLayerMove={() => {}}
            onOpenNodeRings={(nodeId) => dispatch({ type: "OPEN_NODE_RINGS", nodeId })}
          />

          <TreeToolbar
            onOpenAuxo={handleOpenAuxo}
            isAuxoGenerating={isAuxoGenerating}
          />

          {state.isCanopyOpen && <CanopyMinimap />}
        </div>

        <BottomComposer
          key="composer"
          onSend={handleSendMessage}
          onAddLeaf={handleAddLeaf}
          pendingLeafName={pendingLeafName}
          onRequestLeafName={handleRequestLeafName}
          onCancelLeafDraft={() => setPendingLeafName(null)}
          canCreateLeaf={canCreateLeaf}
          isAiTyping={activeChatNodeIds.has(state.selectedNodeId)}
          isContextPreparing={isSelectedContextStructuring}
          onStop={() => {
            void stopStreaming(state.selectedNodeId).catch((stopError) => {
              setError(stopError instanceof Error ? stopError.message : "服务器取消失败");
            });
          }}
        />
      </div>

      <InspectorSidebar
        currentPath={currentPath}
        onRetryAnswer={(nodeId) => void handleRetryAnswer(nodeId)}
        onRetrySemantics={handleRetrySemantics}
        retryableAnswerNodeIds={retryableAnswerNodeIds}
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
      <LeafNameDialog
        isOpen={leafNameDialogOpen}
        name={leafNameInput}
        onNameChange={setLeafNameInput}
        onConfirm={handleConfirmLeafName}
        onCancel={() => setLeafNameDialogOpen(false)}
      />
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
