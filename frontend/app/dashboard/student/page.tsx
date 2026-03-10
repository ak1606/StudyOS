"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import type { Course } from "@/types";

export default function StudentDashboard() {
  const { data: courses, isLoading } = useQuery<Course[]>({
    queryKey: ["my-courses"],
    queryFn: () => api.get("/api/courses").then((r) => r.data),
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/api/notifications?limit=5").then((r) => r.data),
  });

  const { data: quizzes } = useQuery({
    queryKey: ["student-quizzes-overview"],
    queryFn: async () => {
      if (!courses?.length) return [];
      const results = await Promise.all(
        courses.slice(0, 3).map((c) =>
          api.get(`/api/quizzes/course/${c.id}`).then((r) => r.data).catch(() => [])
        )
      );
      return results.flat().slice(0, 5);
    },
    enabled: !!courses?.length,
  });

  const enrolled = courses ?? [];
  const unreadCount = notifications?.unread_count ?? 0;
  const recentQuizzes = quizzes ?? [];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">My Learning</h1>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Enrolled Courses</div>
          <div className="stat-value">{enrolled.length}</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Active Courses</div>
          <div className="stat-value">
            {enrolled.filter((c) => c.is_published).length}
          </div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Unread Alerts</div>
          <div className="stat-value text-2xl">{unreadCount}</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Keep Going!</div>
          <div className="stat-value text-2xl">🚀</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Upcoming Quizzes */}
        <div className="card bg-base-200 lg:col-span-1">
          <div className="card-body">
            <h2 className="card-title text-lg">📝 Recent Quizzes</h2>
            {recentQuizzes.length === 0 ? (
              <p className="text-base-content/60 text-sm py-4">No quizzes available yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentQuizzes.map((q: any) => (
                  <li key={q.id}>
                    <Link
                      href={`/dashboard/student/quizzes/${q.id}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-base-300 transition-colors"
                    >
                      <span className="text-sm font-medium truncate">{q.title}</span>
                      <span className="badge badge-primary badge-sm">Take →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* AI Coach Quick Tip */}
        <div className="card bg-gradient-to-r from-primary/10 to-secondary/10 lg:col-span-2">
          <div className="card-body">
            <h2 className="card-title text-lg">🤖 AI Coach</h2>
            <p className="text-base-content/70">
              Select a course and visit the <strong>My Progress</strong> tab to get
              personalized AI coaching, concept mastery radar charts, and engagement
              trend analysis.
            </p>
            {enrolled.length > 0 && (
              <div className="card-actions mt-2">
                <Link
                  href={`/dashboard/student/courses/${enrolled[0].id}/progress`}
                  className="btn btn-primary btn-sm"
                >
                  View Progress →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Course list */}
      <h2 className="text-xl font-semibold mb-4">My Courses</h2>
      {isLoading && (
        <div className="flex justify-center py-10">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {!isLoading && enrolled.length === 0 && (
        <div className="text-center py-16">
          <p className="text-5xl mb-3">📚</p>
          <p className="text-base-content/60 mb-4">
            You haven&apos;t enrolled in any courses yet.
          </p>
          <Link href="/dashboard/student/enroll" className="btn btn-primary">
            Browse &amp; Enroll
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {enrolled.map((course) => (
          <Link
            key={course.id}
            href={`/dashboard/student/courses/${course.id}`}
            className="card bg-base-200 hover:shadow-lg transition-shadow"
          >
            <div className="card-body">
              <h3 className="card-title text-lg">{course.title}</h3>
              <p className="text-sm text-base-content/60 line-clamp-2">
                {course.description || "No description"}
              </p>
              <div className="card-actions justify-between mt-2">
                <Link
                  href={`/dashboard/student/courses/${course.id}/progress`}
                  className="badge badge-ghost badge-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  📊 Progress
                </Link>
                <span className="badge badge-primary badge-outline">
                  Continue →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
