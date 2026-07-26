import type { SemanticCard } from "@/src/types/tree";

const CARD_FIELDS = [
  "facts",
  "constraints",
  "assumptions",
  "decisions",
  "rejected",
  "openQuestions",
] as const;

const MAX_ITEMS_PER_FIELD = 8;
const MAX_ITEM_LENGTH = 320;

type SemanticField = (typeof CARD_FIELDS)[number];

export type SemanticCardMetadata = {
  generatedAt: number;
  model: string;
};

export function createRootSemanticCard(
  rootPrompt: string,
  generatedAt: number = Date.now(),
): SemanticCard {
  return {
    version: 1,
    generatedAt,
    model: "local-root-v1",
    facts: [],
    constraints: [],
    assumptions: [],
    decisions: [],
    rejected: [],
    openQuestions: rootPrompt.trim() ? [rootPrompt.trim()] : [],
  };
}

/**
 * Parses a model response into a bounded card: per field at most
 * MAX_ITEMS_PER_FIELD unique items of MAX_ITEM_LENGTH chars, and at least one
 * field must end up non-empty. Unknown fields are dropped.
 */
export function parseSemanticCard(
  raw: string,
  metadata: SemanticCardMetadata,
): SemanticCard {
  const parsed = parseJsonObject(raw);
  const card = Object.fromEntries(
    CARD_FIELDS.map((field) => [field, normalizeStringList(parsed[field])]),
  ) as Record<SemanticField, string[]>;

  if (!CARD_FIELDS.some((field) => card[field].length > 0)) {
    throw new Error("语义卡片为空");
  }

  return {
    version: 1,
    generatedAt: metadata.generatedAt,
    model: metadata.model,
    ...card,
  };
}

/** Persisted cards may predate validation — recheck shape before compiling. */
export function isUsableSemanticCard(card: SemanticCard | undefined): card is SemanticCard {
  return Boolean(
    card &&
      card.version === 1 &&
      typeof card.model === "string" &&
      CARD_FIELDS.every(
        (field) => Array.isArray(card[field]) && card[field].every((item) => typeof item === "string"),
      ) &&
      CARD_FIELDS.some((field) => card[field].length > 0),
  );
}

export function semanticCardToText(card: SemanticCard): string {
  const labels: Record<SemanticField, string> = {
    facts: "事实",
    constraints: "约束",
    assumptions: "假设",
    decisions: "决定",
    rejected: "已否定",
    openQuestions: "开放问题",
  };

  return CARD_FIELDS.flatMap((field) => {
    if (card[field].length === 0) return [];
    return [`${labels[field]}：${card[field].join("；")}`];
  }).join("\n");
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("语义整理未返回内容");

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const candidates = [withoutFence];
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(withoutFence.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      // Try the next safely bounded JSON candidate.
    }
  }

  throw new Error("语义整理返回了无效 JSON");
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.replace(/\s+/g, " ").trim().slice(0, MAX_ITEM_LENGTH);
    if (!normalized) continue;
    unique.add(normalized);
    if (unique.size >= MAX_ITEMS_PER_FIELD) break;
  }
  return Array.from(unique);
}
