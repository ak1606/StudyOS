"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import type { Course } from "@/types";
import AnnouncementComposer from "@/components/notifications/AnnouncementComposer";
import { useState } from "react";

export default function TeacherDashboard() {
  const { data: courses, isLoading } = useQuery<Course[]>({
    queryKey: ["teacher-courses"],
    queryFn: () => api.get("/api/courses").then((r) => r.data),
  });

  const [announceCourse, setAnnounceCourse] = useState<string | null>(null);
  const myCourses = courses ?? [];

  // Fetch overview for each course (limited to first 6)
  const overviewQueries = myCourses.slice(0, 6).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    is_published: c.is_published,
  }));

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Teacher Dashboard</h1>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Total Courses</div>
          <div className="stat-value">{myCourses.length}</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Published</div>
          <div className="stat-value">{myCourses.filter((c) => c.is_published).length}</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Draft</div>
          <div className="stat-value">{myCourses.filter((c) => !c.is_published).length}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 mb-8">
        <Link href="/dashboard/teacher/courses" className="btn btn-primary btn-sm">
          📚 Manage Courses
        </Link>
      </div>

      {/* Course Cards */}
      <h2 className="text-xl font-semibold mb-4">My Courses</h2>
      {isLoading && (
        <div className="flex justify-center py-10">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {overviewQueries.map((course) => (
          <CourseCard key={course.id} course={course} onAnnounce={() => setAnnounceCourse(course.id)} />
        ))}
      </div>

      {/* Announcement Composer */}
      {announceCourse && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">
              Send Announcement — {myCourses.find((c) => c.id === announceCourse)?.title}
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setAnnounceCourse(null)}>✕ Close</button>
          </div>
          <AnnouncementComposer courseId={announceCourse} />
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, onAnnounce }: { course: any; onAnnounce: () => void }) {
  const { data: overview } = useQuery({
    queryKey: ["course-overview", course.id],
    queryFn: () => api.get(`/api/analytics/course/${course.id}`).then((r) => r.data).catch(() => null),
  });

  const atRiskCount = overview?.at_risk_students?.length ?? 0;

  return (
    <div className="card bg-base-200">
      <div className="card-body">
        <div className="flex items-start justify-between">
          <h3 className="card-title text-lg">{course.title}</h3>
          {!course.is_published && <span className="badge badge-warning badge-sm">Draft</span>}
        </div>
        <p className="text-sm text-base-content/60 line-clamp-2">
          {course.description || "No description"}
        </p>

        {/* Stats from analytics */}
        <div className="flex gap-3 mt-2 text-xs">
          <span className="flex items-center gap-1">
            👥 {overview?.total_students ?? "—"}
          </span>
          <span className="flex items-center gap-1">
            📊 Avg: {overview?.avg_score ?? "—"}%
          </span>
          {atRiskCount > 0 && (
            <span className="text-error flex items-center gap-1">
              ⚠️ {atRiskCount} at-risk
            </span>
          )}
        </div>

        <div className="card-actions justify-between mt-3">
          <div className="flex gap-1">
            <Link
              href={`/dashboard/teacher/courses/${course.id}/analytics`}
              className="btn btn-ghost btn-xs"
            >
              📊 Analytics
            </Link>
            <button className="btn btn-ghost btn-xs" onClick={onAnnounce}>
              📢 Announce
            </button>
          </div>
          <Link
            href={`/dashboard/teacher/courses/${course.id}`}
            className="btn btn-primary btn-xs"
          >
            Manage →
          </Link>
        </div>
      </div>
    </div>
  );
}
