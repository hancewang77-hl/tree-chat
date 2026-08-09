import { vi } from "vitest";

type MockChunk = { choices?: Array<{ delta?: { content?: string } }> };

export function makeStreamingCompletion(chunks: string[]) {
  const completion = {
    controller: { abort: vi.fn() },
    async *[Symbol.asyncIterator]() {
      for (const content of chunks) {
        yield { choices: [{ delta: { content } }] } satisfies MockChunk;
      }
    },
  };
  return completion;
}

export function makeNonStreamingCompletion(content: string) {
  return { choices: [{ message: { content } }] };
}

export function installOpenAIMock(create = vi.fn()) {
  return vi.mock("openai", () => ({
    default: vi.fn(() => ({
      chat: {
        completions: {
          create,
        },
      },
    })),
  }));
}
