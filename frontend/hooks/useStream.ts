"use client";

import { useCallback, useRef, useState } from "react";
import type { Source } from "@/types";

interface UseStreamOptions {
  courseId: string;
  onDone?: (sources: Source[]) => void;
}

/**
 * Hook for consuming SSE chat streams from the backend.
 */
export function useStream({ courseId, onDone }: UseStreamOptions) {
  const [tokens, setTokens] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (question: string) => {
      // Cancel any in-flight stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setTokens("");
      setIsStreaming(true);

      try {
        const token = localStorage.getItem("access_token") ?? "";
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/courses/${courseId}/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ question }),
            signal: controller.signal,
          }
        );

        if (!response.ok || !response.body) {
          throw new Error(`Chat request failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const lines = decoder.decode(value).split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              setTokens((prev) => prev + data.token);
            }
            if (data.done) {
              onDone?.(data.sources ?? []);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Stream error:", err);
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [courseId, onDone]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { tokens, isStreaming, send, cancel };
}
