const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const LEGACY_DOC_MIME = "application/msword";
const PDF_MIME = "application/pdf";
const HTML_EXTENSIONS = new Set(["html", "htm"]);
const CODE_FENCE_LANGUAGES: Record<string, string> = {
  csv: "csv",
  json: "json",
  log: "text",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

export const MAX_EXTRACTED_MARKDOWN_CHARS = 200_000;
export const MAX_PDF_PAGES = 200;
export const MAX_NUTRIENT_FILE_BYTES = 10 * 1024 * 1024;

const MAX_DOCX_ARCHIVE_ENTRIES = 2_000;
const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_DOCX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_DOCX_COMPRESSION_RATIO = 200;
const MAX_PDF_EXTRACTION_MS = 20_000;
// Generous per-page text-item ceiling, far above any legitimate page. The
// per-page/time caps below are checked only between pages, so one pathological
// page could otherwise exhaust memory/time before the loop re-checks; this
// bounds a single page's item count before the expensive map/join.
const MAX_PDF_PAGE_ITEMS = 500_000;

export type MarkdownExtraction = {
  markdown: string;
  kind: "text" | "document";
};

export class UnsupportedNutrientFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedNutrientFormatError";
  }
}

export async function extractFileAsMarkdown(file: File): Promise<MarkdownExtraction> {
  if (file.size > MAX_NUTRIENT_FILE_BYTES) {
    throw new UnsupportedNutrientFormatError(
      "文件超过 10MB 上限，请拆分或压缩后重新上传。",
    );
  }

  const extension = extensionOf(file.name);
  let result: MarkdownExtraction;

  if (isDocx(file, extension)) {
    result = {
      kind: "document",
      markdown: await extractDocxMarkdown(file),
    };
  } else if (isPdf(file, extension)) {
    result = {
      kind: "document",
      markdown: await extractPdfMarkdown(file),
    };
  } else if (extension === "doc" || file.type === LEGACY_DOC_MIME) {
    throw new UnsupportedNutrientFormatError(
      "旧版 .doc 暂时无法可靠解析，请在 Word 中另存为 .docx 后重新上传。",
    );
  } else if (HTML_EXTENSIONS.has(extension) || file.type === "text/html") {
    result = {
      kind: "text",
      markdown: await htmlToMarkdown(await file.text()),
    };
  } else if (isTextLike(file, extension)) {
    const text = await file.text();
    result = {
      kind: "text",
      markdown: MARKDOWN_EXTENSIONS.has(extension)
        ? normalizeMarkdown(text)
        : textToMarkdown(text, extension),
    };
  } else {
    throw new UnsupportedNutrientFormatError(
      "当前文件类型无法转换为 Markdown；支持 Markdown、文本、HTML、DOCX 和带文字层的 PDF。",
    );
  }

  const markdown = normalizeMarkdown(result.markdown);
  if (!hasReadableMarkdownContent(markdown)) {
    throw new UnsupportedNutrientFormatError("文件中未检测到可提取文字。请检查文件内容后重试。");
  }
  if (markdown.length > MAX_EXTRACTED_MARKDOWN_CHARS) {
    throw new UnsupportedNutrientFormatError(
      "转换后的 Markdown 超过 20 万字符，请拆分文件后重新上传。",
    );
  }

  return { ...result, markdown };
}

async function extractDocxMarkdown(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    assertSafeDocxArchive(arrayBuffer);
    const mammothModule = await import("mammoth");
    const mammoth = mammothModule.default;
    const input =
      typeof window === "undefined"
        ? { buffer: Buffer.from(arrayBuffer) }
        : { arrayBuffer };
    const result = await mammoth.convertToHtml(
      input,
      {
        externalFileAccess: false,
        styleMap: [
          "p[style-name='标题 1'] => h1:fresh",
          "p[style-name='标题 2'] => h2:fresh",
          "p[style-name='标题 3'] => h3:fresh",
        ],
        convertImage: mammoth.images.imgElement(async () => ({
          src: "nutrient-image://omitted",
        })),
      },
    );
    const markdown = await htmlToMarkdown(result.value);
    if (!hasReadableMarkdownContent(markdown)) {
      throw new UnsupportedNutrientFormatError(
        "Word 文件中未检测到可提取文字；空文档或仅含图片的文档暂不支持。",
      );
    }
    return markdown;
  } catch (error) {
    if (error instanceof UnsupportedNutrientFormatError) throw error;
    throw new Error("DOCX 解析失败，文件可能损坏或不是有效的 .docx。", {
      cause: error,
    });
  }
}

