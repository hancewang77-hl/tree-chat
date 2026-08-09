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
// Request bounds. Compiled contexts from contextCompiler are far under these
// (root+path semantics+leaves+anchor+nutrients budgets total well below 60K
// chars); the caps only stop unbounded/oversized bodies from being buffered
// and forwarded to the server-held DeepSeek key. Mirrors the sibling routes,
// which already bound their input (/api/structure 50K chars, /api/auxo 700KB).
const MAX_BODY_BYTES = 1_000_000;
const MAX_MESSAGES = 200;
const MAX_TOTAL_CONTENT_CHARS = 200_000;
const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

// 路由文件只导出 handler；限流器为模块内状态
const chatRateLimiter = createRateLimiter({
  limit: RATE_LIMIT,
  windowMs: RATE_WINDOW,
});

/**
 * Reads the body while enforcing a byte ceiling, cancelling the stream the
 * instant it is exceeded (App Router's req.json() has no default size limit).
 * Returns null when the cap is passed so the caller can answer 413.
 */
async function readBoundedText(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

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

    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return Response.json({ error: "请求体过大" }, { status: 413 });
    }

    const rawBody = await readBoundedText(req, MAX_BODY_BYTES);
    if (rawBody === null) {
      return Response.json({ error: "请求体过大" }, { status: 413 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
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

    if (messages.length > MAX_MESSAGES) {
      return Response.json({ error: "messages 过多" }, { status: 413 });
    }

    // Each element must be a well-formed chat message; sum content length so a
    // single giant message cannot slip past the per-count cap.
    let totalContentChars = 0;
    for (const message of messages) {
      if (
        !message ||
        typeof message !== "object" ||
        typeof (message as { role?: unknown }).role !== "string" ||
        !ALLOWED_ROLES.has((message as { role: string }).role) ||
        typeof (message as { content?: unknown }).content !== "string"
      ) {
        return Response.json({ error: "messages 格式不合法" }, { status: 400 });
      }
      totalContentChars += (message as { content: string }).content.length;
    }
    if (totalContentChars > MAX_TOTAL_CONTENT_CHARS) {
      return Response.json({ error: "待发送内容过长" }, { status: 413 });
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
    // Log full detail server-side; return only a fixed message so upstream
    // provider internals are never disclosed to the client.
    console.error("DeepSeek route error:", error);
    return Response.json({ error: "调用 DeepSeek 失败" }, { status: 500 });
  }
}
