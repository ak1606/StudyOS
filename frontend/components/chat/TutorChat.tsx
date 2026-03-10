"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStream } from "@/hooks/useStream";
import api from "@/lib/api";
import type { Source } from "@/types";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

interface SessionItem {
  id: string;
  created_at: string;
  message_count: number;
  last_message_preview: string | null;
}

interface Props {
  courseId: string;
  onNavigateToLecture?: (sourceId: string) => void;
}

export default function TutorChat({ courseId, onNavigateToLecture }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // ── Streaming hook ─────────────────────────────────────────────────
  const { tokens, isStreaming, send } = useStream({
    courseId,
    onDone: (sources) => {
      // Replace the streaming placeholder with the final message
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") {
          copy[copy.length - 1] = { ...last, sources };
        }
        return copy;
      });
    },
  });

  // When streaming tokens arrive, update the last assistant message
  useEffect(() => {
    if (!tokens) return;
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last?.role === "assistant") {
        copy[copy.length - 1] = { ...last, content: tokens };
      }
      return copy;
    });
  }, [tokens]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tokens]);

  // ── Session history query ──────────────────────────────────────────
  const { data: sessions } = useQuery<SessionItem[]>({
    queryKey: ["chat-sessions", courseId],
    queryFn: () =>
      api.get(`/api/courses/${courseId}/chat/sessions`).then((r) => r.data),
    enabled: isOpen && showHistory,
  });

  // ── Load a past session ────────────────────────────────────────────
  const loadSession = useCallback(
    async (sid: string) => {
      try {
        const res = await api.get(
          `/api/courses/${courseId}/chat/sessions/${sid}`
        );
        setSessionId(sid);
        setMessages(
          res.data.messages.map((m: any) => ({
            role: m.role,
            content: m.content,
            sources: m.sources,
          }))
        );
        setShowHistory(false);
      } catch {
        // ignore
      }
    },
    [courseId]
  );

  // ── Send message ───────────────────────────────────────────────────
  const handleSend = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const q = input.trim();
      if (!q || isStreaming) return;

      // Add user message + empty assistant placeholder
      setMessages((prev) => [
        ...prev,
        { role: "user", content: q },
        { role: "assistant", content: "" },
      ]);
      setInput("");

      // Patch the useStream hook — it reads session_id from a ref
      // We pass it through the question body via a custom fetch
      const token = localStorage.getItem("access_token") ?? "";
      fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/courses/${courseId}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ question: q, session_id: sessionId }),
        }
      ).then(async (response) => {
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = decoder.decode(value).split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) {
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last?.role === "assistant") {
                    copy[copy.length - 1] = {
                      ...last,
                      content: last.content + data.token,
                    };
                  }
                  return copy;
                });
              }
              if (data.done) {
                if (data.session_id) setSessionId(data.session_id);
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last?.role === "assistant") {
                    copy[copy.length - 1] = {
                      ...last,
                      sources: data.sources ?? [],
                    };
                  }
                  return copy;
                });
                queryClient.invalidateQueries({
                  queryKey: ["chat-sessions", courseId],
                });
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      });
    },
    [input, isStreaming, sessionId, courseId, queryClient]
  );

  // ── New session ────────────────────────────────────────────────────
  const newSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setShowHistory(false);
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 btn btn-primary btn-circle btn-lg shadow-xl z-50"
        title="Ask AI Tutor"
      >
        🤖
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[550px] bg-base-100 border border-base-300 rounded-2xl shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h3 className="font-semibold">AI Tutor</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setShowHistory(!showHistory)}
            title="Session history"
          >
            📋
          </button>
          <button
            className="btn btn-ghost btn-xs"
            onClick={newSession}
            title="New conversation"
          >
            ✨
          </button>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setIsOpen(false)}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Session history panel */}
      {showHistory && (
        <div className="border-b border-base-300 max-h-48 overflow-y-auto">
          <div className="p-2 space-y-1">
            {!sessions || sessions.length === 0 ? (
              <p className="text-xs text-base-content/50 p-2">
                No past conversations
              </p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => loadSession(s.id)}
                  className={`w-full text-left rounded-lg p-2 text-sm hover:bg-base-200 transition-colors ${
                    s.id === sessionId ? "bg-primary/10" : ""
                  }`}
                >
                  <p className="truncate font-medium">
                    {s.last_message_preview || "Empty session"}
                  </p>
                  <p className="text-xs text-base-content/40">
                    {s.message_count} messages ·{" "}
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-base-content/40 py-10">
            <p className="text-4xl mb-2">🎓</p>
            <p className="text-sm">
              Ask me anything about this course!
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                msg.role === "user"
                  ? "bg-primary text-primary-content rounded-br-sm"
                  : "bg-base-200 rounded-bl-sm"
              }`}
            >
              {/* Typing indicator */}
              {msg.role === "assistant" && !msg.content && (
                <div className="flex gap-1 py-1">
                  <span className="w-2 h-2 bg-base-content/30 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-base-content/30 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-base-content/30 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              )}

              {msg.content && (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}

              {/* Source chips */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.sources.map((src, j) => (
                    <button
                      key={j}
                      className="badge badge-xs badge-outline hover:badge-primary cursor-pointer"
                      onClick={() =>
                        onNavigateToLecture?.(src.chunk_id)
                      }
                      title={src.content}
                    >
                      {src.source_type.replace("_", " ")} ({Math.round(src.score * 100)}%)
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="border-t border-base-300 p-3 flex gap-2"
      >
        <textarea
          className="textarea textarea-bordered flex-1 resize-none text-sm min-h-[40px] max-h-24"
          placeholder="Ask a question…"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          disabled={isStreaming}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm self-end"
          disabled={isStreaming || !input.trim()}
        >
          {isStreaming ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            "Send"
          )}
        </button>
      </form>
    </div>
  );
}
