import OpenAI from "openai";
import {
  DEEPSEEK_MODEL,
  DEEPSEEK_NON_THINKING,
  deepSeekClientOptions,
  type DeepSeekChatParamsNonStreaming,
  type DeepSeekChatParamsStreaming,
} from "@/src/lib/deepseek";
import { createRateLimiter, getClientIp } from "@/src/lib/rateLimit";

const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;
const MAX_TOKENS = 2048;

// 路由文件只导出 handler；限流器为模块内状态
const chatRateLimiter = createRateLimiter({
  limit: RATE_LIMIT,
  windowMs: RATE_WINDOW,
});

export async function POST(req: Request) {
  const rateLimit = chatRateLimiter.check(getClientIp(req));
  if (!rateLimit.allowed) {
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "DEEPSEEK_API_KEY 未配置" },
        { status: 500 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "请求体格式错误，需要有效的 JSON" },
        { status: 400 },
      );
    }
    const { messages, stream = true } = body as {
      messages?: unknown;
      stream?: boolean;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: "messages 不能为空" },
        { status: 400 },
      );
    }

    const client = new OpenAI(deepSeekClientOptions(apiKey));

    if (!stream) {
      const completionRequest: DeepSeekChatParamsNonStreaming = {
        model: DEEPSEEK_MODEL,
        messages,
        stream: false,
        thinking: DEEPSEEK_NON_THINKING,
        max_tokens: MAX_TOKENS,
      };
      const completion = await client.chat.completions.create(completionRequest);

      return Response.json({
        content: completion.choices?.[0]?.message?.content ?? "",
      });
    }

    const completionRequest: DeepSeekChatParamsStreaming = {
      model: DEEPSEEK_MODEL,
      messages,
      stream: true,
      thinking: DEEPSEEK_NON_THINKING,
      max_tokens: MAX_TOKENS,
    };
    const completion = await client.chat.completions.create(completionRequest);

    // 流式响应体是纯文本增量拼接（不是 SSE 帧），客户端按字节流累计解码；
    // 客户端断开时 ReadableStream 的 cancel 钩子负责中止上游 DeepSeek 请求。
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices?.[0]?.delta?.content ?? "";
            if (delta) controller.enqueue(encoder.encode(delta));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        completion.controller.abort();
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error("DeepSeek route error:", error);

    const message =
      error && typeof error === "object" && "message" in error
        ? (error as { message: unknown }).message
        : undefined;

    return Response.json(
      {
        error: message || "调用 DeepSeek 失败",
      },
      { status: 500 },
    );
  }
}
