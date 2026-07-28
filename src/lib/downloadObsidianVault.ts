import { createZipBlob, downloadBlob, type ZipEntry } from "./downloadZip";
import { buildObsidianVaultExport } from "./exportObsidianVault";
import type { Project } from "@/src/types/tree";

export function downloadObsidianVaultZip(project: Project): string[] {
  const plan = buildObsidianVaultExport(project);
  if (plan.files.length === 0) {
    throw new Error("当前项目没有可导出的节点文件");
  }

  const entries: ZipEntry[] = plan.files.map((file) => ({
    path: `${plan.folderName}/${file.baseName}.md`,
    content: file.content,
  }));

  const blob = createZipBlob(entries);
  if (blob.size < 22) {
    throw new Error("导出失败：生成的 ZIP 为空，请重试");
  }

  downloadBlob(`${plan.folderName}-obsidian.zip`, blob);
  return plan.notes;
}
