/** 新建项目时根节点的默认引导语，仅用于 UI，不应进入导出或模型上下文。 */
export const ROOT_ONBOARDING_RESPONSE =
  "这是你思维之树的根。从这里开始，提出一个问题，AI 会帮助你展开枝叶。每一个节点都可以继续生长出新的分支。试着在下方输入你的第一个问题，让这棵树开始生长吧。";

export function isRootOnboardingResponse(response: string): boolean {
  return response.trim() === ROOT_ONBOARDING_RESPONSE;
}

/** 返回适合写入导出文件的正文；过滤系统引导语与无意义占位内容。 */
export function getExportableNodeBody(node: {
  kind: "root" | "branch" | "leaf";
  prompt: string;
  response: string;
}): string {
  const response = node.response.trim();

  if (node.kind === "root") {
    if (!response || isRootOnboardingResponse(response)) return "";
    return response;
  }

  if (node.kind === "leaf") {
    return response;
  }

  return response;
}
