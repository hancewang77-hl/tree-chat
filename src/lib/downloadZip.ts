/** CRC-32 (IEEE) for ZIP local headers (STORE / no compression). */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  return Uint8Array.from([n & 0xff, (n >>> 8) & 0xff]);
}

function u32(n: number): Uint8Array {
  return Uint8Array.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export type ZipEntry = {
  path: string;
  content: string;
};

/** ZIP general purpose bit flag: bit 11 = UTF-8 filenames (APPNOTE 6.3+). */
const ZIP_UTF8_FLAG = 0x0800;

/** 构建无压缩 ZIP（浏览器端零依赖）。 */
export function createZipBlob(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const path = entry.path.replace(/\\/g, "/");
    const nameBytes = encoder.encode(path);
    const data = encoder.encode(entry.content);
    const checksum = crc32(data);

    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(ZIP_UTF8_FLAG),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    localParts.push(localHeader);

    const centralHeader = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(ZIP_UTF8_FLAG),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length;
  }

  const centralDirectory = concat(centralParts);
  const localData = concat(localParts);
  const endRecord = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(localData.length),
    u16(0),
  ]);

  const zipBytes = concat([localData, centralDirectory, endRecord]);
  return new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // 立即 revoke 会导致浏览器尚未读完 blob，zip 损坏或为空
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
