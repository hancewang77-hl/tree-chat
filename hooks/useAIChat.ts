import { useState } from "react";

async function generateDeepSeekResponse(
  prompt: string,
  contextPath: { prompt: string; response: string }[],
) {
  const messages = [
    {
      role: "system" as const,
      content:
        "你是一个用于树状思维探索的 AI 助手。回答要清晰、结构化，适合继续展开成子节点。尽量给出可以继续追问的方向。",
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
