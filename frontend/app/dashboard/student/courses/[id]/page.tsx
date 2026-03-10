"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import api from "@/lib/api";
import type { CourseDetail, Lecture } from "@/types";
import CourseSearch from "@/components/search/CourseSearch";
import TutorChat from "@/components/chat/TutorChat";

// Lazy-load ReactPlayer (SSR-incompatible)
const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

export default function StudentCourseView() {
  const params = useParams();
  const courseId = params.id as string;

  const [activeLectureId, setActiveLectureId] = useState<string | null>(null);

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
        {/* ── Left: Video + Summary ───────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {lectureDetail?.signed_video_url ? (
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
                    onClick={() => setActiveLectureId(lec.id)}
                  >
                    <span className="text-sm">
                      {lec.status === "ready" ? "▶️" : "⏳"}
                    </span>
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
                {mod.materials.map((mat) => (
                  <a
                    key={mat.id}
                    href={mat.external_url || mat.file_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg p-2 hover:bg-base-300 transition-colors"
                  >
                    <span className="text-sm">
                      {mat.type === "pdf"
                        ? "📄"
                        : mat.type === "youtube"
                        ? "▶️"
                        : "🔗"}
                    </span>
                    <span className="text-sm truncate flex-1">
                      {mat.title}
                    </span>
                    <span className="badge badge-xs badge-ghost">
                      {mat.type}
                    </span>
                  </a>
                ))}

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
