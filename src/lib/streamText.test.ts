import { describe, expect, test, vi } from "vitest";
import { readTextStream } from "./streamText";

function byteStream(chunks: Uint8Array[], failAfterChunks = false) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      if (failAfterChunks) {
        controller.error(new Error("stream failed"));
      } else {
        controller.close();
      }
    },
  });
}

describe("readTextStream", () => {
  test("accumulates streamed text and reports each full snapshot", async () => {
    const snapshots: string[] = [];

    const result = await readTextStream(
      new Response(byteStream(["第一", "段，", "第二段"].map((chunk) => new TextEncoder().encode(chunk)))),
      (text) => snapshots.push(text),
    );

    expect(result).toBe("第一段，第二段");
    expect(snapshots).toEqual(["第一", "第一段，", "第一段，第二段"]);
  });

  test("keeps split multibyte characters intact", async () => {
    const bytes = new TextEncoder().encode("树语");
    const snapshots: string[] = [];

    const result = await readTextStream(
      new Response(byteStream([bytes.slice(0, 1), bytes.slice(1, 4), bytes.slice(4)])),
      (text) => snapshots.push(text),
    );

    expect(result).toBe("树语");
    expect(snapshots.at(-1)).toBe("树语");
  });

  test("propagates stream read errors and releases the reader lock", async () => {
    const response = new Response(byteStream([new TextEncoder().encode("partial")], true));

    await expect(readTextStream(response, vi.fn())).rejects.toThrow("stream failed");
  });

  test("throws a clear error when the response has no readable body", async () => {
    await expect(readTextStream(new Response(null), () => {})).rejects.toThrow(
      "响应没有可读取的流",
    );
  });
});
