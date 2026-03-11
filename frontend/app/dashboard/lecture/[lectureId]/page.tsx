"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import api from "@/lib/api";

// ── YouTube URL helpers ───────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /embed\/([A-Za-z0-9_-]{11})/,
    /shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function isYouTubeUrl(url: string) {
  return (
    url.includes("youtube.com") ||
    url.includes("youtu.be")
  );
}

// ── Summary panel ─────────────────────────────────────────────────────

function SummaryPanel({ lectureId }: { lectureId: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["yt-summary", lectureId],
    queryFn: () =>
      api.get(`/api/lectures/${lectureId}/youtube/summary`).then((r) => r.data),
    retry: false,
    staleTime: Infinity,
  });

  if (isLoading || isFetching)
    return (
      <div className="flex items-center gap-2 text-sm text-base-content/60 py-4">
        <span className="loading loading-spinner loading-sm" /> Generating summary…
      </div>
    );

  if (isError)
    return (
      <div className="alert alert-warning text-sm">
        Could not generate summary — transcript may be unavailable.
        <button className="btn btn-xs btn-ghost ml-2" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">✨ AI Summary</h3>
        <button
          className="btn btn-ghost btn-xs"
          onClick={() =>
            api
              .get(`/api/lectures/${lectureId}/youtube/summary?refresh=true`)
              .then(() => refetch())
          }
        >
          🔄 Refresh
        </button>
      </div>
      <div className="prose prose-sm max-w-none text-base-content/80">
        <ReactMarkdown>{data?.summary ?? ""}</ReactMarkdown>
      </div>
    </div>
  );
}

// ── Chat panel ────────────────────────────────────────────────────────

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function ChatPanel({ lectureId }: { lectureId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");

    const userMsg: ChatMsg = { role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    // Add empty assistant message to stream into
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/lectures/${lectureId}/youtube/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
          },
          body: JSON.stringify({ question: q, history }),
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const json = JSON.parse(line.slice(5).trim());
            if (json.token) {
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  ...copy[copy.length - 1],
                  content: copy[copy.length - 1].content + json.token,
                };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: "⚠️ Error: could not get answer. Is Ollama running?",
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="font-semibold mb-3">💬 Ask About This Video</h3>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 max-h-72 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-base-content/50 text-center py-6">
            Ask anything about the lecture — the AI uses the video transcript.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat ${msg.role === "user" ? "chat-end" : "chat-start"}`}
          >
            <div
              className={`chat-bubble text-sm ${
                msg.role === "user"
                  ? "chat-bubble-primary"
                  : "bg-base-300 text-base-content"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  {streaming && i === messages.length - 1 && (
                    <span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5" />
                  )}
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          className="input input-bordered input-sm flex-1"
          placeholder="Ask a question about this video…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={streaming}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={send}
          disabled={!input.trim() || streaming}
        >
          {streaming ? <span className="loading loading-spinner loading-xs" /> : "Ask"}
        </button>
      </div>
    </div>
  );
}

// ── Transcript panel ──────────────────────────────────────────────────

function TranscriptPanel({ lectureId }: { lectureId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["yt-transcript", lectureId],
    queryFn: () =>
      api.get(`/api/lectures/${lectureId}/youtube/transcript`).then((r) => r.data),
    retry: false,
    staleTime: Infinity,
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 text-sm py-4">
        <span className="loading loading-spinner loading-sm" /> Loading transcript…
      </div>
    );

  if (!data?.transcript)
    return <p className="text-sm text-base-content/50">No transcript available.</p>;

  return (
    <div className="max-h-80 overflow-y-auto text-sm text-base-content/80 leading-relaxed whitespace-pre-wrap bg-base-200 rounded-lg p-4">
      {data.transcript}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function LectureViewerPage() {
  const { lectureId } = useParams<{ lectureId: string }>();
  const [activeTab, setActiveTab] = useState<"summary" | "chat" | "transcript">(
    "summary"
  );

  const { data: lecture, isLoading } = useQuery({
    queryKey: ["lecture", lectureId],
    queryFn: () => api.get(`/api/lectures/${lectureId}`).then((r) => r.data),
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );

  if (!lecture)
    return <div className="alert alert-error">Lecture not found.</div>;

  const videoUrl: string = lecture.signed_video_url ?? lecture.video_url ?? "";
  const youtubeId = isYouTubeUrl(videoUrl) ? extractYouTubeId(videoUrl) : null;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="breadcrumbs text-sm mb-4">
        <ul>
          <li>
            <a href="/dashboard/student/courses">Courses</a>
          </li>
          <li>{lecture.title}</li>
        </ul>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* ── Video Player ── */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold mb-4">{lecture.title}</h1>

          {youtubeId ? (
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full rounded-xl shadow-lg"
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1`}
                title={lecture.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : videoUrl ? (
            <video
              controls
              className="w-full rounded-xl shadow-lg"
              src={videoUrl}
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="alert alert-warning">No video available.</div>
          )}

          {lecture.description && (
            <p className="mt-4 text-base-content/70">{lecture.description}</p>
          )}
        </div>

        {/* ── Right Panel ── */}
        <div className="xl:w-96 flex flex-col gap-4">
          {/* Tabs — only show AI features for YouTube */}
          {youtubeId ? (
            <div className="card bg-base-200 flex-1">
              <div className="card-body p-4">
                <div className="tabs tabs-boxed mb-4">
                  <button
                    className={`tab tab-sm flex-1 ${activeTab === "summary" ? "tab-active" : ""}`}
                    onClick={() => setActiveTab("summary")}
                  >
                    ✨ Summary
                  </button>
                  <button
                    className={`tab tab-sm flex-1 ${activeTab === "chat" ? "tab-active" : ""}`}
                    onClick={() => setActiveTab("chat")}
                  >
                    💬 Q&A
                  </button>
                  <button
                    className={`tab tab-sm flex-1 ${activeTab === "transcript" ? "tab-active" : ""}`}
                    onClick={() => setActiveTab("transcript")}
                  >
                    📄 Transcript
                  </button>
                </div>

                {activeTab === "summary" && (
                  <SummaryPanel lectureId={lectureId} />
                )}
                {activeTab === "chat" && (
                  <ChatPanel lectureId={lectureId} />
                )}
                {activeTab === "transcript" && (
                  <TranscriptPanel lectureId={lectureId} />
                )}
              </div>
            </div>
          ) : (
            <div className="card bg-base-200">
              <div className="card-body p-4 text-sm text-base-content/60">
                <p>
                  💡 AI summary and Q&A are available for YouTube lectures.
                  Upload a YouTube link to unlock these features.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
