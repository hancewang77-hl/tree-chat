import type { NutrientItem } from "@/src/types/tree";

const DEFAULT_CONTEXT_BUDGET = 20_000;
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "log",
  "yaml",
  "yml",
  "xml",
]);

export function summarizeNutrientText(text: string, maxLen: number = 220): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) return compact;
  return compact.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

export function buildNutrientContext(
  nutrients: NutrientItem[],
  activeIds: string[],
  budget: number = DEFAULT_CONTEXT_BUDGET,
): string {
  const active = new Set(activeIds);
  const ready = nutrients.filter(
    (nutrient) =>
      active.has(nutrient.id) &&
      nutrient.extractionStatus === "ready" &&
      nutrient.extractedText.trim().length > 0,
  );

  if (ready.length === 0 || budget <= 0) return "";

  let remaining = budget;
  const sections: string[] = [];

  for (const nutrient of ready) {
    const heading = `\n\n[${nutrient.name} | ${nutrient.extractedCharCount} chars]\n`;
    if (remaining <= heading.length) break;
    const allowance = remaining - heading.length;
    const body =
      nutrient.extractedText.length > allowance
        ? nutrient.extractedText.slice(0, Math.max(0, allowance - 18)).trimEnd() +
          "\n[内容已截断]"
        : nutrient.extractedText;
    sections.push(heading + body);
    remaining -= heading.length + body.length;
  }

  if (sections.length === 0) return "";

  return [
    "Nutrients · 养分上下文",
    "以下资料来自用户在当前 Tree 项目窗口上传并启用的本地文件。回答时优先参考这些资料；如果资料不足，请明确说明。",
    ...sections,
  ].join("\n");
}

export async function extractNutrientFromFile(file: File): Promise<NutrientItem> {
  const base = createBaseNutrient(file);
  const extension = extensionOf(file.name);

  if (isTextLike(file, extension)) {
    try {
      const extractedText = await file.text();
      return {
        ...base,
        kind: "text",
        extractionStatus: "ready",
        extractedText,
        excerpt: summarizeNutrientText(extractedText),
        extractedCharCount: extractedText.length,
      };
    } catch {
      return {
        ...base,
        kind: "text",
        extractionStatus: "failed",
        excerpt: "文本读取失败",
      };
    }
  }

  if (file.type.startsWith("image/")) {
    return {
      ...base,
      kind: "image",
      extractionStatus: "unsupported",
      excerpt: "图片已保存为本地附件；当前 DeepSeek 文本接口不会读取图片内容。",
    };
  }

  if (extension === "pdf" || extension === "docx" || extension === "doc") {
    return {
      ...base,
      kind: "document",
      extractionStatus: "unsupported",
      excerpt: "该文档已保存为本地附件；第一版不会解析 PDF/DOCX 正文。",
    };
  }

  return {
    ...base,
    kind: "unknown",
    extractionStatus: "unsupported",
    excerpt: "该文件类型可展示为附件，但不会进入 AI 文本上下文。",
  };
}

function createBaseNutrient(file: File): NutrientItem {
  return {
    id: `nutrient-${crypto.randomUUID()}`,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind: "unknown",
    createdAt: Date.now(),
    extractionStatus: "extracting",
    extractedText: "",
    excerpt: "",
    extractedCharCount: 0,
  };
}

function extensionOf(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext && ext !== filename.toLowerCase() ? ext : "";
}

function isTextLike(file: File, extension: string) {
  return (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/xml" ||
    TEXT_EXTENSIONS.has(extension)
  );
}
