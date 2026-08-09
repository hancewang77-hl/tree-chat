import { useCallback, useEffect, useRef, useState } from "react";
import { validateAuxoPlan } from "@/src/lib/auxo";
import type { AuxoPlan, AuxoRequest } from "@/src/types/tree";

const CLIENT_TIMEOUT = 55_000;

/**
 * Cancelable Auxo plan request. Invariants: at most one request in flight
 * (rejects re-entry), a CLIENT_TIMEOUT abort distinct from user cancellation,
 * and the returned plan is always re-validated client-side before any node is
 * created.
 */
export function useAuxo() {
  const [isGenerating, setIsGenerating] = useState(false);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const generatePlan = useCallback(async (request: AuxoRequest): Promise<AuxoPlan> => {
    if (inFlightRef.current) {
      throw new Error("Auxo 正在生成任务树，请勿重复提交。");
    }

    const abortController = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      abortController.abort();
    }, CLIENT_TIMEOUT);

    inFlightRef.current = true;
    abortControllerRef.current = abortController;
    setIsGenerating(true);

    try {
      const response = await fetch("/api/auxo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });
      const body = (await response.json().catch(() => null)) as
        | { plan?: unknown; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error || `Auxo 请求失败：${response.status}`);
      }
      if (!body?.plan) {
        throw new Error("Auxo 响应缺少任务计划。");
      }

      // The server validates first; this second pass is deliberately client-side.
      // Real tree IDs are created only after this check succeeds.
      return validateAuxoPlan(body.plan, request);
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error(didTimeout ? "Auxo 规划超时，请缩小资料范围后重试。" : "Auxo 规划已取消。");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      inFlightRef.current = false;
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  return { generatePlan, isGenerating, isGeneratingRef: inFlightRef, cancel } as const;
}
