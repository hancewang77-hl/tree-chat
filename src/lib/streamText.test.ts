import { describe, expect, test } from "vitest";
import { readTextStream } from "./streamText";

function textStream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("readTextStream", () => {
  test("accumulates streamed text and reports each full snapshot", async () => {
    const snapshots: string[] = [];

    const result = await readTextStream(
      new Response(textStream(["第一", "段，", "第二段"])),
      (text) => snapshots.push(text),
    );

    expect(result).toBe("第一段，第二段");
    expect(snapshots).toEqual(["第一", "第一段，", "第一段，第二段"]);
  });

  test("throws a clear error when the response has no readable body", async () => {
    await expect(readTextStream(new Response(null), () => {})).rejects.toThrow(
      "响应没有可读取的流",
    );
  });
});
