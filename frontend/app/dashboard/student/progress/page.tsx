"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import type { Course } from "@/types";

function CourseProgressCard({ course }: { course: Course }) {
  const { data, isLoading } = useQuery({
    queryKey: ["student-progress", course.id],
    queryFn: () =>
      api
        .get(`/api/analytics/student/${course.id}`)
        .then((r) => r.data)
        .catch(() => null),
  });

  const riskColor =
    data?.risk_level === "high"
      ? "badge-error"
      : data?.risk_level === "medium"
      ? "badge-warning"
      : "badge-success";

  return (
    <div className="card bg-base-200">
      <div className="card-body">
        <h3 className="card-title text-base">{course.title}</h3>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-sm" />
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-2 my-2 text-center text-sm">
              <div>
                <div className="font-bold text-lg">{data.lectures_completed_pct}%</div>
                <div className="text-base-content/60 text-xs">Lectures</div>
              </div>
              <div>
                <div className="font-bold text-lg">{data.avg_quiz_score}%</div>
                <div className="text-base-content/60 text-xs">Avg Score</div>
              </div>
              <div>
                <span className={`badge ${riskColor} badge-sm capitalize`}>
                  {data.risk_level}
                </span>
                <div className="text-base-content/60 text-xs mt-1">Risk</div>
              </div>
            </div>

            {/* Completion bar */}
            <progress
              className="progress progress-primary w-full"
              value={data.lectures_completed_pct}
              max={100}
            />
          </>
        ) : (
          <p className="text-sm text-base-content/60 py-2">No data yet — watch some lectures!</p>
        )}

        <div className="card-actions justify-end mt-2">
          <Link
            href={`/dashboard/student/courses/${course.id}/progress`}
            className="btn btn-primary btn-xs"
          >
            Full Progress →
          </Link>
          <Link
            href={`/dashboard/student/courses/${course.id}/map`}
            className="btn btn-ghost btn-xs"
          >
            🗺️ Map
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function StudentProgressPage() {
  const { data: courses = [], isLoading } = useQuery<Course[]>({
    queryKey: ["my-courses"],
    queryFn: () => api.get("/api/courses").then((r) => r.data),
  });

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
        <p className="text-5xl mb-3">📊</p>
        <p className="text-base-content/60 mb-4">Enroll in a course to track your progress.</p>
        <Link href="/dashboard/student/enroll" className="btn btn-primary">
          Browse Courses
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">My Progress</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {courses.map((course) => (
          <CourseProgressCard key={course.id} course={course} />
        ))}
      </div>
    </div>
  );
}
