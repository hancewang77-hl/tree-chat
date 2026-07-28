import type {
  AuxoPlan,
  AuxoPlanNode,
  AuxoRequest,
  AuxoSourceReference,
  AuxoSourceUnit,
  Project,
} from "@/src/types/tree";
import { DEEPSEEK_MODEL } from "@/src/lib/deepseek";

/**
 * Auxo full-input compilation and validation.
 *
 * Core guarantees enforced in this module:
 * - Verbatim provenance: every source unit (and every plan source reference)
 *   must appear character-for-character at its claimed offset in the submitted
 *   root task or in the Nutrient document reconstructed from its chunks.
 * - Plan `order` values must equal the DFS preorder of the plan tree.
 * - Every detected source unit maps to exactly one atomic task, in the order
 *   the units appear in the source material.
 * - Any failure throws AuxoValidationError before any tree mutation: an
 *   invalid input or plan always produces zero writes.
 */

// ---------------------------------------------------------------------------
// Budgets & patterns
// ---------------------------------------------------------------------------

export const AUXO_MODEL = DEEPSEEK_MODEL;
export const AUXO_MAX_NODES = 40;
export const AUXO_MAX_DEPTH = 4;
export const AUXO_MAX_ROOT_TASK_CHARS = 8_000;
export const AUXO_MAX_NUTRIENT_CHARS = 50_000;
export const AUXO_MAX_NUTRIENT_CHUNKS = 80;
export const AUXO_MAX_SOURCE_UNIT_CHARS = 8_000;
// The request contains every Nutrient chunk and may repeat detected question text
// in sourceUnits. Allow the worst-case UTF-8 expansion plus JSON escaping.
export const AUXO_MAX_BODY_BYTES = 700_000;
export const AUXO_MAX_TITLE_CHARS = 160;
const AUXO_MAX_CHUNK_CHARS = 10_000;
const AUXO_TARGET_CHUNK_CHARS = 1_600;
const AUXO_MAX_NAME_CHARS = 300;
const PLAN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CHINESE_NUMERALS = "一二三四五六七八九十百零〇两";
const PRIMARY_TASK_PATTERN = new RegExp(
  `^(?:(?:第\\s*(?:\\d{1,3}|[${CHINESE_NUMERALS}]+)\\s*[题问問])|(?:\\d{1,3}\\s*[题问問])|(?:[${CHINESE_NUMERALS}]+\\s*[、.．])|(?:\\d{1,3}\\s*[.．、)）](?!\\d))|(?:(?:question|problem|exercise|task)\\s*\\d{1,3}\\b))`,
  "i",
);
const PARENTHETICAL_TASK_PATTERN = new RegExp(
  `^[（(]\\s*(?:\\d{1,3}|[${CHINESE_NUMERALS}]+)\\s*[)）](?!\\d)`,
);
// Unambiguous section-type labels: demote a numbered line to a section
// boundary regardless of marker style ("一、填空题" and "1. 填空题" alike).
const GENERIC_SECTION_PATTERN = new RegExp(
  "^(?:单项选择题|多项选择题|不定项选择题|选择题|填空题|判断题|简答题|名词解释题?|设计题|分析题|解答题|计算题|证明题|问答题|材料题|综合题|应用题|作图题|论述题|操作题|实验题|编程题|程序设计题|改错题|连线题|翻译题|完形填空|阅读理解)(?:\\s*[（(][^）)]*[)）])?[：:]?$",
  "i",
);
// Bare labels are ambiguous: "二、作文" is a section, but "2. 作文" is usually a
// real task. They demote only under section-style markers (Chinese numerals or
// Markdown headings).
const GENERIC_SECTION_BARE_PATTERN = new RegExp(
  "^(?:选择|填空|判断|简答|计算|问答|写作|听力|默写|作文|翻译)(?:\\s*[（(][^）)]*[)）])?[：:]?$",
  "i",
);
// Answer-key sections ("参考答案", "六、答案与解析"): numbered lines inside them
// are answers, not questions, and must not become source units.
const ANSWER_SECTION_PATTERN = /^(?:参考|标准)?答案(?:与解析|及解析|解析)?[：:]?$/;
const CHINESE_NUMERAL_PATTERN = new RegExp(`[${CHINESE_NUMERALS}]`);
// Lines with no characters beyond table/rule punctuation — docx answer-writing
// areas render as runs of blank table rows that would otherwise bloat units.
const CONTENT_FREE_LINE_PATTERN = /^[ \t|:-]*$/;
// Characters rejected in verbatim source text (and replaced with spaces in
// display text): C0 controls except \t \n \r, plus DEL. The non-global form is
// for .test(); the global form is only safe with .replace().
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const CONTROL_CHARACTER_PATTERN_GLOBAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuxoInputBundle = {
  request: AuxoRequest;
  inputFingerprint: string;
  nutrientRefs: string[];
};

type AuxoSourceDescriptor =
  | { kind: "root" }
  | { kind: "nutrient"; nutrientId: string; nutrientName: string };

type SourceLine = {
  start: number;
  text: string;
  inFence: boolean;
};

type TaskMarker = {
  start: number;
  kind: "primary" | "parenthetical";
};

export class AuxoValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AuxoValidationError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Input compilation (client entry)
// ---------------------------------------------------------------------------

/**
 * Compiles the full Auxo request from the active project: normalized root
 * task, every enabled ready Nutrient as lossless chunks, and the detected
 * source units. Enforces every budget before returning; throws
 * AuxoValidationError without side effects on any violation.
 */
