import { describe, expect, test } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  buildNutrientContext,
  chunkNutrientText,
  extractNutrientFromFile,
  selectRelevantNutrientChunks,
  summarizeNutrientText,
} from "./nutrients";
import { compileContext } from "./contextCompiler";
import { createRootSemanticCard } from "./semanticCard";
import type { MindNode, NutrientItem, Project } from "@/src/types/tree";

function nutrient(overrides: Partial<NutrientItem>): NutrientItem {
  return {
    id: "n-1",
    name: "notes.md",
    mimeType: "text/markdown",
    size: 32,
    kind: "text",
    createdAt: 1,
    extractionStatus: "ready",
    extractedText: "alpha beta gamma",
    excerpt: "alpha beta gamma",
    extractedCharCount: 16,
    ...overrides,
  };
}

describe("nutrients", () => {
  test("buildNutrientContext includes active ready documents and respects the character budget", () => {
    const context = buildNutrientContext(
      [
        nutrient({ id: "a", name: "a.md", extractedText: "A".repeat(16_000) }),
        nutrient({ id: "b", name: "b.md", extractedText: "B".repeat(16_000) }),
        nutrient({ id: "image", name: "photo.png", extractionStatus: "unsupported", extractedText: "" }),
      ],
      ["a", "b", "image"],
      20_000,
    );

    expect(context).toContain("Nutrients · 养分上下文");
    expect(context).toContain("a.md");
    expect(context).toContain("b.md");
    expect(context).not.toContain("photo.png");
    expect(context.length).toBeLessThanOrEqual(21_000);
  });

  test("extractNutrientFromFile marks text files ready", async () => {
    const file = new File(["hello nutrient"], "notes.txt", { type: "text/plain" });

    const item = await extractNutrientFromFile(file);

    expect(item.kind).toBe("text");
    expect(item.extractionStatus).toBe("ready");
    expect(item.extractedText).toBe("hello nutrient");
    expect(item.excerpt).toBe("hello nutrient");
  });

  test("非 Markdown 文本会先规范化为 Markdown", async () => {
    const file = new File(['{"task":"sprout"}'], "task.json", {
      type: "application/json",
    });

    const item = await extractNutrientFromFile(file);

    expect(item.extractionStatus).toBe("ready");
    expect(item.extractedText).toBe('```json\n{"task":"sprout"}\n```');
    expect(item.extractedCharCount).toBe(item.extractedText.length);
  });

  test("DOCX 会保留标题和正文语义并转换为 Markdown", async () => {
    const file = makeDocxFile({
      paragraphs: [
        { text: "根任务", style: "Heading1" },
        { text: "分析现有项目并形成实施步骤" },
      ],
      table: [
        ["模块", "负责人"],
        ["解析", "Codex"],
      ],
    });

    const item = await extractNutrientFromFile(file);

    expect(item.kind).toBe("document");
    expect(item.extractionStatus).toBe("ready");
    expect(item.extractedText).toContain("# 根任务");
    expect(item.extractedText).toContain("分析现有项目并形成实施步骤");
    expect(item.extractedText).toContain("| 模块 | 负责人 |");
    expect(item.extractedText).toContain("| 解析 | Codex |");
    expect(item.extractedCharCount).toBe(item.extractedText.length);
  }, 15_000);

  test("带文字层的 PDF 会按页转换为 Markdown", async () => {
    const file = makePdfFile("Hello Nutrient");

    const item = await extractNutrientFromFile(file);

    expect(item.kind).toBe("document");
    expect(item.extractionStatus).toBe("ready");
    expect(item.extractedText).toContain("# source.pdf");
    expect(item.extractedText).toContain("## 第 1 页");
    expect(item.extractedText).toContain("Hello Nutrient");
    expect(item.extractedText).not.toContain("%PDF");
  }, 15_000);

  test("空 DOCX 和无文字 PDF 不会伪装成可发送资料", async () => {
    const [emptyDocx, scannedPdf] = await Promise.all([
      extractNutrientFromFile(makeDocxFile({ paragraphs: [] })),
      extractNutrientFromFile(makePdfFile()),
    ]);

    expect(emptyDocx.extractionStatus).toBe("unsupported");
    expect(emptyDocx.extractedText).toBe("");
    expect(emptyDocx.excerpt).toContain("未检测到可提取文字");
    expect(scannedPdf.extractionStatus).toBe("unsupported");
    expect(scannedPdf.extractedText).toBe("");
    expect(scannedPdf.excerpt).toContain("不支持 OCR");
  }, 15_000);

  test("损坏文档与 legacy DOC 返回稳定状态和提示", async () => {
    const [brokenDocx, brokenPdf, legacyDoc] = await Promise.all([
      extractNutrientFromFile(
        new File(["not-a-zip"], "broken.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ),
      extractNutrientFromFile(
        new File(["%PDF-1.4\ninvalid"], "broken.pdf", { type: "application/pdf" }),
      ),
      extractNutrientFromFile(
        new File(["legacy"], "legacy.doc", { type: "application/msword" }),
      ),
    ]);

    expect(brokenDocx.extractionStatus).toBe("failed");
    expect(brokenDocx.excerpt).toContain("DOCX 解析失败");
    expect(brokenPdf.extractionStatus).toBe("failed");
    expect(brokenPdf.excerpt).toContain("PDF 解析失败");
    expect(legacyDoc.extractionStatus).toBe("unsupported");
    expect(legacyDoc.excerpt).toContain("另存为 .docx");
  }, 15_000);

  test("Context Compiler 只发送 PDF 转换后的 Markdown 字符串", async () => {
    const item = await extractNutrientFromFile(makePdfFile("Sprout source material"));
    expect(item.extractionStatus).toBe("ready");
    const root: MindNode = {
      id: "root",
      kind: "root",
      prompt: "规划 Sprout",
      response: "root",
      children: [],
      parentId: null,
      timestamp: 1,
      layer: 0,
      nutrientRefs: [],
      status: "complete",
      contextState: "valid",
      semanticCard: createRootSemanticCard("规划 Sprout", 1),
    };
    const project: Project = {
      id: "project",
      name: "project",
      rootNodeId: root.id,
      nodes: { [root.id]: root },
      nutrients: { [item.id]: item },
      activeNutrientIds: [item.id],
      createdAt: 1,
      updatedAt: 1,
    };

    const compiled = compileContext({
      project,
      selectedNodeId: root.id,
      prompt: "Summarize Sprout source material",
      model: "deepseek-chat",
      compiledAt: 2,
    });
    const userMessage = compiled.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n");

    expect(userMessage).toContain("## 第 1 页");
    expect(userMessage).toContain("Sprout source material");
    expect(userMessage).not.toContain("%PDF");
    expect(userMessage).not.toContain("base64");
  }, 15_000);

  test("extractNutrientFromFile preserves image metadata but does not claim AI-readable text", async () => {
    const file = new File(["fake"], "photo.png", { type: "image/png" });

    const item = await extractNutrientFromFile(file);

    expect(item.kind).toBe("image");
    expect(item.extractionStatus).toBe("unsupported");
    expect(item.extractedText).toBe("");
  });

  test("summarizeNutrientText compacts whitespace and limits excerpts", () => {
    expect(summarizeNutrientText("a\n\n  b\tc  ", 5)).toBe("a b c");
    expect(summarizeNutrientText("123456789", 5)).toBe("1234…");
  });

  test("资料分块编号稳定，相关性选择不再只取文件开头", () => {
    const item = nutrient({
      id: "long",
      name: "long.md",
      extractedText: `${"A".repeat(1590)}\n\n目标片段：租房通勤时间是 25 分钟。`,
    });

    const chunks = chunkNutrientText(item);
    const selected = selectRelevantNutrientChunks(
      [item],
      ["long"],
      "请分析租房通勤时间",
      500,
      2,
    );

    expect(chunks.map((chunk) => chunk.chunkId)).toEqual(["chunk-001", "chunk-002"]);
    expect(selected).toHaveLength(1);
    expect(selected[0].chunkId).toBe("chunk-002");
    expect(selected[0].text).toContain("25 分钟");
  });

  test("超长 JSON 代码块分块后每块都保持 fenced code 闭合", () => {
    const json = `{"payload":"${"x".repeat(4_800)}"}`;
    const chunks = chunkNutrientText(
      nutrient({
        id: "json",
        name: "large.json",
        extractedText: `\`\`\`json\n${json}\n\`\`\``,
      }),
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 1_600)).toBe(true);
    expect(chunks.every((chunk) => chunk.text.startsWith("```json\n"))).toBe(true);
    expect(chunks.every((chunk) => chunk.text.endsWith("\n```"))).toBe(true);
    expect(
      chunks
        .map((chunk) => chunk.text.slice("```json\n".length, -"\n```".length))
        .join(""),
    ).toBe(json);
  });

  test("超长 GFM 表格按数据行分块并重复表头和分隔行", () => {
    const header = "| 编号 | 内容 |";
    const separator = "| --- | --- |";
    const rows = Array.from(
      { length: 80 },
      (_, index) => `| row-${String(index + 1).padStart(3, "0")} | ${"表格内容".repeat(8)} |`,
    );
    const chunks = chunkNutrientText(
      nutrient({
        id: "table",
        name: "table.md",
        extractedText: [header, separator, ...rows].join("\n"),
      }),
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 1_600)).toBe(true);
    expect(
      chunks.every((chunk) => chunk.text.startsWith(`${header}\n${separator}\n`)),
    ).toBe(true);
    for (const row of rows) {
      expect(chunks.filter((chunk) => chunk.text.includes(row))).toHaveLength(1);
    }
  });

  test("极长表格单元格会拆成有表头的合法小表格", () => {
    const header = "| 编号 | 内容 |";
    const separator = "| --- | --- |";
    const chunks = chunkNutrientText(
      nutrient({
        id: "wide-table-cell",
        extractedText: `${header}\n${separator}\n| 1 | ${"x".repeat(4_800)} |`,
      }),
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 1_600)).toBe(true);
    expect(
      chunks.every((chunk) => chunk.text.startsWith(`${header}\n${separator}\n| `)),
    ).toBe(true);
    expect(
      chunks.reduce((count, chunk) => count + (chunk.text.match(/x/g)?.length ?? 0), 0),
    ).toBe(4_800);
  });

  test("表头本身超限时退化为硬切且不产生超长块", () => {
    const chunks = chunkNutrientText(
      nutrient({
        id: "wide-table-header",
        extractedText: `| ${"header".repeat(40)} |\n| --- |\n| value |`,
      }),
      32,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 32)).toBe(true);
  });

  test("超长 fence info 在小上限下改用最短闭合围栏", () => {
    const chunks = chunkNutrientText(
      nutrient({
        id: "long-fence-info",
        extractedText: `\`\`\`${"json".repeat(100)}\n${"x".repeat(40)}\n\`\`\``,
      }),
      12,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 12)).toBe(true);
    expect(chunks.every((chunk) => chunk.text.startsWith("```\n"))).toBe(true);
    expect(chunks.every((chunk) => chunk.text.endsWith("\n```"))).toBe(true);
  });

  test("连最短围栏都放不下时优先保证硬长度上限", () => {
    const chunks = chunkNutrientText(
      nutrient({ id: "tiny-fence", extractedText: "```txt\nabc\n```" }),
      4,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 4)).toBe(true);
  });

  test("超长 PDF 页正文分块时每块保留最近的页标题", () => {
    const chunks = chunkNutrientText(
      nutrient({
        id: "pdf",
        name: "source.pdf",
        extractedText: `# source.pdf\n\n## 第 1 页\n\n${"本页正文".repeat(1_200)}`,
      }),
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 1_600)).toBe(true);
    expect(chunks.every((chunk) => chunk.text.includes("## 第 1 页"))).toBe(true);
  });

  test("极小分块上限也能稳定前进", () => {
    const chunks = chunkNutrientText(
      nutrient({ id: "tiny", extractedText: "a b" }),
      1,
    );

    expect(chunks.map((chunk) => chunk.text)).toEqual(["a", "b"]);
  });

  test("未启用或不可读资料不会进入相关片段", () => {
    const disabled = nutrient({ id: "disabled", extractedText: "关键词" });
    const unsupported = nutrient({
      id: "unsupported",
      extractionStatus: "unsupported",
      extractedText: "关键词",
    });

    expect(
      selectRelevantNutrientChunks([disabled, unsupported], ["unsupported"], "关键词"),
    ).toEqual([]);
  });
});

