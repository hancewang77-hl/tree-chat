import { useRef, useState } from "react";
import type { SemanticCard } from "@/src/types/tree";
import type { ChatMessage } from "@/src/lib/contextCompiler";
import { isUsableSemanticCard } from "@/src/lib/semanticCard";
import { readTextStream } from "@/src/lib/streamText";

async function generateDeepSeekResponse(
  messages: ChatMessage[],
  onText: (text: string) => void,
  signal: AbortSignal,
) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("/api/chat failed:", res.status, text);
    throw new Error(`请求失败：${res.status} ${text}`);
  }

  return readTextStream(res, onText);
}

async function requestSemanticCard(prompt: string, response: string): Promise<SemanticCard> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 30_000);
  try {
    const res = await fetch("/api/structure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, response }),
      signal: abortController.signal,
    });
    const body = (await res.json().catch(() => null)) as
      | { semanticCard?: SemanticCard; error?: string }
      | null;

    if (!res.ok) {
      throw new Error(body?.error || `语义整理失败：${res.status}`);
    }
    if (!isUsableSemanticCard(body?.semanticCard)) {
      throw new Error("语义整理返回了无效卡片");
    }
    return body.semanticCard;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("语义整理超时，可在节点信息中重试");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useAIChat() {
  const [isAiTyping, setIsAiTyping] = useState(false);
  const isTypingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  async function sendMessage(
    messages: ChatMessage[],
    onText: (text: string) => void = () => {},
  ): Promise<string> {
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    isTypingRef.current = true;
    setIsAiTyping(true);
    try {
      return await generateDeepSeekResponse(
        messages,
        onText,
        abortController.signal,
      );
    } finally {
      isTypingRef.current = false;
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsAiTyping(false);
    }
  }

  function stopStreaming() {
    abortControllerRef.current?.abort();
  }

  return {
    isAiTyping,
    isTypingRef,
    sendMessage,
    structureNode: requestSemanticCard,
    stopStreaming,
  } as const;
}
