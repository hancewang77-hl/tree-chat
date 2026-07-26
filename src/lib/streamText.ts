/**
 * 把 Response 的字节流按 UTF-8 累计解码为文本；onText 每次收到累计全文快照。
 * 解码器使用 stream 模式，跨块拆分的多字节字符不会被破坏。
 */
export async function readTextStream(
  response: Response,
  onText: (text: string) => void,
): Promise<string> {
  if (!response.body) {
    throw new Error("响应没有可读取的流");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      onText(text);
    }

    const finalChunk = decoder.decode();
    if (finalChunk) {
      text += finalChunk;
      onText(text);
    }

    return text;
  } finally {
    try { reader.releaseLock(); } catch { /* lock already released */ }
  }
}
