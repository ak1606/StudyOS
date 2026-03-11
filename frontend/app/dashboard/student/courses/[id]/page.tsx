"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import api from "@/lib/api";
import type { CourseDetail, Lecture } from "@/types";
import CourseSearch from "@/components/search/CourseSearch";
import TutorChat from "@/components/chat/TutorChat";

// Lazy-load ReactPlayer (SSR-incompatible)
const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

function isYouTubeUrl(url: string) {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

function getYouTubeEmbedUrl(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /embed\/([A-Za-z0-9_-]{11})/,
    /shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1`;
  }
  return null;
}

export default function StudentCourseView() {
  const params = useParams();
  const courseId = params.id as string;
  const router = useRouter();

  const [activeLectureId, setActiveLectureId] = useState<string | null>(null);
  // For youtube materials embedded inline (they have no lecture ID)
  const [activeEmbedUrl, setActiveEmbedUrl] = useState<string | null>(null);
  const [activeEmbedTitle, setActiveEmbedTitle] = useState<string>("");
  const [activeRawYouTubeUrl, setActiveRawYouTubeUrl] = useState<string | null>(null);

  // ── Inline YouTube AI state ──────────────────────────────────────
  const [embedTab, setEmbedTab] = useState<"summary" | "chat">("summary");
  const [embedSummary, setEmbedSummary] = useState<string | null>(null);
  const [embedSummaryLoading, setEmbedSummaryLoading] = useState(false);
  const [embedChatMessages, setEmbedChatMessages] = useState<{role:"user"|"assistant"; content:string}[]>([]);
  const [embedChatInput, setEmbedChatInput] = useState("");
  const [embedChatStreaming, setEmbedChatStreaming] = useState(false);
  const embedChatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    embedChatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [embedChatMessages]);

  const loadEmbedSummary = async (youtubeUrl: string) => {
    setEmbedSummary(null);
    setEmbedSummaryLoading(true);
    try {
      const res = await api.post("/api/lectures/youtube/by-url/summary", { youtube_url: youtubeUrl });
      setEmbedSummary(res.data.summary);
    } catch {
      setEmbedSummary("⚠️ Could not generate summary. Is Ollama running?");
    } finally {
      setEmbedSummaryLoading(false);
    }
  };

  const sendEmbedChat = async () => {
    const q = embedChatInput.trim();
    if (!q || embedChatStreaming || !activeRawYouTubeUrl) return;
    setEmbedChatInput("");
    const history = embedChatMessages.map(m => ({ role: m.role, content: m.content }));
    setEmbedChatMessages(prev => [...prev, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setEmbedChatStreaming(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/lectures/youtube/by-url/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
          },
          body: JSON.stringify({ youtube_url: activeRawYouTubeUrl, question: q, history }),
        }
      );
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const json = JSON.parse(line.slice(5).trim());
            if (json.token) setEmbedChatMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + json.token };
              return copy;
            });
          } catch {}
        }
      }
    } catch {
      setEmbedChatMessages(prev => { const c=[...prev]; c[c.length-1]={...c[c.length-1],content:"⚠️ Error. Is Ollama running?"}; return c; });
    } finally {
      setEmbedChatStreaming(false);
    }
  };

  const { data: course, isLoading } = useQuery<CourseDetail>({
    queryKey: ["course", courseId],
    queryFn: () => api.get(`/api/courses/${courseId}`).then((r) => r.data),
  });

  // Fetch lecture detail (with signed_video_url + transcript)
  const { data: lectureDetail } = useQuery<Lecture & { signed_video_url?: string }>({
    queryKey: ["lecture", activeLectureId],
    queryFn: () =>
      api.get(`/api/lectures/${activeLectureId}`).then((r) => r.data),
    enabled: !!activeLectureId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!course) {
    return <div className="alert alert-error">Course not found</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-1">{course.title}</h1>
      <p className="text-base-content/60 mb-4">
        By {course.teacher.full_name}
      </p>

      <div className="mb-6">
        <CourseSearch
          courseId={courseId}
          onNavigate={(sourceId) => setActiveLectureId(sourceId)}
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Left: Video + AI Panel ───────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {activeEmbedUrl ? (
            <>
              {/* Inline YouTube embed for materials */}
              <div className="mb-4">
                <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                  <iframe
                    className="absolute inset-0 w-full h-full rounded-lg"
                    src={activeEmbedUrl}
                    title={activeEmbedTitle}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <p className="mt-2 font-medium">{activeEmbedTitle}</p>
              </div>

              {/* AI Panel for inline YouTube materials */}
              <div className="card bg-base-200">
                <div className="card-body p-4">
                  <div className="tabs tabs-boxed mb-4">
                    <button
                      className={`tab flex-1 ${embedTab === "summary" ? "tab-active" : ""}`}
                      onClick={() => setEmbedTab("summary")}
                    >
                      ✨ AI Summary
                    </button>
                    <button
                      className={`tab flex-1 ${embedTab === "chat" ? "tab-active" : ""}`}
                      onClick={() => setEmbedTab("chat")}
                    >
                      💬 Ask AI
                    </button>
                  </div>

                  {embedTab === "summary" && (
                    <div>
                      {embedSummaryLoading ? (
                        <div className="flex items-center gap-2 text-sm text-base-content/60 py-2">
                          <span className="loading loading-spinner loading-sm" />
                          Generating summary…
                        </div>
                      ) : embedSummary ? (
                        <div className="prose prose-sm max-w-none text-base-content">
                          <ReactMarkdown>{embedSummary}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm text-base-content/50">No summary yet.</p>
                      )}
                    </div>
                  )}

                  {embedTab === "chat" && (
                    <div className="flex flex-col gap-3">
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {embedChatMessages.length === 0 && (
                          <p className="text-sm text-base-content/50 text-center py-4">
                            Ask anything about this video
                          </p>
                        )}
                        {embedChatMessages.map((msg, i) => (
                          <div key={i} className={`chat ${msg.role === "user" ? "chat-end" : "chat-start"}`}>
                            <div className={`chat-bubble text-sm ${
                              msg.role === "user"
                                ? "chat-bubble-primary"
                                : "bg-base-300 text-base-content"
                            }`}>
                              {msg.role === "assistant" ? (
                                <div className="prose prose-sm max-w-none">
                                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                                  {embedChatStreaming && i === embedChatMessages.length - 1 && (
                                    <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5" />
                                  )}
                                </div>
                              ) : (
                                msg.content
                              )}
                            </div>
                          </div>
                        ))}
                        <div ref={embedChatBottomRef} />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="input input-bordered input-sm flex-1"
                          placeholder="Ask about this video…"
                          value={embedChatInput}
                          onChange={e => setEmbedChatInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && sendEmbedChat()}
                          disabled={embedChatStreaming}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={sendEmbedChat}
                          disabled={!embedChatInput.trim() || embedChatStreaming}
                        >
                          {embedChatStreaming ? <span className="loading loading-spinner loading-xs" /> : "Ask"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : lectureDetail?.signed_video_url ? (
            <div className="aspect-video rounded-lg overflow-hidden bg-black mb-4">
              <ReactPlayer
                url={lectureDetail.signed_video_url}
                controls
                width="100%"
                height="100%"
              />
            </div>
          ) : (
            <div className="aspect-video rounded-lg bg-base-300 flex items-center justify-center mb-4">
              <p className="text-base-content/50">
                {activeLectureId
                  ? "Loading video…"
                  : "Select a lecture to start watching"}
              </p>
            </div>
          )}

          {/* AI Summary card */}
          {lectureDetail?.summary && (
            <div className="card bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 mb-4">
              <div className="card-body">
                <h3 className="card-title text-sm">
                  🤖 AI Summary
                </h3>
                <p className="text-sm whitespace-pre-line">
                  {lectureDetail.summary}
                </p>
              </div>
            </div>
          )}

          {/* Transcript panel */}
          {lectureDetail?.transcript && (
            <div className="card bg-base-200">
              <div className="card-body max-h-64 overflow-y-auto">
                <h3 className="card-title text-sm sticky top-0 bg-base-200 py-1">
                  📝 Transcript
                </h3>
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {lectureDetail.transcript}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Module Accordion ─────────────────────────────── */}
        <div className="w-full lg:w-80 shrink-0 space-y-2">
          <h2 className="font-semibold mb-2">Course Content</h2>

          {course.modules.map((mod, modIdx) => (
            <div key={mod.id} className="collapse collapse-arrow bg-base-200">
              <input
                type="checkbox"
                defaultChecked={modIdx === 0}
                name={`mod-${mod.id}`}
              />
              <div className="collapse-title font-medium">
                {mod.title}
                <span className="text-xs text-base-content/50 ml-2">
                  ({mod.lectures.length})
                </span>
              </div>
              <div className="collapse-content space-y-1">
                {/* Lectures */}
                {mod.lectures.map((lec: Lecture) => (
                  <button
                    key={lec.id}
                    className={`w-full text-left flex items-center gap-2 rounded-lg p-2 transition-colors ${
                      activeLectureId === lec.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-base-300"
                    }`}
                    onClick={() => {
                        // Always open the viewer page — it handles both YouTube and regular videos
                        router.push(`/dashboard/lecture/${lec.id}`);
                      }}
                  >
                    <span className="text-sm">▶️</span>
                    <span className="text-sm truncate flex-1">
                      {lec.title}
                    </span>
                    {lec.status !== "ready" && (
                      <span className="badge badge-xs badge-warning">
                        {lec.status}
                      </span>
                    )}
                  </button>
                ))}

                {/* Materials */}
                {mod.materials.map((mat) => {
                  const ytUrl = mat.external_url ?? "";
                  if (mat.type === "youtube" && isYouTubeUrl(ytUrl)) {
                    return (
                      <button
                        key={mat.id}
                        className={`w-full text-left flex items-center gap-2 rounded-lg p-2 transition-colors ${
                          activeEmbedUrl === getYouTubeEmbedUrl(ytUrl)
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-base-300"
                        }`}
                        onClick={() => {
                          const embedUrl = getYouTubeEmbedUrl(ytUrl);
                          if (embedUrl) {
                            setActiveLectureId(null);
                            setActiveEmbedUrl(embedUrl);
                            setActiveEmbedTitle(mat.title);
                            setActiveRawYouTubeUrl(ytUrl);
                            setEmbedSummary(null);
                            setEmbedChatMessages([]);
                            setEmbedTab("summary");
                            loadEmbedSummary(ytUrl);
                          }
                        }}
                      >
                        <span className="text-sm">▶️</span>
                        <span className="text-sm truncate flex-1">{mat.title}</span>
                        <span className="badge badge-xs badge-ghost">youtube</span>
                      </button>
                    );
                  }
                  return (
                    <a
                      key={mat.id}
                      href={mat.external_url || mat.file_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg p-2 hover:bg-base-300 transition-colors"
                    >
                      <span className="text-sm">
                        {mat.type === "pdf" ? "📄" : "🔗"}
                      </span>
                      <span className="text-sm truncate flex-1">{mat.title}</span>
                      <span className="badge badge-xs badge-ghost">{mat.type}</span>
                    </a>
                  );
                })}

                {mod.lectures.length === 0 && mod.materials.length === 0 && (
                  <p className="text-xs text-base-content/50 py-2">
                    No content yet
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating AI Tutor */}
      <TutorChat
        courseId={courseId}
        onNavigateToLecture={(id) => setActiveLectureId(id)}
      />
    </div>
  );
}
