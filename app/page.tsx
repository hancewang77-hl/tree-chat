"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Text,
} from "@react-three/drei";
import {
  BrainCircuit,
  GitBranch,
  Plus,
  Minus,
  Send,
  Maximize,
  Sparkles,
  Info,
  Move,
  RotateCcw,
  ScanSearch,
} from "lucide-react";
import * as THREE from "three";
import {
  type MindNode,
  type NodesMap,
  NODE_W,
  NODE_H,
  LAYER_SPACING,
  getContextPath,
  getVisibleIdsForPlane,
  useTreeLayout,
} from "@/hooks/useTreeLayout";
import { useAIChat } from "@/hooks/useAIChat";
import { useResizableSidebar } from "@/hooks/useResizableSidebar";

type ToolMode = "view" | "node" | "layerMove";

const initialNodes: NodesMap = {
  root: {
    id: "root",
    prompt: "如何构建一个适合理工科教育的下一代AI交互平台？",
    response: `这是一个非常前沿的课题。“智构树语”的核心在于打破线性对话。
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
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function truncateText(text: string, max = 84) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const noRaycast = () => null;
function CameraModeRig({
  is3DMode,
  selectedLayer,
  zoom2D,
  zoom3D,
}: {
  is3DMode: boolean;
  selectedLayer: number;
  zoom2D: number;
  zoom3D: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (is3DMode && camera instanceof THREE.PerspectiveCamera) {
      camera.position.set(-12, 12, 18);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, selectedLayer * LAYER_SPACING);
      camera.zoom = zoom3D;
      camera.updateProjectionMatrix();
    }

    if (!is3DMode && camera instanceof THREE.OrthographicCamera) {
      camera.position.set(0, 0, 40);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, selectedLayer * LAYER_SPACING);
      camera.zoom = zoom2D;
      camera.updateProjectionMatrix();
    }
  }, [camera, is3DMode, selectedLayer, zoom2D, zoom3D]);

  return null;
}
function ToolCircle({
  active,
  icon,
  label,
  title,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`group flex min-w-[72px] flex-col items-center gap-1 rounded-2xl px-3 py-2 transition-all ${
        active
          ? "bg-indigo-600 text-white shadow-[0_10px_24px_rgba(99,102,241,0.28)]"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      <div className="flex h-8 w-8 items-center justify-center">{icon}</div>
      <span className="text-[11px] font-medium tracking-[0.02em]">{label}</span>
    </button>
  );
}

function CardTexture({
  prompt,
  response,
  selected,
  inPath,
  layer,
  interactive,
  priority,
}: {
  prompt: string;
  response: string;
  selected: boolean;
  inPath: boolean;
  layer: number;
  interactive: boolean;
  priority: boolean;
}) {
  const texture = useMemo(() => {
    const width = 1024;
    const height = 520;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // background
    ctx.fillStyle = selected ? "#FFFFFF" : inPath ? "#FFFFFF" : "#FBFCFE";
    ctx.fillRect(0, 0, width, height);

    // 路径光晕边框：就加在这里
    if (inPath) {
      ctx.strokeStyle = selected
        ? "rgba(79,70,229,0.95)"
        : "rgba(129,140,248,0.88)";
      ctx.lineWidth = selected ? 14 : 9;
      ctx.shadowColor = selected
        ? "rgba(79,70,229,0.34)"
        : "rgba(129,140,248,0.22)";
      ctx.shadowBlur = selected ? 28 : 16;
      roundRect(ctx, 10, 10, width - 20, height - 20, 34, false, true);
      ctx.shadowBlur = 0;
    }

    // 主边框
    ctx.strokeStyle = selected ? "#4338CA" : inPath ? "#818CF8" : "#D7DCE5";
    ctx.lineWidth = selected ? 8 : inPath ? 5 : 2.5;
    roundRect(ctx, 6, 6, width - 12, height - 12, 36, true, true);

    // chip
    ctx.fillStyle = selected ? "#E0E7FF" : inPath ? "#EEF2FF" : "#F3F4F6";
    roundRect(ctx, 28, 24, 170, 42, 21, true, false);
    ctx.fillStyle = selected ? "#3730A3" : "#4F46E5";
    ctx.font = "600 22px Inter, Arial, sans-serif";
    ctx.fillText(`Layer ${layer}`, 52, 51);

    if (selected || inPath) {
      ctx.beginPath();
      ctx.arc(width - 40, 46, selected ? 10 : 8, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "#4F46E5" : "#A5B4FC";
      ctx.shadowColor = selected
        ? "rgba(79,70,229,0.45)"
        : "rgba(165,180,252,0.28)";
      ctx.shadowBlur = selected ? 20 : 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = "#6B7280";
    ctx.font = "600 20px Inter, Arial, sans-serif";
    ctx.fillText("Prompt", 32, 110);

    ctx.fillStyle = "#111827";
    ctx.font = "500 24px Inter, Arial, sans-serif";
    drawWrappedText(ctx, truncateText(prompt, 120), 32, 150, width - 64, 38, 4);

    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 260);
    ctx.lineTo(width - 32, 260);
    ctx.stroke();

    ctx.fillStyle = "#94A3B8";
    ctx.font = "600 20px Inter, Arial, sans-serif";
    ctx.fillText("Response", 32, 305);

    ctx.fillStyle = "#374151";
    ctx.font = "500 22px Inter, Arial, sans-serif";
    drawWrappedText(
      ctx,
      truncateText(response, 170),
      32,
      345,
      width - 64,
      34,
      4,
    );

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [prompt, response, selected, layer]);

  if (!texture) return null;

  return (
    <mesh renderOrder={20}>
      <planeGeometry args={[NODE_W, NODE_H]} />
      <meshBasicMaterial map={texture} transparent depthTest={false} />
    </mesh>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: boolean,
  stroke: boolean,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const chars = text.split("");
  let line = "";
  let lineCount = 0;

  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== "") {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = chars[i];
      lineCount += 1;
      if (lineCount >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }

  if (lineCount < maxLines) {
    ctx.fillText(line, x, y + lineCount * lineHeight);
  }
}

function Node3D({
  node,
  selected,
  inPath,
  interactive,
  priority,
  moving,
  onSelect,
  showConfirmButton,
  onConfirmLayerMove,
}: {
  node: MindNode;
  selected: boolean;
  inPath: boolean;
  interactive: boolean;
  priority: boolean;
  moving: boolean;
  onSelect: () => void;
  showConfirmButton: boolean;
  onConfirmLayerMove: () => void;
}) {
  return (
    <group
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
    >
      <CardTexture
        prompt={node.prompt}
        response={node.response}
        selected={selected}
        inPath={inPath}
        layer={node.layer}
        interactive={interactive}
        priority={priority}
      />

      {showConfirmButton && (
        <group position={[NODE_W / 2 + 0.45, 0.1, 0.03]}>
          <mesh
            onClick={(e) => {
              e.stopPropagation();
              onConfirmLayerMove();
            }}
          >
            <circleGeometry args={[0.2, 32]} />
            <meshBasicMaterial color="#22C55E" />
          </mesh>
          <Text
            position={[0, 0, 0.02]}
            fontSize={0.2}
            color="white"
            anchorX="center"
            anchorY="middle"
            raycast={noRaycast}
          >
            ✓
          </Text>
        </group>
      )}
    </group>
  );
}

function LayerPlane({
  layer,
  bounds,
  active,
  label,
  onClick,
  onDoubleClick,
}: {
  layer: number;
  bounds: { width: number; height: number; centerX: number; centerY: number };
  active: boolean;
  label: string;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const baseColor = active ? "#D8E2FF" : "#F5F7FA";
  const glowColor = active ? "#8EA2FF" : "#C9D2E3";
  const labelColor = active ? "#3146B8" : "#5F6B7C";

  return (
    <group
      position={[bounds.centerX, bounds.centerY, layer * LAYER_SPACING]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
    >
      {/* 最外层空间雾：拉开层与层之间的空气感 */}
      <Plane
        args={[bounds.width * 1.28, bounds.height * 1.28]}
        position={[0, 0, -0.1]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={active ? 0.022 : 0.008}
          depthWrite={false}
        />
      </Plane>

      {/* 中层扩散：模拟玻璃内部漫散射外溢 */}
      <Plane
        args={[bounds.width * 1.14, bounds.height * 1.14]}
        position={[0, 0, -0.06]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={active ? 0.07 : 0.018}
          depthWrite={false}
        />
      </Plane>

      {/* 核心毛玻璃本体 */}
      <Plane
        args={[bounds.width, bounds.height]}
        position={[0, 0, -0.02]}
        raycast={noRaycast}
      >
        <meshPhysicalMaterial
          color={baseColor}
          transparent
          opacity={active ? 0.28 : 0.08}
          roughness={0.06}
          metalness={0}
          transmission={0.82}
          thickness={0.9}
          clearcoat={1}
          clearcoatRoughness={0.04}
          reflectivity={0.45}
          ior={1.18}
          depthWrite={false}
        />
      </Plane>

      {/* 内层发光芯：让“被选中的这一层”中心更有玻璃内部亮起来的感觉 */}
      <Plane
        args={[bounds.width * 0.92, bounds.height * 0.92]}
        position={[0, 0, -0.015]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={active ? "#EAF0FF" : "#FFFFFF"}
          transparent
          opacity={active ? 0.065 : 0.018}
          depthWrite={false}
        />
      </Plane>

      {/* 左导光边 */}
      <Plane
        args={[0.16, bounds.height * 0.92]}
        position={[-bounds.width / 2 + 0.1, 0, -0.005]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={active ? 0.22 : 0.05}
          depthWrite={false}
        />
      </Plane>

      {/* 右导光边 */}
      <Plane
        args={[0.16, bounds.height * 0.92]}
        position={[bounds.width / 2 - 0.1, 0, -0.005]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={active ? 0.16 : 0.04}
          depthWrite={false}
        />
      </Plane>

      {/* 上导光边 */}
      <Plane
        args={[bounds.width * 0.88, 0.12]}
        position={[0, bounds.height / 2 - 0.08, -0.005]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={active ? 0.11 : 0.03}
          depthWrite={false}
        />
      </Plane>

      {/* 当前层标签 */}
      {label && (
        <Text
          position={[-bounds.width / 2 + 0.55, bounds.height / 2 + 0.42, 0.02]}
          fontSize={0.24}
          color={labelColor}
          anchorX="left"
          anchorY="middle"
        >
          {label}
        </Text>
      )}
    </group>
  );
}

function LayeredKnowledgeScene({
  nodes,
  selectedNodeId,
  selectedLayer,
  displayLayer,
  planeNames,
  is3DMode,
  toolMode,
  movingNodeId,
  pendingNodeLayer,
  zoom2D,
  zoom3D,
  onSelectNode,
  onStartLayerMove,
  onConfirmLayerMove,
  onSelectLayer,
  onRenameLayer,
}: {
  nodes: NodesMap;
  selectedNodeId: string;
  selectedLayer: number;
  displayLayer: number;
  planeNames: Record<number, string>;
  is3DMode: boolean;
  toolMode: ToolMode;
  movingNodeId: string | null;
  pendingNodeLayer: number | null;
  zoom2D: number;
  zoom3D: number;
  onSelectNode: (id: string) => void;
  onStartLayerMove: (id: string) => void;
  onConfirmLayerMove: () => void;
  onSelectLayer: (layer: number) => void;
  onRenameLayer: (layer: number) => void;
}) {
  const {
    visibleIds,
    renderedNodes,
    renderedLinks,
    currentPath,
    currentPathIds,
    effectiveLayer,
    globalPlaneBounds,
    minLayer,
    maxLayer,
  } = useTreeLayout({
    nodes,
    selectedNodeId,
    selectedLayer,
    is3DMode,
    movingNodeId,
    pendingNodeLayer,
  });

  return (
    <Canvas
      style={{
        background:
          "radial-gradient(circle at 50% 42%, rgba(244,247,250,0.48) 0%, rgba(220,225,232,0.72) 42%, rgba(196,202,211,0.94) 100%)",
      }}
    >
      {is3DMode ? (
        <PerspectiveCamera makeDefault position={[-12, 12, 18]} fov={42} />
      ) : (
        <OrthographicCamera makeDefault position={[0, 0, 40]} zoom={105} />
      )}

      <CameraModeRig
        is3DMode={is3DMode}
        selectedLayer={selectedLayer}
        zoom2D={zoom2D}
        zoom3D={zoom3D}
      />

      <ambientLight intensity={0.92} color="#EEF2F7" />
      <directionalLight
        position={[10, 12, 14]}
        intensity={0.95}
        color="#FFFFFF"
      />
      <directionalLight
        position={[-8, -4, 6]}
        intensity={0.28}
        color="#C5CCD8"
      />
      <directionalLight
        position={[0, 6, -10]}
        intensity={0.12}
        color="#AAB4C8"
      />

      <group
        rotation={[0, 0, 0]}
        position={
          is3DMode
            ? [
                0,
                0,
                -(toolMode === "layerMove" ? selectedLayer : displayLayer) *
                  LAYER_SPACING,
              ]
            : [0, 0, -selectedLayer * LAYER_SPACING]
        }
      >
        {(is3DMode
          ? Array.from(
              { length: maxLayer - minLayer + 5 },
              (_, idx) => minLayer - 2 + idx,
            )
          : [selectedLayer]
        ).map((layer) => {
          return (
            <LayerPlane
              key={`plane-${layer}`}
              layer={layer}
              bounds={globalPlaneBounds}
              active={layer === selectedLayer}
              label={layer === 0 ? "根节点层" : (planeNames[layer] ?? "")}
              onClick={() => {
                if (is3DMode) onSelectLayer(layer);
              }}
              onDoubleClick={() => {
                if (is3DMode) onRenameLayer(layer);
              }}
            />
          );
        })}

        {renderedLinks.map((link, i) => {
          const source: [number, number, number] = [
            link.source.y + (link.source.data.offsetX ?? 0) / 100 + NODE_W / 2,
            -link.source.x - (link.source.data.offsetY ?? 0) / 100,
            is3DMode
              ? effectiveLayer(link.source.data) * LAYER_SPACING
              : selectedLayer * LAYER_SPACING + 0.02,
          ];

          const target: [number, number, number] = [
            link.target.y + (link.target.data.offsetX ?? 0) / 100 - NODE_W / 2,
            -link.target.x - (link.target.data.offsetY ?? 0) / 100,
            is3DMode
              ? effectiveLayer(link.target.data) * LAYER_SPACING
              : selectedLayer * LAYER_SPACING + 0.02,
          ];

          const currentPath = getContextPath(nodes, selectedNodeId);
          const isPathEdge =
            currentPath.some((n) => n.id === link.source.data.id) &&
            currentPath.some((n) => n.id === link.target.data.id);

          return (
            <Line
              key={`line-${i}`}
              points={[source, target]}
              color={isPathEdge ? "#4338CA" : "#94A3B8"}
              lineWidth={isPathEdge ? 2.8 : 1.55}
              transparent
              opacity={isPathEdge ? 0.98 : 0.78}
              depthTest={false}
              renderOrder={12}
              raycast={noRaycast}
            />
          );
        })}

        {renderedNodes.map((node) => {
          const previewLayer =
            movingNodeId === node.data.id && pendingNodeLayer !== null
              ? pendingNodeLayer
              : node.data.layer;

          const isCurrentLayerNode = previewLayer === selectedLayer;

          const isInteractiveNode =
            !(is3DMode && toolMode === "layerMove") || isCurrentLayerNode;

          const isPriorityNode = !is3DMode || isCurrentLayerNode;
          const isMovingNode = movingNodeId === node.data.id;

          const nodeZ = is3DMode
            ? previewLayer * LAYER_SPACING
            : selectedLayer * LAYER_SPACING + 0.12;

          const position: [number, number, number] = [
            node.y + (node.data.offsetX ?? 0) / 100,
            -node.x - (node.data.offsetY ?? 0) / 100,
            nodeZ,
          ];

          return (
            <group key={node.data.id} position={position}>
              <Node3D
                node={node.data}
                selected={node.data.id === selectedNodeId}
                inPath={currentPathIds.has(node.data.id)}
                interactive={isInteractiveNode}
                priority={isPriorityNode}
                moving={isMovingNode}
                onSelect={() => {
                  if (!isInteractiveNode) return;

                  onSelectNode(node.data.id);

                  if (
                    is3DMode &&
                    toolMode === "layerMove" &&
                    node.data.id !== "root"
                  ) {
                    onStartLayerMove(node.data.id);
                  }
                }}
                showConfirmButton={toolMode === "layerMove" && isMovingNode}
                onConfirmLayerMove={onConfirmLayerMove}
              />
            </group>
          );
        })}
      </group>

      {is3DMode ? (
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableRotate={false}
        />
      ) : (
        <OrbitControls
          enablePan={true}
          enableZoom={false}
          enableRotate={false}
          screenSpacePanning={true}
          panSpeed={1.1}
          zoomSpeed={0.9}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
      )}
    </Canvas>
  );
}

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

  useEffect(() => {
    if (toolMode !== "layerMove" || !is3DMode) {
      setMovingNodeId(null);
      setPendingNodeLayer(null);
    }
  }, [toolMode, is3DMode]);

  useEffect(() => {
    // 只在 3D + 层级模式，并且当前没有“正在拖着移动的节点”时，自动修正选中节点
    if (!is3DMode || toolMode !== "layerMove" || movingNodeId !== null) return;

    const selectedNode = nodes[selectedNodeId];
    if (!selectedNode) return;

    // 如果当前选中的节点本来就在当前层，不需要修正
    if (selectedNode.layer === selectedLayer) return;

    // 在当前层里找“离根节点最近”的节点（路径最短）
    const candidates = Object.values(nodes).filter(
      (node) => node.layer === selectedLayer,
    );

    if (candidates.length === 0) {
      // 当前层没有节点，至少回退到 root，避免 selectedNodeId 悬空
      setSelectedNodeId("root");
      return;
    }

    const best = candidates.reduce((bestNode, currentNode) => {
      const bestDepth = getContextPath(nodes, bestNode.id).length;
      const currentDepth = getContextPath(nodes, currentNode.id).length;

      if (currentDepth < bestDepth) return currentNode;
      if (currentDepth > bestDepth) return bestNode;

      // 深度相同，就优先保留时间更早的那个，避免来回跳
      return currentNode.timestamp < bestNode.timestamp
        ? currentNode
        : bestNode;
    });

    if (best.id !== selectedNodeId) {
      setSelectedNodeId(best.id);
    }
  }, [is3DMode, toolMode, movingNodeId, selectedLayer, selectedNodeId, nodes]);

  const currentPath = getContextPath(nodes, selectedNodeId);
  const selectedNode = nodes[selectedNodeId] ?? nodes.root;
  const allLayers = Object.values(nodes).map((n) => n.layer);
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

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-[#C9CED6] font-sans text-[#1A1A1A]">
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

      <div className="relative flex flex-1 flex-col">
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

        <div
          className="relative flex-1 overflow-hidden"
          onWheel={handleSceneWheel}
        >
          <LayeredKnowledgeScene
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

        <div className="absolute bottom-7 left-1/2 z-30 -translate-x-1/2">
          <div className="flex items-end gap-2 rounded-[22px] border border-white/20 bg-[rgba(255,255,255,0.14)] px-3 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            <ToolCircle
              active={toolMode === "view"}
              icon={<ScanSearch size={18} />}
              label="视图"
              title="视图模式"
              onClick={() => setToolMode("view")}
            />

            <ToolCircle
              active={toolMode === "node"}
              icon={<Move size={18} />}
              label="节点"
              title="节点拖动模式"
              onClick={() => setToolMode("node")}
            />

            <ToolCircle
              active={false}
              icon={<RotateCcw size={18} />}
              label="整理"
              title="自动整理"
              onClick={autoArrange}
            />

            <ToolCircle
              active={is3DMode}
              icon={<BrainCircuit size={18} />}
              label="3D"
              title="2D / 3D 切换"
              onClick={toggle3DMode}
            />

            <ToolCircle
              active={false}
              icon={<GitBranch size={18} />}
              label="命名"
              title="命名当前平面"
              onClick={() => {
                if (is3DMode) openPlaneNameDialog(selectedLayer);
              }}
            />

            <ToolCircle
              active={toolMode === "layerMove"}
              icon={<GitBranch size={18} />}
              label="层级"
              title="层级移动"
              onClick={() => setToolMode("layerMove")}
            />
            <div className="ml-1 text-[12px] text-slate-500">
              {toolMode === "view" && "视图模式"}
              {toolMode === "node" && "节点模式"}
              {toolMode === "layerMove" && "层级模式"}
            </div>
          </div>
        </div>
        <div className="absolute bottom-7 right-7 z-30">
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/20 bg-[rgba(255,255,255,0.14)] p-2 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            <button
              onClick={handleZoomIn}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-slate-700 transition-all hover:bg-white"
              title="放大"
            >
              <Plus size={18} />
            </button>

            <div className="px-2 text-[11px] font-medium text-slate-600">
              {is3DMode ? `${zoom3D.toFixed(2)}x` : `${Math.round(zoom2D)}%`}
            </div>

            <button
              onClick={handleZoomOut}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-slate-700 transition-all hover:bg-white"
              title="缩小"
            >
              <Minus size={18} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="z-40 w-1.5 cursor-col-resize bg-slate-200/85 transition-colors hover:bg-indigo-400 active:bg-indigo-600"
        onMouseDown={startResizing}
      />

      <div
        className="relative z-30 flex shrink-0 flex-col border-l border-slate-200/80 bg-white/88 shadow-[-12px_0_40px_rgba(15,23,42,0.05)] backdrop-blur-xl"
        style={{ width: sidebarWidth }}
      >
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-100 bg-white/65 px-7 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-[16px] font-semibold text-slate-900">
              <GitBranch className="text-indigo-600" size={17} />
              当前探索路径
            </h2>
            <p className="mt-1 text-[12px] text-slate-500">
              Focused branch in nonlinear knowledge space
            </p>
          </div>

          <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-[12px] font-semibold text-indigo-700">
            深度 {currentPath.length}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-7">
          {currentPath.map((node) => (
            <div
              key={node.id}
              className={`rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm transition-all ${
                node.id === selectedNodeId ? "ring-1 ring-indigo-300" : ""
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-indigo-600">
                  <BrainCircuit size={13} />
                  Thought Node
                </span>

                <span className="text-[11px] text-slate-400">
                  z = {node.layer}
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Prompt
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-[14px] leading-7 text-slate-700">
                    {node.prompt}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Response
                  </div>
                  <div
                    className={`rounded-xl px-4 py-3 text-[14px] leading-7 ${
                      node.id === selectedNodeId
                        ? "bg-indigo-600 text-white shadow-[0_14px_30px_rgba(99,102,241,0.18)]"
                        : "bg-[#FBFBFC] text-slate-600"
                    }`}
                  >
                    {node.response}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {isAiTyping && (
            <div className="rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="animate-pulse text-indigo-500" size={16} />
                <span className="text-[14px] font-medium text-slate-500">
                  Structured reasoning in progress...
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200/80 bg-white/92 px-5 py-5">
          <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-400">
            <Plus size={12} />
            基于当前焦点延展新的思维分支
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#FBFBFC] p-2 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
            <div className="relative">
              <textarea
                className="w-full resize-none rounded-[14px] border-0 bg-transparent px-3 py-3 pr-14 text-[14px] leading-6 text-slate-700 outline-none placeholder:text-slate-400"
                rows={4}
                placeholder={`在 z = ${selectedLayer} 平面继续展开你的问题...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />

              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isAiTyping}
                className={`absolute bottom-3 right-3 rounded-xl p-2.5 transition-all ${
                  inputText.trim() && !isAiTyping
                    ? "bg-indigo-600 text-white shadow-[0_12px_24px_rgba(99,102,241,0.20)] hover:bg-indigo-700"
                    : "cursor-not-allowed bg-slate-200 text-slate-400"
                }`}
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
      {isPlaneNameDialogOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/18 backdrop-blur-[2px]">
          <div className="w-[360px] rounded-2xl border border-white/30 bg-white/88 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            <div className="mb-4">
              <h3 className="text-[16px] font-semibold text-slate-900">
                命名当前平面
              </h3>
              <p className="mt-1 text-[12px] text-slate-500">
                当前平面：z = {selectedLayer}
              </p>
            </div>

            <input
              value={planeNameInput}
              onChange={(e) => setPlaneNameInput(e.target.value)}
              placeholder={selectedLayer === 0 ? "根节点层" : "输入平面名称"}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] text-slate-700 outline-none transition-all focus:border-indigo-400"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsPlaneNameDialogOpen(false);
                  setPlaneNameInput("");
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[14px] text-slate-600 transition-all hover:bg-slate-50"
              >
                取消
              </button>

              <button
                onClick={confirmPlaneName}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-[14px] text-white transition-all hover:bg-indigo-700"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
