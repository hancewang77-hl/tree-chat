import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "DEEPSEEK_API_KEY 未配置" },
        { status: 500 },
      );
    }

    const body = await req.json();
    const { messages, model = "deepseek-chat" } = body ?? {};

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
  } catch (error: any) {
    console.error("DeepSeek route error:", error);

    return Response.json(
      {
        error:
          error?.message ||
          error?.error?.message ||
          "调用 DeepSeek 失败",
      },
      { status: 500 },
    );
  }
}