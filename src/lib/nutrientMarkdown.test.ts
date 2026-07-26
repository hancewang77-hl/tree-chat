import { strToU8, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import {
  extractFileAsMarkdown,
  markFirstTableRowsAsHeaders,
  MAX_NUTRIENT_FILE_BYTES,
  UnsupportedNutrientFormatError,
} from "./nutrientMarkdown";

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