async function extractPdfMarkdown(file: File): Promise<string> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    try {
      if (pdf.numPages > MAX_PDF_PAGES) {
        throw new UnsupportedNutrientFormatError(
          `PDF 共 ${pdf.numPages} 页，超过 ${MAX_PDF_PAGES} 页上限，请拆分后重新上传。`,
        );
      }
      const startedAt = Date.now();
      const pageSections: string[] = [];
      let readablePageCount = 0;
      let extractedCharacterCount = 0;

      for (let index = 0; index < pdf.numPages; index += 1) {
        const page = await pdf.getPage(index + 1);
        let rawText = "";
        try {
          const content = await page.getTextContent();
          // Guard a single dense page before the expensive materialization:
          // the item-count and time budgets are otherwise only re-checked
          // between pages.
          if (content.items.length > MAX_PDF_PAGE_ITEMS) {
            throw new UnsupportedNutrientFormatError(
              "PDF 单页内容过于密集，请拆分或简化文件后重新上传。",
            );
          }
          if (Date.now() - startedAt > MAX_PDF_EXTRACTION_MS) {
            throw new UnsupportedNutrientFormatError(
              "PDF 本地解析超过 20 秒，请拆分或简化文件后重新上传。",
            );
          }
          rawText = content.items
            .map((item) =>
              "str" in item && typeof item.str === "string"
                ? item.str + (item.hasEOL ? "\n" : "")
                : "",
            )
            .join("");
        } finally {
          page.cleanup();
        }

        const pageText = normalizePdfPage(rawText);
        extractedCharacterCount += pageText.length;
        if (extractedCharacterCount > MAX_EXTRACTED_MARKDOWN_CHARS) {
          throw new UnsupportedNutrientFormatError(
            "PDF 提取出的文字超过 20 万字符，请拆分文件后重新上传。",
          );
        }
        if (hasReadableText(pageText)) readablePageCount += 1;
        pageSections.push(
          [`## 第 ${index + 1} 页`, pageText || "_[本页没有可提取文字]_"].join(
            "\n\n",
          ),
        );

        if (Date.now() - startedAt > MAX_PDF_EXTRACTION_MS) {
          throw new UnsupportedNutrientFormatError(
            "PDF 本地解析超过 20 秒，请拆分或简化文件后重新上传。",
          );
        }
      }

      if (readablePageCount === 0) {
        throw new UnsupportedNutrientFormatError(
          "PDF 未检测到可提取文字，可能是扫描件；当前版本不支持 OCR。",
        );
      }

      const safeName = file.name.replace(/[\r\n#]+/g, " ").trim() || "PDF 文档";
      return [`# ${safeName}`, ...pageSections].join("\n\n");
    } finally {
      await pdf.destroy().catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof UnsupportedNutrientFormatError) throw error;
    throw new Error("PDF 解析失败，文件可能已加密、损坏或不是有效的 PDF。", {
      cause: error,
    });
  }
}

async function htmlToMarkdown(html: string): Promise<string> {
  const [{ default: TurndownService }, { gfm }] = await Promise.all([
    import("turndown"),
    import("turndown-plugin-gfm"),
  ]);
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    strongDelimiter: "**",
  });
  service.use(gfm);
  service.addRule("docx-table-cell", {
    filter: ["th", "td"],
    replacement: (content, node) => {
      const cells = Array.from(node.parentElement?.children ?? []);
      const prefix = cells[0] === node ? "| " : " ";
      const normalized = content.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
      return `${prefix}${normalized} |`;
    },
  });
  service.remove(["script", "style", "iframe", "object", "embed"]);
  service.addRule("omitted-docx-image", {
    filter: "img",
    replacement: (_content, node) => {
      const alt = node.getAttribute("alt")?.trim();
      return `\n\n> [图片未提取${alt ? `：${alt}` : ""}]\n\n`;
    },
  });
  return normalizeMarkdown(service.turndown(markFirstTableRowsAsHeaders(html)));
}

function rewriteFirstRowCells(tableBlock: string): string {
  // Runs once on a single <table>…</table> slice, so its lazy scan is linear
  // in that block; total work stays O(n) across all tables.
  return tableBlock.replace(/<tr\b[\s\S]*?<\/tr>/i, (firstRow) =>
    firstRow
      .replace(/<td(\s[^>]*)?>/gi, "<th$1>")
      .replace(/<\/td>/gi, "</th>"),
  );
}

function isWordCharCode(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a-z (html is lower-cased for scanning)
    (code >= 48 && code <= 57) || // 0-9
    code === 95 // _
  );
}

/**
 * Promotes the first row of every table to header cells (<td> → <th>).
 *
 * Uses a linear indexOf scan rather than /<table\b[\s\S]*?<\/table>/g: the lazy
 * regex is O(n²) on hostile HTML (many "<table" with no "</table>" each rescan
 * to end of string), which would hang the tab on a crafted .html nutrient
 * upload. Output is identical to the old regex for all well-formed and
 * malformed inputs (verified by a differential test).
 */
