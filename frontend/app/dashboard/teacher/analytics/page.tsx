"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import api from "@/lib/api";
import type { Course } from "@/types";

function CourseAnalyticsCard({ course }: { course: Course }) {
  const { data: overview, isLoading } = useQuery({
    queryKey: ["course-overview", course.id],
    queryFn: () =>
      api
        .get(`/api/analytics/course/${course.id}`)
        .then((r) => r.data)
        .catch(() => null),
  });

  const atRiskCount = overview?.at_risk_students?.length ?? 0;
  const riskBadge =
    atRiskCount > 0
      ? atRiskCount >= 3
        ? "badge-error"
        : "badge-warning"
      : "badge-success";

  return (
    <div className="card bg-base-200">
      <div className="card-body">
        <div className="flex items-start justify-between">
          <h3 className="card-title text-base">{course.title}</h3>
          {!course.is_published && (
            <span className="badge badge-warning badge-sm">Draft</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-sm" />
          </div>
        ) : overview ? (
          <>
            <div className="flex gap-4 text-sm my-2">
              <span>👥 {overview.total_students} students</span>
              <span>📊 Avg: {overview.avg_score ?? "—"}%</span>
              <span className={`badge ${riskBadge} badge-sm`}>
                {atRiskCount > 0 ? `⚠️ ${atRiskCount} at-risk` : "✅ All good"}
              </span>
            </div>

            {/* Lecture engagement mini bar */}
            {overview.lecture_engagement?.length > 0 && (
              <ResponsiveContainer width="100%" height={80}>
                <BarChart
                  data={overview.lecture_engagement.slice(0, 6)}
                  margin={{ top: 0, right: 0, left: -30, bottom: 0 }}
                >
                  <XAxis dataKey="title" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    formatter={(v: number) => `${v}%`}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.title ?? ""
                    }
                  />
                  <Bar dataKey="avg_watch_pct" fill="#6366f1" radius={2} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </>
        ) : (
          <p className="text-sm text-base-content/60">No data yet.</p>
        )}

        <div className="card-actions justify-end mt-1">
          <Link
            href={`/dashboard/teacher/courses/${course.id}/analytics`}
            className="btn btn-primary btn-xs"
          >
            Full Analytics →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function TeacherAnalyticsPage() {
  const { data: courses = [], isLoading } = useQuery<Course[]>({
    queryKey: ["teacher-courses"],
    queryFn: () => api.get("/api/courses").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Analytics Overview</h1>

      {courses.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-3">📊</p>
          <p className="text-base-content/60 mb-4">
            Create and publish a course to see analytics.
          </p>
          <Link href="/dashboard/teacher/courses" className="btn btn-primary">
            Go to Courses
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {courses.map((course) => (
            <CourseAnalyticsCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}
