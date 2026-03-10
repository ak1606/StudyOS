"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Course } from "@/types";
import AnnouncementComposer from "@/components/notifications/AnnouncementComposer";

interface Announcement {
  id: string;
  title: string;
  body: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
}

function AnnouncementList({ courseId }: { courseId: string }) {
  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["announcements", courseId],
    queryFn: () =>
      api.get(`/api/courses/${courseId}/announcements`).then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <span className="loading loading-spinner loading-sm" />
      </div>
    );
  }

  if (announcements.length === 0) {
    return (
      <p className="text-sm text-base-content/60 py-4 text-center">
        No announcements sent yet.
      </p>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {announcements.map((a) => (
        <div key={a.id} className="card bg-base-100 shadow-sm">
          <div className="card-body py-3 px-4">
            <div className="flex items-start justify-between">
              <h4 className="font-semibold text-sm">{a.title}</h4>
              {a.sent_at ? (
                <span className="badge badge-success badge-xs">Sent</span>
              ) : a.scheduled_at ? (
                <span className="badge badge-warning badge-xs">Scheduled</span>
              ) : (
                <span className="badge badge-ghost badge-xs">Draft</span>
              )}
            </div>
            <p className="text-xs text-base-content/70 line-clamp-2">{a.body}</p>
            <p className="text-xs text-base-content/40 mt-1">
              {a.sent_at
                ? `Sent ${new Date(a.sent_at).toLocaleString()}`
                : a.scheduled_at
                ? `Scheduled for ${new Date(a.scheduled_at).toLocaleString()}`
                : `Created ${new Date(a.created_at).toLocaleString()}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TeacherAnnouncementsPage() {
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  const { data: courses = [], isLoading } = useQuery<Course[]>({
    queryKey: ["teacher-courses"],
    queryFn: () => api.get("/api/courses").then((r) => r.data),
  });

  const activeCourseId = selectedCourse ?? courses[0]?.id ?? null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-3">📢</p>
        <p className="text-base-content/60">Create a course first to send announcements.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Announcements</h1>

      {/* Course selector */}
      <div className="tabs tabs-boxed mb-6 flex-wrap gap-1">
        {courses.map((c) => (
          <button
            key={c.id}
            className={`tab ${c.id === activeCourseId ? "tab-active" : ""}`}
            onClick={() => setSelectedCourse(c.id)}
          >
            {c.title}
          </button>
        ))}
      </div>

      {activeCourseId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Composer */}
          <div>
            <AnnouncementComposer courseId={activeCourseId} />
          </div>

          {/* History */}
          <div>
            <h2 className="text-lg font-semibold mb-2">Past Announcements</h2>
            <AnnouncementList courseId={activeCourseId} />
          </div>
        </div>
      )}
    </div>
  );
}
