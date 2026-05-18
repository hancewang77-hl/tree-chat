import { useState } from "react";

async function generateDeepSeekResponse(
  prompt: string,
  contextPath: { prompt: string; response: string }[],
) {
  const messages = [
    {
      role: "system" as const,
      content:
        "你是「智构树语」的 AI 助手，在树状思维探索空间中帮助用户展开深度思考。\n" +
        "\n" +
        "回答要求：\n" +
        "1. 清晰结构化：使用 Markdown 格式，包括**粗体**、列表、`代码`等\n" +
        "2. 数学公式：使用 LaTeX 语法，行内公式用 $...$，独立公式用 $$...$$\n" +
        "3. 代码块：多行代码使用 ```语言 标记\n" +
        "4. 适中长度：控制在 3-6 段，每段 2-4 句。太短没深度，太长不便于分支\n" +
        "5. 可追问：结尾用**粗体**给出 2-3 个可继续探索的方向或问题\n" +
        "6. 语言一致：用中文回答，专业术语保持英文原文\n" +
        "\n" +
        "风格：像一个博学的思考伙伴，有观点但不武断，严谨但不枯燥。",
    },
    ...contextPath.flatMap((node) => [
      { role: "user" as const, content: node.prompt },
      { role: "assistant" as const, content: node.response },
    ]),
    { role: "user" as const, content: prompt },
  ];

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", messages }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("/api/chat failed:", res.status, text);
    throw new Error(`请求失败：${res.status} ${text}`);
  }

  const data = await res.json();
  return data.content as string;
}

export function useAIChat() {
  const [isAiTyping, setIsAiTyping] = useState(false);

  async function sendMessage(
    prompt: string,
    contextPath: { prompt: string; response: string }[],
  ): Promise<string> {
    setIsAiTyping(true);
    try {
      return await generateDeepSeekResponse(prompt, contextPath);
    } finally {
      setIsAiTyping(false);
    }
  }

  return { isAiTyping, sendMessage } as const;
}
