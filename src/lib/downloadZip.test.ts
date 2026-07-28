import { describe, expect, test } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createZipBlob } from "./downloadZip";

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/** 从 ZIP 尾部解析 central directory，统计条目数与文件名。 */
function inspectZip(buffer: ArrayBuffer): { entryCount: number; names: string[] } {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocdSig = 0x06054b50;

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (readU32(view, i) === eocdSig) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("未找到 ZIP 结束记录");

  const entryCount = readU16(view, eocdOffset + 10);
  const centralSize = readU32(view, eocdOffset + 12);
  const centralOffset = readU32(view, eocdOffset + 16);

  const names: string[] = [];
  let pos = centralOffset;
  const centralEnd = centralOffset + centralSize;
  while (pos < centralEnd) {
    if (readU32(view, pos) !== 0x02014b50) break;
    const nameLen = readU16(view, pos + 28);
    const extraLen = readU16(view, pos + 30);
    const commentLen = readU16(view, pos + 32);
    const nameStart = pos + 46;
    const nameBytes = bytes.slice(nameStart, nameStart + nameLen);
    names.push(new TextDecoder().decode(nameBytes));
    pos = nameStart + nameLen + extraLen + commentLen;
  }

  return { entryCount, names };
}

describe("createZipBlob", () => {
  test("生成可被解析且含文件的 ZIP", async () => {
    const blob = createZipBlob([
      { path: "机器学习/根节点.md", content: "# 根\n\n正文\n" },
      { path: "机器学习/子节点.md", content: "# 子\n" },
    ]);

    expect(blob.size).toBeGreaterThan(100);

    const buffer = await blob.arrayBuffer();
    const info = inspectZip(buffer);
    expect(info.entryCount).toBe(2);
    expect(info.names).toEqual(["机器学习/根节点.md", "机器学习/子节点.md"]);
  });

  test("空条目列表仍生成合法 ZIP 壳", async () => {
    const blob = createZipBlob([]);
    const buffer = await blob.arrayBuffer();
    const info = inspectZip(buffer);
    expect(info.entryCount).toBe(0);
  });

  test("Windows Expand-Archive 可解压含中文路径的 ZIP", async () => {
    if (process.platform !== "win32") return;

    const blob = createZipBlob([
      { path: "机器学习/根节点.md", content: "# 根\n\n正文\n" },
      { path: "机器学习/子节点.md", content: "# 子\n" },
    ]);
    const dir = mkdtempSync(join(tmpdir(), "tree-chat-zip-"));
    const zipPath = join(dir, "export.zip");
    const outPath = join(dir, "out");
    writeFileSync(zipPath, Buffer.from(await blob.arrayBuffer()));

    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outPath.replace(/'/g, "''")}' -Force"`,
      { stdio: "pipe" },
    );

    const names = readdirSync(outPath, { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith(".md"));
    expect(names.length).toBe(2);
    expect(readFileSync(join(outPath, "机器学习", "根节点.md"), "utf8")).toContain("# 根");

    rmSync(dir, { recursive: true, force: true });
  });
});
