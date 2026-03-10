"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import type { Course, Quiz } from "@/types";

function CourseQuizCard({ course }: { course: Course }) {
  const { data: quizzes = [], isLoading } = useQuery<Quiz[]>({
    queryKey: ["quizzes", course.id],
    queryFn: () =>
      api.get(`/api/quizzes/course/${course.id}`).then((r) => r.data),
  });

  const published = quizzes.filter((q) => q.is_published);

  if (isLoading || published.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-3">📚 {course.title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {published.map((quiz) => (
          <Link
            key={quiz.id}
            href={`/dashboard/student/quizzes/${quiz.id}`}
            className="card bg-base-200 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="card-body py-4 px-5">
              <h3 className="font-semibold text-sm">{quiz.title}</h3>
              <div className="flex gap-2 mt-1">
                <span className="badge badge-ghost badge-xs capitalize">
                  {quiz.generated_from}
                </span>
                {quiz.is_adaptive && (
                  <span className="badge badge-primary badge-xs">Adaptive</span>
                )}
              </div>
              <div className="card-actions justify-end mt-2">
                <span className="btn btn-primary btn-xs">Start →</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function StudentQuizzesPage() {
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
        <p className="text-5xl mb-3">📝</p>
        <p className="text-base-content/60 mb-4">Enroll in a course to see quizzes.</p>
        <Link href="/dashboard/student/enroll" className="btn btn-primary">
          Browse Courses
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">My Quizzes</h1>
      {courses.map((course) => (
        <CourseQuizCard key={course.id} course={course} />
      ))}
    </div>
  );
}
