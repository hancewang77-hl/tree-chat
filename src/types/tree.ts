export type MindNode = {
  id: string;
  prompt: string;
  response: string;
  children: string[];
  parentId: string | null;
  timestamp: number;
  offsetX?: number;
  offsetY?: number;
  layer: number;
};

export type NodesMap = Record<string, MindNode>;

export type ToolMode = "view" | "node" | "layerMove";
