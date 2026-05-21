import OpenAI from "openai";

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT) {
      return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }
    entry.count++;
  } else {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
  }

  if (rateMap.size > 10_000) rateMap.clear();

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
    const { messages, model = "deepseek-chat" } = body as {
      messages?: unknown;
      model?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: "messages 不能为空" },
        { status: 400 },
      );
    }

    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com",
    });

    const completion = await client.chat.completions.create({
      model,
      messages,
      stream: false,
      max_tokens: 2048,
    });

    return Response.json({
      content: completion.choices?.[0]?.message?.content ?? "",
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