export function markFirstTableRowsAsHeaders(html: string): string {
  const lower = html.toLowerCase();
  const CLOSE = "</table>";
  let result = "";
  let pos = 0;

  while (pos < html.length) {
    const tableStart = lower.indexOf("<table", pos);
    if (tableStart === -1) {
      result += html.slice(pos);
      break;
    }

    // Enforce the \b in /<table\b/: reject "<tablex" but accept "<table>",
    // "<table ", "<table\t". A "<table" at end-of-string has code NaN here,
    // which is not a word char, matching the regex's boundary-at-EOS behavior.
    if (isWordCharCode(lower.charCodeAt(tableStart + 6))) {
      result += html.slice(pos, tableStart + 6);
      pos = tableStart + 6;
      continue;
    }

    const closeRel = lower.indexOf(CLOSE, tableStart);
    if (closeRel === -1) {
      // No closing tag ahead: the old regex would not match, so emit verbatim.
      result += html.slice(pos);
      break;
    }

    const closeEnd = closeRel + CLOSE.length;
    result += html.slice(pos, tableStart) + rewriteFirstRowCells(html.slice(tableStart, closeEnd));
    pos = closeEnd;
  }

  return result;
}

function textToMarkdown(text: string, extension: string): string {
  const normalized = normalizePlainText(text);
  const language = CODE_FENCE_LANGUAGES[extension];
  if (!language) return normalized;
  const fence = normalized.includes("```") ? "````" : "```";
  return `${fence}${language}\n${normalized}\n${fence}`;
}

function normalizePdfPage(text: string): string {
  return normalizePlainText(text)
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizePlainText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
}

function hasReadableText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function hasReadableMarkdownContent(markdown: string): boolean {
  return hasReadableText(
    markdown.replace(/^> \[图片未提取(?:：[^\]]*)?\]$/gm, ""),
  );
}

/**
 * ZIP-bomb guard: walks the ZIP central directory BEFORE any byte is
 * decompressed (mammoth only runs after this passes). Enforced here:
 * - single-disk, non-ZIP64 archives only (0xffff / 0xffffffff sentinels and
 *   disk-split fields are rejected);
 * - at most MAX_DOCX_ARCHIVE_ENTRIES entries, each with a valid signature and
 *   in-bounds record;
 * - declared uncompressed sizes: per entry ≤ MAX_DOCX_ENTRY_BYTES, summed
 *   ≤ MAX_DOCX_UNCOMPRESSED_BYTES, per-entry ratio ≤ MAX_DOCX_COMPRESSION_RATIO.
 * Sizes come from the central directory, so an inflating bomb is rejected
 * from metadata alone.
 */
function assertSafeDocxArchive(arrayBuffer: ArrayBuffer): void {
  const view = new DataView(arrayBuffer);
  const eocdOffset = findZipEndOfCentralDirectory(view);
  if (eocdOffset < 0) throw new Error("DOCX ZIP directory was not found");

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== totalEntries ||
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new UnsupportedNutrientFormatError(
      "分卷或 ZIP64 格式的 DOCX 暂不支持，请另存为普通 .docx 后重试。",
    );
  }
  if (totalEntries > MAX_DOCX_ARCHIVE_ENTRIES) {
    throw new UnsupportedNutrientFormatError(
      "DOCX 内部文件数量异常，为保护浏览器已停止解析。",
    );
  }
  if (centralDirectoryOffset + centralDirectorySize > view.byteLength) {
    throw new Error("DOCX ZIP directory is truncated");
  }

  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("DOCX ZIP directory entry is invalid");
    }

    const compressedBytes = view.getUint32(offset + 20, true);
    const uncompressedBytes = view.getUint32(offset + 24, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);

    if (compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff) {
      throw new UnsupportedNutrientFormatError(
        "ZIP64 格式的 DOCX 暂不支持，请另存为普通 .docx 后重试。",
      );
    }
    if (uncompressedBytes > MAX_DOCX_ENTRY_BYTES) {
      throw new UnsupportedNutrientFormatError(
        "DOCX 解压后的单个内容过大，为保护浏览器已停止解析。",
      );
    }
    if (
      uncompressedBytes > 0 &&
      (compressedBytes === 0 || uncompressedBytes / compressedBytes > MAX_DOCX_COMPRESSION_RATIO)
    ) {
      throw new UnsupportedNutrientFormatError(
        "DOCX 解压比例异常，为保护浏览器已停止解析。",
      );
    }

    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
      throw new UnsupportedNutrientFormatError(
        "DOCX 解压后超过 50MB 安全上限，请拆分文档后重试。",
      );
    }

    offset += 46 + filenameLength + extraLength + commentLength;
  }
}

/**
 * Scans backwards for the end-of-central-directory signature (0x06054b50),
 * covering the maximum 0xffff-byte trailing ZIP comment.
 */
function findZipEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

function extensionOf(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension && extension !== filename.toLowerCase() ? extension : "";
}

function isDocx(file: File, extension: string): boolean {
  return extension === "docx" || file.type === DOCX_MIME;
}

function isPdf(file: File, extension: string): boolean {
  return extension === "pdf" || file.type === PDF_MIME;
}

function isTextLike(file: File, extension: string): boolean {
  return (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/xml" ||
    MARKDOWN_EXTENSIONS.has(extension) ||
    extension === "txt" ||
    extension in CODE_FENCE_LANGUAGES
  );
}
