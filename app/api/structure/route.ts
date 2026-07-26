import OpenAI from "openai";
import { parseSemanticCard } from "@/src/lib/semanticCard";
import {
  DEEPSEEK_MODEL,
  DEEPSEEK_NON_THINKING,
  deepSeekClientOptions,
  type DeepSeekChatParamsNonStreaming,
} from "@/src/lib/deepseek";
import { createRateLimiter, getClientIp } from "@/src/lib/rateLimit";

const MAX_SOURCE_CHARS = 50_000;
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;
const structureRateLimiter = createRateLimiter({
  limit: RATE_LIMIT,
  windowMs: RATE_WINDOW,
});

const STRUCTURE_SYSTEM_PROMPT = `
你是「智构树语」的语义整理器。你只负责将一个问题和它的回答整理为轻量语义卡片，不补充原文中没有的知识。

必须只返回 JSON 对象，格式如下：
{
  "facts": ["已明确的事实"],
  "constraints": ["必须满足的约束"],
  "assumptions": ["未被证实的假设"],
  "decisions": ["已作出的决定或结论"],
  "rejected": ["已否定的选项或说法"],
  "openQuestions": ["仍需回答或验证的问题"]
}

规则：
1. 每项使用简短、可独立理解的陈述句。
2. 无对应内容时返回空数组。
3. 区分事实与假设，不把建议写成事实。
4. 不输出 Markdown 代码块、解释或其他字段。
`.trim();

export async function POST(req: Request) {
  const rateLimit = structureRateLimiter.check(getClientIp(req));
  if (!rateLimit.allowed) {
    return Response.json({ error: "语义整理请求过于频繁，请稍后再试" }, { status: 429 });
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "DEEPSEEK_API_KEY 未配置" }, { status: 500 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "请求体格式错误，需要有效的 JSON" }, { status: 400 });
    }

    const prompt =
      body && typeof body === "object" && "prompt" in body
        ? (body as { prompt?: unknown }).prompt
        : undefined;
    const response =
      body && typeof body === "object" && "response" in body
        ? (body as { response?: unknown }).response
        : undefined;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return Response.json({ error: "prompt 不能为空" }, { status: 400 });
    }
    if (typeof response !== "string" || !response.trim()) {
      return Response.json({ error: "response 不能为空" }, { status: 400 });
    }
    if (prompt.length + response.length > MAX_SOURCE_CHARS) {
      return Response.json({ error: "待整理内容过长" }, { status: 413 });
    }

    const client = new OpenAI(deepSeekClientOptions(apiKey));
    const completionRequest: DeepSeekChatParamsNonStreaming = {
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: STRUCTURE_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({ prompt: prompt.trim(), response: response.trim() }),
        },
      ],
      response_format: { type: "json_object" },
      stream: false,
      thinking: DEEPSEEK_NON_THINKING,
      temperature: 0.1,
      max_tokens: 1_200,
    };
    const completion = await client.chat.completions.create(completionRequest);

    const content = completion.choices[0]?.message?.content ?? "";
    const semanticCard = parseSemanticCard(content, {
      generatedAt: Date.now(),
      model: completion.model || DEEPSEEK_MODEL,
    });

    return Response.json({ semanticCard });
  } catch (error: unknown) {
    console.error("DeepSeek structure route error:", error);
    const message =
      error && typeof error === "object" && "message" in error
        ? (error as { message: unknown }).message
        : undefined;
    return Response.json(
      { error: typeof message === "string" ? message : "语义整理失败" },
      { status: 500 },
    );
  }
}
