import { strToU8, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import {
  assertDocxInflationSafe,
  extractFileAsMarkdown,
  markFirstTableRowsAsHeaders,
  MAX_NUTRIENT_FILE_BYTES,
  UnsupportedNutrientFormatError,
} from "./nutrientMarkdown";

/**
 * Overwrites the declared uncompressed size of the first central-directory
 * entry, simulating a bomb that lies to the metadata pre-screen (small declared
 * size) while its DEFLATE stream still inflates hugely. Returns a new buffer.
 */
function forgeDeclaredUncompressedSize(archive: Uint8Array, lie: number): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(archive.byteLength);
  const copy = new Uint8Array(buffer);
  copy.set(archive);
  const view = new DataView(buffer);
  // Locate the end-of-central-directory record (no trailing comment here).
  let eocd = copy.byteLength - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  const centralDirOffset = view.getUint32(eocd + 16, true);
  // First central-directory entry: uncompressedSize is at +24.
  view.setUint32(centralDirOffset + 24, lie, true);
  return copy;
}

// Reference implementation: the original regex-based version this function
// replaced. The linear rewrite must produce byte-identical output for every
// input; it only differs in being O(n) instead of O(n²).
function markFirstTableRowsAsHeaders_regexReference(html: string): string {
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (table) =>
    table.replace(/<tr\b[\s\S]*?<\/tr>/i, (firstRow) =>
      firstRow
        .replace(/<td(\s[^>]*)?>/gi, "<th$1>")
        .replace(/<\/td>/gi, "</th>"),
    ),
  );
}

describe("markFirstTableRowsAsHeaders (linear rewrite)", () => {
  const cases = [
    "",
    "no tables here",
    "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>",
    "<TABLE><TR><TD>x</TD></TR></TABLE>",
    "before <table><tr><td>h</td></tr></table> after",
    "<table class='x'><tr class='r'><td colspan=2>h</td></tr></table>",
    "<table><tr><td>1</td></tr></table><table><tr><td>2</td></tr></table>",
    "<tablex><tr><td>not a table tag</td></tr></tablex>",
    "<table><tr><td>unclosed table",
    "<table><tr><td>a</td></tr>",
    "text <table> no rows </table> text",
    "<table>\n<tr>\n<td>multi\nline</td>\n</tr>\n</table>",
    "<div><table><tr><td>nested</td></tr></table></div>",
    "<table><thead><tr><td>h</td></tr></thead><tbody><tr><td>b</td></tr></tbody></table>",
    "a<table b",
    "<table",
  ];

  test("produces identical output to the original regex on every sample", () => {
    for (const input of cases) {
      expect(markFirstTableRowsAsHeaders(input)).toBe(
        markFirstTableRowsAsHeaders_regexReference(input),
      );
    }
  });

  test("does not hang on adversarial input (many unclosed <table>)", () => {
    // The old regex was O(n²) here; the linear version returns immediately.
    const hostile = "<table>".repeat(50_000);
    const start = performance.now();
    const out = markFirstTableRowsAsHeaders(hostile);
    expect(performance.now() - start).toBeLessThan(500);
    // No closing tag → unchanged, matching the regex reference.
    expect(out).toBe(hostile);
  });
});

describe("nutrient Markdown safety budgets", () => {
  test("the library enforces the file-size limit even outside the composer UI", async () => {
    const file = new File(
      [new Uint8Array(MAX_NUTRIENT_FILE_BYTES + 1)],
      "oversized.txt",
      { type: "text/plain" },
    );

    await expect(extractFileAsMarkdown(file)).rejects.toMatchObject({
      name: "UnsupportedNutrientFormatError",
      message: expect.stringContaining("10MB"),
    });
  });

  test("a highly compressed DOCX entry is rejected before Mammoth expands it", async () => {
    const archive = zipSync(
      {
        "word/document.xml": strToU8("A".repeat(300_000)),
      },
      { level: 9 },
    );
    const file = new File([archive], "compressed-bomb.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await expect(extractFileAsMarkdown(file)).rejects.toEqual(
      expect.objectContaining<Partial<UnsupportedNutrientFormatError>>({
        name: "UnsupportedNutrientFormatError",
        message: expect.stringContaining("解压比例异常"),
      }),
    );
  });
});

describe("DOCX real-inflation guard (assertDocxInflationSafe)", () => {
  test("a normal small archive passes the inflation check", async () => {
    const archive = zipSync({
      "word/document.xml": strToU8("<w:document>hello world</w:document>"),
    });
    await expect(
      assertDocxInflationSafe(archive.buffer as ArrayBuffer),
    ).resolves.toBeUndefined();
  });

  test("actual inflation exceeding the per-entry cap is rejected", async () => {
    // ~21MB of 'A' compresses to a few KB, but really inflates past the 20MB
    // per-entry cap. The check streams and aborts at the cap.
    const archive = zipSync(
      { "word/document.xml": strToU8("A".repeat(21_000_000)) },
      { level: 9 },
    );
    await expect(
      assertDocxInflationSafe(archive.buffer as ArrayBuffer),
    ).rejects.toEqual(
      expect.objectContaining<Partial<UnsupportedNutrientFormatError>>({
        name: "UnsupportedNutrientFormatError",
        message: expect.stringContaining("安全上限"),
      }),
    );
  }, 15_000);

  test("a bomb that lies about its declared size still gets caught by real inflation", async () => {
    // Honest zip, then forge the declared uncompressed size down to 1KB so it
    // sails past the metadata pre-screen (size + ratio checks). The real stream
    // inflates to 21MB, which the inflation guard rejects.
    const honest = zipSync(
      { "word/document.xml": strToU8("A".repeat(21_000_000)) },
      { level: 9 },
    );
    const forged = forgeDeclaredUncompressedSize(honest, 1_000);
    const file = new File([forged], "lying-bomb.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await expect(extractFileAsMarkdown(file)).rejects.toEqual(
      expect.objectContaining<Partial<UnsupportedNutrientFormatError>>({
        name: "UnsupportedNutrientFormatError",
        message: expect.stringContaining("安全上限"),
      }),
    );
  }, 15_000);
});