export function compileAuxoInput(project: Project): AuxoInputBundle {
  const root = project.nodes[project.rootNodeId];
  const rootTask = normalizeSourceDocument(root?.prompt ?? "");
  if (!root || !rootTask) {
    throw new AuxoValidationError("ROOT_TASK_EMPTY", "根任务为空，无法启动 Auxo。");
  }
  if (rootTask.length > AUXO_MAX_ROOT_TASK_CHARS) {
    throw new AuxoValidationError(
      "ROOT_TASK_TOO_LARGE",
      `根任务超过 ${AUXO_MAX_ROOT_TASK_CHARS.toLocaleString()} 字，请先精简。`,
    );
  }

  const seenIds = new Set<string>();
  const nutrientRefs: string[] = [];
  const nutrientChunks: AuxoRequest["nutrientChunks"] = [];
  const sourceUnits: AuxoSourceUnit[] = extractAuxoSourceUnits(
    rootTask,
    { kind: "root" },
    1,
  );
  let nextSourceOrder = sourceUnits.length + 1;
  let totalChars = 0;

  for (const nutrientId of project.activeNutrientIds) {
    if (seenIds.has(nutrientId)) {
      throw new AuxoValidationError("DUPLICATE_NUTRIENT", "启用的 Nutrient 清单存在重复项。");
    }
    seenIds.add(nutrientId);

    const nutrient = project.nutrients[nutrientId];
    if (!nutrient) {
      throw new AuxoValidationError(
        "NUTRIENT_MISSING",
        "有一个已启用的 Nutrient 已丢失，请重新选择资料。",
      );
    }
    if (nutrient.extractionStatus !== "ready" || !nutrient.extractedText.trim()) {
      throw new AuxoValidationError(
        "NUTRIENT_NOT_READY",
        `Nutrient「${nutrient.name}」尚未成功转换为 Markdown。`,
      );
    }

    nutrientRefs.push(nutrient.id);
    const normalizedNutrientText = normalizeSourceDocument(nutrient.extractedText);
    const chunks = chunkAuxoNutrientText(
      normalizedNutrientText,
      nutrient.id,
      nutrient.name,
    );
    if (chunks.length === 0) {
      throw new AuxoValidationError(
        "NUTRIENT_EMPTY",
        `Nutrient「${nutrient.name}」没有可用的 Markdown 内容。`,
      );
    }
    for (const chunk of chunks) {
      totalChars += chunk.text.length;
      nutrientChunks.push({
        nutrientId: chunk.nutrientId,
        nutrientName: chunk.nutrientName,
        chunkId: chunk.chunkId,
        offset: chunk.offset,
        text: chunk.text,
      });
    }

    const detected = extractAuxoSourceUnits(
      normalizedNutrientText,
      {
        kind: "nutrient",
        nutrientId: nutrient.id,
        nutrientName: nutrient.name,
      },
      nextSourceOrder,
    );
    sourceUnits.push(...detected);
    nextSourceOrder += detected.length;
  }

  if (
    totalChars > AUXO_MAX_NUTRIENT_CHARS ||
    nutrientChunks.length > AUXO_MAX_NUTRIENT_CHUNKS
  ) {
    throw new AuxoValidationError(
      "NUTRIENT_BUDGET_EXCEEDED",
      `已启用资料共 ${totalChars.toLocaleString()} 字、${nutrientChunks.length} 个片段，超过 Auxo 的 ${AUXO_MAX_NUTRIENT_CHARS.toLocaleString()} 字 / ${AUXO_MAX_NUTRIENT_CHUNKS} 片段预算。请关闭部分 Nutrient 或拆成多个项目；本次不会遗漏资料，也不会创建节点。`,
    );
  }
  if (sourceUnits.length > AUXO_MAX_NODES) {
    throw new AuxoValidationError(
      "SOURCE_UNIT_BUDGET_EXCEEDED",
      `检测到 ${sourceUnits.length} 个明确题目，超过 Auxo 单次 ${AUXO_MAX_NODES} 节点上限。请拆分资料后重试；本次不会遗漏题目，也不会创建节点。`,
    );
  }

  const request = validateAuxoRequest({ rootTask, nutrientChunks, sourceUnits });
  const byteLength = new TextEncoder().encode(JSON.stringify(request)).byteLength;
  if (byteLength > AUXO_MAX_BODY_BYTES) {
    throw new AuxoValidationError(
      "REQUEST_BODY_TOO_LARGE",
      "Auxo 完整输入超过请求预算，请关闭部分 Nutrient 或拆成多个项目。",
    );
  }
  return {
    request,
    nutrientRefs,
    inputFingerprint: fingerprintAuxoInput(request),
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * CRLF/CR → LF plus outer trim. Every offset used for provenance checks in
 * this module is relative to this normalized form.
 */
function normalizeSourceDocument(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

// ---------------------------------------------------------------------------
// Source-unit extraction
// ---------------------------------------------------------------------------

/**
 * Extracts explicit, line-led question units before Nutrient chunking. The
 * returned text is an exact span of the normalized Markdown source, so a long
 * question can safely cross multiple transport chunks.
 *
 * This is deliberately conservative: broad prose goals are left for model
 * planning, while numbered exam-style units become deterministic obligations.
 */
export function extractAuxoSourceUnits(
  markdown: string,
  source: AuxoSourceDescriptor,
  startingOrder: number = 1,
): AuxoSourceUnit[] {
  const normalized = normalizeSourceDocument(markdown);
  if (!normalized) return [];
  if (!Number.isInteger(startingOrder) || startingOrder < 1) {
    throw new AuxoValidationError("INVALID_SOURCE_ORDER", "题目单元起始顺序无效。");
  }

  const lines = splitSourceLines(normalized);
  const sectionBoundaries = lines
    .filter(
      (line) =>
        !line.inFence &&
        (isMarkdownHeading(line.text) ||
          isGenericSectionLine(line.text) ||
          isAnswerSectionLine(line.text)),
    )
    .map((line) => line.start);
  // Numbered lines inside an answer-key section ("参考答案" → "1\. B") are
  // answers, not questions. Suppress markers from each answer heading to the
  // next non-answer section boundary (or end of document).
  const answerStarts = new Set(
    lines
      .filter((line) => !line.inFence && isAnswerSectionLine(line.text))
      .map((line) => line.start),
  );
  const answerZones = [...answerStarts].map((zoneStart) => ({
    start: zoneStart,
    end:
      sectionBoundaries.find(
        (offset) => offset > zoneStart && !answerStarts.has(offset),
      ) ?? normalized.length,
  }));
  const inAnswerZone = (offset: number) =>
    answerZones.some((zone) => offset >= zone.start && offset < zone.end);
  const candidates = lines
    .map((line) => {
      if (line.inFence || inAnswerZone(line.start)) return null;
      const kind = detectTaskMarker(line.text);
      return kind ? { start: line.start, kind } satisfies TaskMarker : null;
    })
    .filter((marker): marker is TaskMarker => marker !== null);
  const primaryStarts = candidates
    .filter((candidate) => candidate.kind === "primary")
    .map((candidate) => candidate.start);
  // A parenthetical marker only starts a unit when no primary marker precedes
  // it, or when a section boundary resets the numbering after the last primary.
  const starts = candidates.filter((candidate) => {
    if (candidate.kind === "primary") return true;
    const previousPrimary = lastOffsetBefore(primaryStarts, candidate.start);
    if (previousPrimary === undefined) return true;
    const previousBoundary = lastOffsetBefore(sectionBoundaries, candidate.start);
    return previousBoundary !== undefined && previousBoundary > previousPrimary;
  });
  if (starts.length === 0) return [];

  const startOffsets = new Set(starts.map((marker) => marker.start));
  const headingBoundaries = sectionBoundaries.filter(
    (offset) => !startOffsets.has(offset),
  );

  return starts.map((marker, index) => {
    const nextTask = starts[index + 1]?.start ?? normalized.length;
    const nextHeading = headingBoundaries.find((offset) => offset > marker.start);
    const rawEnd = Math.min(nextTask, nextHeading ?? normalized.length);
    const span = trimSourceSpan(normalized, marker.start, rawEnd);
    if (!span.text) {
      throw new AuxoValidationError("EMPTY_SOURCE_UNIT", "检测到空的题目单元。");
    }
    if (span.text.length > AUXO_MAX_SOURCE_UNIT_CHARS) {
      throw new AuxoValidationError(
        "SOURCE_UNIT_TOO_LARGE",
        `第 ${startingOrder + index} 个明确题目超过 ${AUXO_MAX_SOURCE_UNIT_CHARS.toLocaleString()} 字，请先拆分该题。`,
      );
    }

    const order = startingOrder + index;
    const common = {
      unitId: `source-${String(order).padStart(3, "0")}`,
      text: span.text,
      offset: span.offset,
      order,
    };
    return source.kind === "root"
      ? { ...common, kind: "root" as const }
      : {
          ...common,
          kind: "nutrient" as const,
          nutrientId: source.nutrientId,
          nutrientName: source.nutrientName,
        };
  });
}

function detectTaskMarker(line: string): TaskMarker["kind"] | null {
  const candidate = normalizeMarkerCandidate(line);
  const isHeadingLine = isMarkdownHeading(line);

  const primary = candidate.match(PRIMARY_TASK_PATTERN);
  if (primary) {
    if (isGenericSectionLabel(candidate, primary[0], isHeadingLine)) return null;
    return "primary";
  }
  const parenthetical = candidate.match(PARENTHETICAL_TASK_PATTERN);
  if (parenthetical) {
    if (isGenericSectionLabel(candidate, parenthetical[0], isHeadingLine)) return null;
    return "parenthetical";
  }
  return null;
}

function isGenericSectionLine(line: string): boolean {
  const candidate = normalizeMarkerCandidate(line);
  const marker = candidate.match(PRIMARY_TASK_PATTERN) ?? candidate.match(PARENTHETICAL_TASK_PATTERN);
  return Boolean(marker && isGenericSectionLabel(candidate, marker[0], isMarkdownHeading(line)));
}

function isAnswerSectionLine(line: string): boolean {
  const candidate = normalizeMarkerCandidate(line);
  if (ANSWER_SECTION_PATTERN.test(stripLabelDecorations(candidate))) return true;
  const marker = candidate.match(PRIMARY_TASK_PATTERN) ?? candidate.match(PARENTHETICAL_TASK_PATTERN);
  return Boolean(
    marker &&
      ANSWER_SECTION_PATTERN.test(stripLabelDecorations(candidate.slice(marker[0].length))),
  );
}

function normalizeMarkerCandidate(line: string): string {
  const trimmed = line.trimStart();
  // Headings and bullet items are document structure: "# 1\. 概述" is a chapter
  // heading and "- 1\. 备注" a note, so their escaped leaders stay escaped.
  const structural = /^#{1,6}[ \t]/.test(trimmed) || /^[-+*][ \t]/.test(trimmed);
  const candidate = trimmed
    .replace(/^#{1,6}[ \t]+/, "")
    .replace(/^(?:>\s*)+/, "")
    .replace(/^(?:\*\*|__)/, "")
    .replace(/^[-+*][ \t]+/, "");
  if (structural) return candidate;
  // Turndown escapes list-like leaders ("1\." / "1\)") so docx questions do
  // not re-parse as ordered lists; undo exactly that digit-led escape for
  // marker matching. Detection only — unit spans still slice the raw source.
  return candidate.replace(/(\d)\\([.)])/g, "$1$2");
}

function isGenericSectionLabel(
  candidate: string,
  marker: string,
  isHeadingLine: boolean,
): boolean {
  const remainder = stripLabelDecorations(candidate.slice(marker.length));
  if (GENERIC_SECTION_PATTERN.test(remainder)) return true;
  const sectionStyleMarker = isHeadingLine || CHINESE_NUMERAL_PATTERN.test(marker);
  return sectionStyleMarker && GENERIC_SECTION_BARE_PATTERN.test(remainder);
}

function stripLabelDecorations(text: string): string {
  return text
    .replace(/^(?:\*\*|__)/, "")
    .replace(/(?:\*\*|__)$/, "")
    .replace(/^[\s:：—-]+/, "")
    .trim();
}

function splitSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  let fence: { character: "`" | "~"; length: number } | null = null;
  while (start < source.length) {
    const newline = source.indexOf("\n", start);
    const end = newline < 0 ? source.length : newline;
    const text = source.slice(start, end);
    const marker = readFenceMarker(text);
    const inFence = fence !== null || marker !== null;
    lines.push({ start, text, inFence });
    if (!fence && marker) {
      fence = marker;
    } else if (
      fence &&
      marker &&
      marker.character === fence.character &&
      marker.length >= fence.length
    ) {
      fence = null;
    }
    if (newline < 0) break;
    start = newline + 1;
  }
  return lines;
}

function readFenceMarker(line: string): { character: "`" | "~"; length: number } | null {
  const match = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (!match) return null;
  return {
    character: match[1][0] as "`" | "~",
    length: match[1].length,
  };
}

function isMarkdownHeading(line: string): boolean {
  return /^[ \t]{0,3}#{1,6}[ \t]+\S/.test(line);
}

/**
 * Trims surrounding whitespace while keeping the offset pointing at the first
 * kept character, so the span still verifies verbatim against the source.
 * Trailing content-free lines (blank docx answer-space table rows) are dropped
 * first — they carry no question text but can push a unit past the size cap.
 */
function trimSourceSpan(
  source: string,
  start: number,
  end: number,
): { text: string; offset: number } {
  const spanLines = source.slice(start, end).split("\n");
  let keep = spanLines.length;
  while (keep > 1 && CONTENT_FREE_LINE_PATTERN.test(spanLines[keep - 1])) keep -= 1;
  const raw = spanLines.slice(0, keep).join("\n");
  const leading = raw.match(/^\s*/)?.[0].length ?? 0;
  const trailing = raw.match(/\s*$/)?.[0].length ?? 0;
  const contentEnd = Math.max(leading, raw.length - trailing);
  return {
    text: raw.slice(leading, contentEnd),
    offset: start + leading,
  };
}

function lastOffsetBefore(
  offsets: readonly number[],
  position: number,
): number | undefined {
  for (let index = offsets.length - 1; index >= 0; index--) {
    if (offsets[index] < position) return offsets[index];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Chunk transport
// ---------------------------------------------------------------------------

/**
 * Splits a normalized Nutrient document into contiguous lossless slices:
 * offsets start at 0, every character is covered exactly once, and
 * concatenating the chunk texts reproduces the source. The server relies on
 * this to reconstruct each document for verbatim provenance checks.
 */
function chunkAuxoNutrientText(
  source: string,
  nutrientId: string,
  nutrientName: string,
): AuxoRequest["nutrientChunks"] {
  const chunks: AuxoRequest["nutrientChunks"] = [];
  let offset = 0;

  while (offset < source.length) {
    let end = Math.min(source.length, offset + AUXO_TARGET_CHUNK_CHARS);
    if (end < source.length) {
      const newline = source.lastIndexOf("\n", end - 1);
      if (newline > offset + Math.floor(AUXO_TARGET_CHUNK_CHARS * 0.6)) {
        end = newline + 1;
      }
    }
    const text = source.slice(offset, end);
    chunks.push({
      nutrientId,
      nutrientName,
      chunkId: `chunk-${String(chunks.length + 1).padStart(3, "0")}`,
      offset,
      text,
    });
    offset = end;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

/**
 * Validates a full Auxo request. Chunks must arrive as contiguous slices from
 * offset 0 per Nutrient (the reconstructed documents back the verbatim checks
 * below), and every source unit must quote its claimed span exactly, without
 * overlapping a previously accepted unit of the same source.
 */
export function validateAuxoRequest(value: unknown): AuxoRequest {
  const object = asObject(value, "请求体必须是 JSON 对象。");
  const rootTask = readSourceText(
    object.rootTask,
    "rootTask",
    AUXO_MAX_ROOT_TASK_CHARS,
  );
  if (!Array.isArray(object.nutrientChunks)) {
    throw new AuxoValidationError("INVALID_CHUNKS", "nutrientChunks 必须是数组。");
  }
  if (object.nutrientChunks.length > AUXO_MAX_NUTRIENT_CHUNKS) {
    throw new AuxoValidationError(
      "NUTRIENT_BUDGET_EXCEEDED",
      `Nutrient 片段超过 ${AUXO_MAX_NUTRIENT_CHUNKS} 个。`,
    );
  }

  const seenChunks = new Set<string>();
  const nutrientNames = new Map<string, string>();
  const nextChunkOffset = new Map<string, number>();
  const nutrientDocuments = new Map<string, string>();
  let totalChars = 0;
  const nutrientChunks = object.nutrientChunks.map((rawChunk, index) => {
    const chunk = asObject(rawChunk, `nutrientChunks[${index}] 必须是对象。`);
    const nutrientId = readIdentifier(chunk.nutrientId, `nutrientChunks[${index}].nutrientId`, 128);
    const nutrientName = readText(
      chunk.nutrientName,
      `nutrientChunks[${index}].nutrientName`,
      AUXO_MAX_NAME_CHARS,
      false,
    );
    const chunkId = readIdentifier(chunk.chunkId, `nutrientChunks[${index}].chunkId`, 80);
    const offset = readNonNegativeInteger(
      chunk.offset,
      `nutrientChunks[${index}].offset`,
    );
    const text = readChunkText(
      chunk.text,
      `nutrientChunks[${index}].text`,
      AUXO_MAX_CHUNK_CHARS,
    );
    const key = sourceKey(nutrientId, chunkId);
    if (seenChunks.has(key)) {
      throw new AuxoValidationError("DUPLICATE_CHUNK", `资料片段 ${chunkId} 重复。`);
    }
    const existingName = nutrientNames.get(nutrientId);
    if (existingName && existingName !== nutrientName) {
      throw new AuxoValidationError(
        "NUTRIENT_NAME_MISMATCH",
        `Nutrient ${nutrientId} 的名称不一致。`,
      );
    }
    const expectedOffset = nextChunkOffset.get(nutrientId) ?? 0;
    if (offset !== expectedOffset) {
      throw new AuxoValidationError(
        "NON_CONTIGUOUS_CHUNKS",
        `Nutrient ${nutrientId} 的片段不是从 0 开始的连续无损切片。`,
      );
    }
    seenChunks.add(key);
    nutrientNames.set(nutrientId, nutrientName);
    nextChunkOffset.set(nutrientId, offset + text.length);
    nutrientDocuments.set(
      nutrientId,
      (nutrientDocuments.get(nutrientId) ?? "") + text,
    );
    totalChars += text.length;
    return { nutrientId, nutrientName, chunkId, offset, text };
  });

  if (totalChars > AUXO_MAX_NUTRIENT_CHARS) {
    throw new AuxoValidationError(
      "NUTRIENT_BUDGET_EXCEEDED",
      `Nutrient 正文超过 ${AUXO_MAX_NUTRIENT_CHARS.toLocaleString()} 字。`,
    );
  }
  if (!Array.isArray(object.sourceUnits)) {
    throw new AuxoValidationError("INVALID_SOURCE_UNITS", "sourceUnits 必须是数组。");
  }
  if (object.sourceUnits.length > AUXO_MAX_NODES) {
    throw new AuxoValidationError(
      "SOURCE_UNIT_BUDGET_EXCEEDED",
      `明确题目超过 ${AUXO_MAX_NODES} 个。`,
    );
  }

  const seenUnitIds = new Set<string>();
  const previousSpanBySource = new Map<string, { end: number }>();
  const sourceUnits = object.sourceUnits.map((rawUnit, index): AuxoSourceUnit => {
    const unit = asObject(rawUnit, `sourceUnits[${index}] 必须是对象。`);
    const unitId = readIdentifier(unit.unitId, `sourceUnits[${index}].unitId`, 64);
    if (seenUnitIds.has(unitId)) {
      throw new AuxoValidationError("DUPLICATE_SOURCE_UNIT", `题目单元 ${unitId} 重复。`);
    }
    seenUnitIds.add(unitId);
    const order = readInteger(unit.order, `sourceUnits[${index}].order`);
    if (order !== index + 1) {
      throw new AuxoValidationError(
        "INCOMPLETE_SOURCE_ORDER",
        "题目单元必须按从 1 开始的连续顺序提交。",
      );
    }
    const offset = readNonNegativeInteger(unit.offset, `sourceUnits[${index}].offset`);
    const text = readSourceText(
      unit.text,
      `sourceUnits[${index}].text`,
      AUXO_MAX_SOURCE_UNIT_CHARS,
    );

    if (unit.kind === "root") {
      if (rootTask.slice(offset, offset + text.length) !== text) {
        throw new AuxoValidationError(
          "SOURCE_MISMATCH",
          `题目单元 ${unitId} 未逐字出现在根任务的指定位置。`,
        );
      }
      assertNonOverlappingSourceSpan(previousSpanBySource, "root", offset, text.length, unitId);
      return { unitId, kind: "root", text, offset, order };
    }

    if (unit.kind === "nutrient") {
      const nutrientId = readIdentifier(
        unit.nutrientId,
        `sourceUnits[${index}].nutrientId`,
        128,
      );
      const nutrientName = readText(
        unit.nutrientName,
        `sourceUnits[${index}].nutrientName`,
        AUXO_MAX_NAME_CHARS,
        false,
      );
      const expectedName = nutrientNames.get(nutrientId);
      if (!expectedName || expectedName !== nutrientName) {
        throw new AuxoValidationError(
          "SOURCE_NUTRIENT_MISSING",
          `题目单元 ${unitId} 指向了未提交的 Nutrient。`,
        );
      }
      const nutrientDocument = nutrientDocuments.get(nutrientId) ?? "";
      if (nutrientDocument.slice(offset, offset + text.length) !== text) {
        throw new AuxoValidationError(
          "SOURCE_MISMATCH",
          `题目单元 ${unitId} 未逐字出现在指定 Nutrient 的提交内容中。`,
        );
      }
      assertNonOverlappingSourceSpan(
        previousSpanBySource,
        `nutrient:${nutrientId}`,
        offset,
        text.length,
        unitId,
      );
      return {
        unitId,
        kind: "nutrient",
        nutrientId,
        nutrientName,
        text,
        offset,
        order,
      };
    }

    throw new AuxoValidationError(
      "INVALID_SOURCE_KIND",
      `题目单元 ${unitId} 的 kind 必须是 root 或 nutrient。`,
    );
  });

  return { rootTask, nutrientChunks, sourceUnits };
}

function assertNonOverlappingSourceSpan(
  spans: Map<string, { end: number }>,
  sourceId: string,
  offset: number,
  length: number,
  unitId: string,
): void {
  const previous = spans.get(sourceId);
  if (previous && offset < previous.end) {
    throw new AuxoValidationError(
      "OVERLAPPING_SOURCE_UNITS",
      `题目单元 ${unitId} 与前一个题目单元重叠。`,
    );
  }
  spans.set(sourceId, { end: offset + length });
}

function sourceKey(nutrientId: string, chunkId: string): string {
  return `${nutrientId}\u0000${chunkId}`;
}

// ---------------------------------------------------------------------------
// Plan validation
// ---------------------------------------------------------------------------

export function parseAuxoPlan(
  raw: string,
  request: AuxoRequest,
  metadata: { generatedAt: number; model: string },
): AuxoPlan {
  const value = parseJsonObject(raw);
  return validateAuxoPlan(value, request, metadata);
}

/**
 * Validates a model-produced plan against the (re-validated) request. Accepts
 * only when the plan tree is well-formed, its `order` values equal DFS
 * preorder, and every source unit is covered by exactly one atomic task in
 * source order. Throws AuxoValidationError otherwise — callers create tree
 * nodes only after this returns, so a rejected plan writes nothing.
 */
export function validateAuxoPlan(
  value: unknown,
  request: AuxoRequest,
  metadata?: { generatedAt: number; model: string },
): AuxoPlan {
  const normalizedRequest = validateAuxoRequest(request);
  const object = asObject(value, "Auxo 返回内容必须是 JSON 对象。");
  assertOnlyKeys(object, ["version", "nodes", "generatedAt", "model"], "Auxo 计划");
  if (object.version !== 1) {
    throw new AuxoValidationError("INVALID_PLAN_VERSION", "Auxo 计划版本必须为 1。");
  }
  if (!Array.isArray(object.nodes)) {
    throw new AuxoValidationError("INVALID_PLAN_NODES", "Auxo 计划缺少 nodes 数组。");
  }
  if (object.nodes.length === 0) {
    throw new AuxoValidationError("EMPTY_PLAN", "Auxo 没有返回任何任务节点。");
  }
  if (object.nodes.length > AUXO_MAX_NODES) {
    throw new AuxoValidationError(
      "PLAN_TOO_LARGE",
      `Auxo 返回了 ${object.nodes.length} 个节点，超过 ${AUXO_MAX_NODES} 个上限。`,
    );
  }

  const sourceUnits = new Map(
    normalizedRequest.sourceUnits.map((unit) => [unit.unitId, unit] as const),
  );
  const nodes = object.nodes.map((rawNode, index) =>
    normalizePlanNode(rawNode, index, sourceUnits),
  );

  assertAuxoPlanNodes(nodes);
  assertSourceUnitCoverage(nodes, normalizedRequest.sourceUnits);

  const generatedAt = metadata?.generatedAt ?? readFiniteNumber(object.generatedAt, "generatedAt");
  const model = metadata?.model ?? readText(object.model, "model", 120, false);
  if (!Number.isFinite(generatedAt) || generatedAt <= 0) {
    throw new AuxoValidationError("INVALID_METADATA", "Auxo 计划缺少有效生成时间。");
  }

  return {
    version: 1,
    generatedAt,
    model,
    nodes: sortedByOrder(nodes),
  };
}

export function assertAuxoPlanStructure(plan: AuxoPlan): void {
  if (
    !plan ||
    plan.version !== 1 ||
    !Number.isFinite(plan.generatedAt) ||
    typeof plan.model !== "string" ||
    !plan.model.trim() ||
    !Array.isArray(plan.nodes)
  ) {
    throw new AuxoValidationError("INVALID_PLAN", "Auxo 计划元数据无效。");
  }
  assertAuxoPlanNodes(plan.nodes);
}

function normalizePlanNode(
  value: unknown,
  index: number,
  sourceUnits: Map<string, AuxoSourceUnit>,
): AuxoPlanNode {
  const object = asObject(value, `nodes[${index}] 必须是对象。`);
  assertOnlyKeys(
    object,
    ["planId", "parentPlanId", "nodeRole", "title", "order", "sourceUnitId", "source"],
    `nodes[${index}]`,
  );
  const planId = readPlanId(object.planId, `nodes[${index}].planId`);
  const parentPlanId =
    object.parentPlanId === "root"
      ? "root"
      : readPlanId(object.parentPlanId, `nodes[${index}].parentPlanId`);
  if (object.nodeRole !== "task-group" && object.nodeRole !== "task") {
    throw new AuxoValidationError(
      "INVALID_NODE_ROLE",
      `节点 ${planId} 的 nodeRole 必须是 task-group 或 task。`,
    );
  }
  const title = readText(object.title, `节点 ${planId} 的 title`, AUXO_MAX_TITLE_CHARS, true);
  const order = readInteger(object.order, `节点 ${planId} 的 order`);
  const sourceUnitId =
    object.sourceUnitId === undefined || object.sourceUnitId === null
      ? undefined
      : readIdentifier(object.sourceUnitId, `节点 ${planId} 的 sourceUnitId`, 64);
  if (object.nodeRole === "task-group" && sourceUnitId) {
    throw new AuxoValidationError(
      "GROUP_HAS_SOURCE",
      `任务组 ${planId} 不能占用明确题目单元。`,
    );
  }
  const unit = sourceUnitId ? sourceUnits.get(sourceUnitId) : undefined;
  if (sourceUnitId && !unit) {
    throw new AuxoValidationError(
      "UNKNOWN_SOURCE_UNIT",
      `节点 ${planId} 引用了不存在的题目单元 ${sourceUnitId}。`,
    );
  }
  // The source reference is always rebuilt from the validated unit — never
  // taken from the model output — so quotes and offsets stay verbatim.
  const source = unit ? sourceReferenceFromUnit(unit) : undefined;

  return {
    planId,
    parentPlanId,
    nodeRole: object.nodeRole,
    title,
    order,
    sourceUnitId,
    source,
  };
}

function sourceReferenceFromUnit(unit: AuxoSourceUnit): AuxoSourceReference {
  if (unit.kind === "root") {
    return {
      kind: "root",
      unitId: unit.unitId,
      exactQuote: unit.text,
      offset: unit.offset,
      order: unit.order,
    };
  }
  return {
    kind: "nutrient",
    unitId: unit.unitId,
    nutrientId: unit.nutrientId,
    nutrientName: unit.nutrientName,
    exactQuote: unit.text,
    offset: unit.offset,
    order: unit.order,
  };
}

function assertAuxoPlanNodes(nodes: AuxoPlanNode[]): void {
  if (nodes.length === 0 || nodes.length > AUXO_MAX_NODES) {
    throw new AuxoValidationError(
      "PLAN_TOO_LARGE",
      `Auxo 计划必须包含 1–${AUXO_MAX_NODES} 个节点。`,
    );
  }

  const byId = new Map<string, AuxoPlanNode>();
  const orders = new Set<number>();
  for (const node of nodes) {
    if (!PLAN_ID_PATTERN.test(node.planId)) {
      throw new AuxoValidationError("INVALID_PLAN_ID", `计划 ID「${node.planId}」格式无效。`);
    }
    if (byId.has(node.planId)) {
      throw new AuxoValidationError("DUPLICATE_PLAN_ID", `计划 ID「${node.planId}」重复。`);
    }
    if (node.parentPlanId !== "root" && !PLAN_ID_PATTERN.test(node.parentPlanId)) {
      throw new AuxoValidationError(
        "INVALID_PARENT_ID",
        `节点 ${node.planId} 的父计划 ID 格式无效。`,
      );
    }
    if (node.nodeRole !== "task-group" && node.nodeRole !== "task") {
      throw new AuxoValidationError("INVALID_NODE_ROLE", `节点 ${node.planId} 的角色无效。`);
    }
    if (!isBoundedText(node.title, AUXO_MAX_TITLE_CHARS)) {
      throw new AuxoValidationError("INVALID_TITLE", `节点 ${node.planId} 的标题为空或过长。`);
    }
    if (!Number.isInteger(node.order) || node.order < 1 || node.order > nodes.length) {
      throw new AuxoValidationError("INVALID_ORDER", `节点 ${node.planId} 的顺序编号无效。`);
    }
    if (orders.has(node.order)) {
      throw new AuxoValidationError("DUPLICATE_ORDER", `顺序编号 ${node.order} 重复。`);
    }
    if (node.nodeRole === "task-group" && (node.sourceUnitId || node.source)) {
      throw new AuxoValidationError("GROUP_HAS_SOURCE", `任务组 ${node.planId} 不能引用题目单元。`);
    }
    if (node.nodeRole === "task") assertNormalizedSource(node);
    orders.add(node.order);
    byId.set(node.planId, node);
  }

  for (let order = 1; order <= nodes.length; order++) {
    if (!orders.has(order)) {
      throw new AuxoValidationError("INCOMPLETE_ORDER", `计划缺少顺序编号 ${order}。`);
    }
  }

  const childCounts = new Map<string, number>();
  const depthCache = new Map<string, number>();
  for (const node of nodes) {
    if (node.parentPlanId !== "root") {
      const parent = byId.get(node.parentPlanId);
      if (!parent) {
        throw new AuxoValidationError(
          "MISSING_PARENT",
          `节点 ${node.planId} 的父节点 ${node.parentPlanId} 不存在。`,
        );
      }
      if (parent.order >= node.order) {
        throw new AuxoValidationError(
          "INVALID_ORDER",
          `节点 ${node.planId} 必须排在父节点之后。`,
        );
      }
      childCounts.set(parent.planId, (childCounts.get(parent.planId) ?? 0) + 1);
    }
    const depth = resolveDepth(node, byId, depthCache, new Set());
    if (depth > AUXO_MAX_DEPTH) {
      throw new AuxoValidationError(
        "PLAN_TOO_DEEP",
        `节点 ${node.planId} 位于第 ${depth} 层，超过 ${AUXO_MAX_DEPTH} 层上限。`,
      );
    }
  }

  for (const node of nodes) {
    const childCount = childCounts.get(node.planId) ?? 0;
    if (node.nodeRole === "task" && childCount > 0) {
      throw new AuxoValidationError(
        "TASK_HAS_CHILDREN",
        `原子任务 ${node.planId} 不能再包含计划子节点。`,
      );
    }
    if (node.nodeRole === "task-group" && childCount === 0) {
      throw new AuxoValidationError(
        "EMPTY_TASK_GROUP",
        `任务组 ${node.planId} 至少需要一个子任务。`,
      );
    }
  }

  assertPlanIsPreorder(nodes, byId);

  const taskKeys = new Set<string>();
  const siblingTitles = new Set<string>();
  for (const node of sortedByOrder(nodes)) {
    const normalizedTitle = normalizeDuplicateKey(node.title);
    const siblingKey = `${node.parentPlanId}\u0000${normalizedTitle}`;
    if (siblingTitles.has(siblingKey)) {
      throw new AuxoValidationError(
        "DUPLICATE_SIBLING",
        `同一父节点下出现重复任务「${node.title}」。`,
      );
    }
    siblingTitles.add(siblingKey);

    if (node.nodeRole === "task") {
      const taskKey = node.sourceUnitId
        ? `source:${node.sourceUnitId}`
        : `derived:${normalizeDuplicateKey(node.title)}`;
      if (taskKeys.has(taskKey)) {
        if (node.sourceUnitId) {
          throw new AuxoValidationError(
            "DUPLICATE_SOURCE_UNIT",
            `题目单元 ${node.sourceUnitId} 被重复规划。`,
          );
        }
        throw new AuxoValidationError("DUPLICATE_TASK", `原子任务「${node.title}」重复。`);
      }
      taskKeys.add(taskKey);
    }
  }

  if (!nodes.some((node) => node.nodeRole === "task")) {
    throw new AuxoValidationError("NO_ATOMIC_TASK", "Auxo 计划至少需要一个原子任务。");
  }
}

function assertNormalizedSource(node: AuxoPlanNode): void {
  if (!node.sourceUnitId && !node.source) return;
  if (!node.sourceUnitId || !node.source || node.source.unitId !== node.sourceUnitId) {
    throw new AuxoValidationError(
      "INVALID_SOURCE",
      `原子任务 ${node.planId} 的题目单元引用不一致。`,
    );
  }
  if (!isBoundedText(node.source.exactQuote, AUXO_MAX_SOURCE_UNIT_CHARS)) {
    throw new AuxoValidationError("INVALID_SOURCE", `原子任务 ${node.planId} 的原文无效。`);
  }
  if (
    !Number.isInteger(node.source.offset) ||
    node.source.offset < 0 ||
    !Number.isInteger(node.source.order) ||
    node.source.order < 1
  ) {
    throw new AuxoValidationError("INVALID_SOURCE", `原子任务 ${node.planId} 的来源位置无效。`);
  }
  if (node.source.kind === "nutrient") {
    if (
      !node.source.nutrientId.trim() ||
      !node.source.nutrientName.trim()
    ) {
      throw new AuxoValidationError("INVALID_SOURCE", `原子任务 ${node.planId} 的资料来源无效。`);
    }
  } else if (node.source.kind !== "root") {
    throw new AuxoValidationError("INVALID_SOURCE", `原子任务 ${node.planId} 的来源类型无效。`);
  }
}

/** Plan `order` sequence must equal the DFS preorder walk of the plan tree. */
function assertPlanIsPreorder(
  nodes: AuxoPlanNode[],
  byId: Map<string, AuxoPlanNode>,
): void {
  const childrenByParent = new Map<string, AuxoPlanNode[]>();
  for (const node of nodes) {
    const children = childrenByParent.get(node.parentPlanId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentPlanId, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.order - b.order);
  }

  const preorder: string[] = [];
  const visit = (node: AuxoPlanNode) => {
    preorder.push(node.planId);
    for (const child of childrenByParent.get(node.planId) ?? []) visit(child);
  };
  for (const rootChild of childrenByParent.get("root") ?? []) visit(rootChild);

  const ordered = sortedByOrder(nodes).map((node) => node.planId);
  if (
    preorder.length !== byId.size ||
    ordered.some((planId, index) => preorder[index] !== planId)
  ) {
    throw new AuxoValidationError(
      "ORDER_NOT_PREORDER",
      "Auxo 节点顺序必须与任务树的深度优先前序一致。",
    );
  }
}

/**
 * Every source unit must be claimed by exactly one atomic task, and the tasks
 * must reference the units in their original source order.
 */
function assertSourceUnitCoverage(nodes: AuxoPlanNode[], sourceUnits: AuxoSourceUnit[]): void {
  const orderedUnits = sortedByOrder(sourceUnits);
  const seen = new Set<string>();
  const referenced: string[] = [];

  for (const node of sortedByOrder(nodes)) {
    if (node.nodeRole !== "task" || !node.sourceUnitId) continue;
    if (seen.has(node.sourceUnitId)) {
      throw new AuxoValidationError(
        "DUPLICATE_SOURCE_UNIT",
        `题目单元 ${node.sourceUnitId} 被重复规划。`,
      );
    }
    seen.add(node.sourceUnitId);
    referenced.push(node.sourceUnitId);
  }

  const missing = orderedUnits.filter((unit) => !seen.has(unit.unitId));
  if (missing.length > 0) {
    throw new AuxoValidationError(
      "SOURCE_UNIT_OMITTED",
      `Auxo 遗漏了 ${missing.length} 个明确题目（首个：${missing[0].unitId}）。`,
    );
  }
  if (
    referenced.length !== orderedUnits.length ||
    referenced.some((unitId, index) => unitId !== orderedUnits[index]?.unitId)
  ) {
    throw new AuxoValidationError(
      "SOURCE_ORDER_CHANGED",
      "Auxo 改变了明确题目在原资料中的顺序。",
    );
  }
}

function resolveDepth(
  node: AuxoPlanNode,
  byId: Map<string, AuxoPlanNode>,
  cache: Map<string, number>,
  visiting: Set<string>,
): number {
  const cached = cache.get(node.planId);
  if (cached) return cached;
  if (visiting.has(node.planId)) {
    throw new AuxoValidationError("PLAN_CYCLE", `计划在节点 ${node.planId} 形成循环。`);
  }
  visiting.add(node.planId);
  let depth = 1;
  if (node.parentPlanId !== "root") {
    const parent = byId.get(node.parentPlanId);
    if (!parent) {
      throw new AuxoValidationError(
        "MISSING_PARENT",
        `节点 ${node.planId} 的父节点 ${node.parentPlanId} 不存在。`,
      );
    }
    depth = 1 + resolveDepth(parent, byId, cache, visiting);
  }
  visiting.delete(node.planId);
  cache.set(node.planId, depth);
  return depth;
}

function sortedByOrder<T extends { order: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AuxoValidationError("EMPTY_RESPONSE", "Auxo 未返回计划内容。");
  }
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
      // Try the next bounded candidate.
    }
  }
  throw new AuxoValidationError("INVALID_JSON", "Auxo 返回了无效 JSON。");
}

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

/**
 * Dual 32-bit hash over the serialized request. Fingerprints are persisted in
 * Auxo generation manifests, so the algorithm and the `auxo-v1-` format must
 * stay stable across releases.
 */
export function fingerprintAuxoInput(request: AuxoRequest): string {
  const serialized = JSON.stringify(request);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index++) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `auxo-v1-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}-${serialized.length}`;
}

// ---------------------------------------------------------------------------
// Validation primitives (shared field readers)
// ---------------------------------------------------------------------------

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuxoValidationError("INVALID_OBJECT", message);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  object: Record<string, unknown>,
  allowed: string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(object).find((key) => !allowedSet.has(key));
  if (unexpected) {
    throw new AuxoValidationError(
      "UNEXPECTED_FIELD",
      `${label} 包含不允许的字段 ${unexpected}。`,
    );
  }
}

function readPlanId(value: unknown, field: string): string {
  if (typeof value !== "string" || !PLAN_ID_PATTERN.test(value)) {
    throw new AuxoValidationError("INVALID_PLAN_ID", `${field} 格式无效。`);
  }
  return value;
}

function readIdentifier(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new AuxoValidationError("INVALID_IDENTIFIER", `${field} 必须是字符串。`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new AuxoValidationError("INVALID_IDENTIFIER", `${field} 格式无效。`);
  }
  return normalized;
}

function readText(
  value: unknown,
  field: string,
  maxLength: number,
  collapseWhitespace: boolean,
): string {
  if (typeof value !== "string") {
    throw new AuxoValidationError("INVALID_TEXT", `${field} 必须是字符串。`);
  }
  const withoutControls = value.replace(CONTROL_CHARACTER_PATTERN_GLOBAL, " ");
  const normalized = (collapseWhitespace ? withoutControls.replace(/\s+/g, " ") : withoutControls).trim();
  if (!normalized) {
    throw new AuxoValidationError("EMPTY_TEXT", `${field} 不能为空。`);
  }
  if (normalized.length > maxLength) {
    throw new AuxoValidationError("TEXT_TOO_LONG", `${field} 超过 ${maxLength} 字。`);
  }
  return normalized;
}

/** Shared first pass for verbatim text fields: string type + control chars. */
function readRawSourceString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new AuxoValidationError("INVALID_SOURCE_TEXT", `${field} 必须是字符串。`);
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new AuxoValidationError("INVALID_SOURCE_TEXT", `${field} 包含无效控制字符。`);
  }
  return value;
}