function makeDocxFile({
  paragraphs,
  table,
}: {
  paragraphs: Array<{ text: string; style?: string }>;
  table?: string[][];
}): File {
  const documentBody = paragraphs
    .map(
      ({ text, style }) =>
        `<w:p>${
          style ? `<w:pPr><w:pStyle w:val="${escapeXml(style)}"/></w:pPr>` : ""
        }<w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`,
    )
    .join("");
  const tableBody = table
    ? `<w:tbl>${table
        .map(
          (row) =>
            `<w:tr>${row
              .map(
                (cell) =>
                  `<w:tc><w:tcPr/><w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`,
              )
              .join("")}</w:tr>`,
        )
        .join("")}</w:tbl>`
    : "";
  const archive = zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
      </Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>${documentBody}${tableBody}<w:sectPr/></w:body>
      </w:document>`,
    ),
    "word/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:style w:type="paragraph" w:styleId="Heading1">
          <w:name w:val="heading 1"/>
        </w:style>
      </w:styles>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      </Relationships>`,
    ),
  });
  return new File([archive], "source.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function makePdfFile(text?: string): File {
  const content = text
    ? `BT\n/F1 18 Tf\n72 720 Td\n(${escapePdfString(text)}) Tj\nET`
    : "q\n0 0 100 100 re\nf\nQ";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new File([pdf], "source.pdf", { type: "application/pdf" });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapePdfString(value: string): string {
  return value.replace(/([\\()])/g, "\\$1");
}
