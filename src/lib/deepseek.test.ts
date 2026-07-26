import { describe, expect, test } from "vitest";
import {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  DEEPSEEK_NON_THINKING,
  deepSeekClientOptions,
} from "./deepseek";
import { AUXO_MODEL } from "./auxo";

describe("DeepSeek runtime configuration", () => {
  test("centralizes the non-thinking runtime model used by chat, structure, and Auxo", () => {
    expect(DEEPSEEK_MODEL).toBe("deepseek-v4-flash");
    expect(AUXO_MODEL).toBe(DEEPSEEK_MODEL);
    expect(DEEPSEEK_NON_THINKING).toEqual({ type: "disabled" });
  });

  test("builds OpenAI client options pointed at the DeepSeek gateway", () => {
    expect(DEEPSEEK_BASE_URL).toBe("https://api.deepseek.com");
    expect(deepSeekClientOptions("test-key")).toEqual({
      apiKey: "test-key",
      baseURL: "https://api.deepseek.com",
    });
  });
});