function readSourceText(value: unknown, field: string, maxLength: number): string {
  const normalized = normalizeSourceDocument(readRawSourceString(value, field));
  if (!normalized) {
    throw new AuxoValidationError("EMPTY_SOURCE_TEXT", `${field} 不能为空。`);
  }
  assertSourceTextWithinBudget(normalized, field, maxLength);
  return normalized;
}

function readChunkText(value: unknown, field: string, maxLength: number): string {
  // Chunks keep surrounding whitespace (offsets must stay lossless); only line
  // endings are normalized.
  const normalized = readRawSourceString(value, field).replace(/\r\n?/g, "\n");
  if (!normalized || !normalized.trim()) {
    throw new AuxoValidationError("EMPTY_SOURCE_TEXT", `${field} 不能为空。`);
  }
  assertSourceTextWithinBudget(normalized, field, maxLength);
  return normalized;
}

function assertSourceTextWithinBudget(
  text: string,
  field: string,
  maxLength: number,
): void {
  if (text.length > maxLength) {
    throw new AuxoValidationError("SOURCE_TEXT_TOO_LONG", `${field} 超过 ${maxLength} 字。`);
  }
}

function readInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AuxoValidationError("INVALID_INTEGER", `${field} 必须是整数。`);
  }
  return value;
}

function readNonNegativeInteger(value: unknown, field: string): number {
  const integer = readInteger(value, field);
  if (integer < 0) {
    throw new AuxoValidationError("INVALID_INTEGER", `${field} 不能为负数。`);
  }
  return integer;
}

function readFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AuxoValidationError("INVALID_NUMBER", `${field} 必须是有效数字。`);
  }
  return value;
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maxLength;
}

function normalizeDuplicateKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}
