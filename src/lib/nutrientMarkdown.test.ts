import { strToU8, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import {
  extractFileAsMarkdown,
  MAX_NUTRIENT_FILE_BYTES,
  UnsupportedNutrientFormatError,
} from "./nutrientMarkdown";

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
