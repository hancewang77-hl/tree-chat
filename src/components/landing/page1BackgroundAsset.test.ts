import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const PAGE1_BACKGROUND_PATH = resolve(
  process.cwd(),
  "public/assets/landing/page1-tree-background.png",
);
const PAGE1_BACKGROUND_SHA256 =
  "D949942FF9641D0868C5646C62C92E5CC339EC94953260EDE92A84C11085A761";

describe("Page 1 background asset", () => {
  test("keeps the approved PNG dimensions and content hash", () => {
    expect(
      existsSync(PAGE1_BACKGROUND_PATH),
      "public/assets/landing/page1-tree-background.png must exist",
    ).toBe(true);

    const bytes = readFileSync(PAGE1_BACKGROUND_PATH);

    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(bytes.readUInt32BE(16)).toBe(1672);
    expect(bytes.readUInt32BE(20)).toBe(941);
    expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(
      PAGE1_BACKGROUND_SHA256,
    );
  });
});
