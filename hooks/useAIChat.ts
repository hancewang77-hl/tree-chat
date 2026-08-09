import { useRef, useState } from "react";
import type { ChatMessage } from "@/src/lib/contextCompiler";
import { requestChatCompletion, requestSemanticCard } from "@/src/lib/aiChat";

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
      return await requestChatCompletion(
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
