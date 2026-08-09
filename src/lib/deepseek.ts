import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";

// 本模块被客户端代码引入（app/page.tsx、src/lib/auxo.ts），因此对
// openai 只允许 type-only 引入，禁止引入其运行时实现（会打进浏览器包）。

export const DEEPSEEK_MODEL = "deepseek-v4-flash";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export const DEEPSEEK_NON_THINKING = {
  type: "disabled",
} as const;

/** OpenAI SDK 构造参数：路由侧使用 new OpenAI(deepSeekClientOptions(apiKey))。 */
export function deepSeekClientOptions(apiKey: string): {
  apiKey: string;
  baseURL: string;
} {
  return { apiKey, baseURL: DEEPSEEK_BASE_URL };
}

// thinking 是 DeepSeek 对 OpenAI Chat Completions 参数的非标准扩展，
// 只在此处声明一次；各路由的请求体统一使用下面两个类型。
type DeepSeekThinkingExtension = {
  thinking: typeof DEEPSEEK_NON_THINKING;
};

export type DeepSeekChatParamsNonStreaming =
  ChatCompletionCreateParamsNonStreaming & DeepSeekThinkingExtension;

export type DeepSeekChatParamsStreaming =
  ChatCompletionCreateParamsStreaming & DeepSeekThinkingExtension;
