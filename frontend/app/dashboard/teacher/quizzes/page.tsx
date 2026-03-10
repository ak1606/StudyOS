"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import type { Course, Quiz } from "@/types";
import { QuizGeneratorDialog } from "@/components/quiz/QuizGeneratorDialog";

export default function TeacherQuizzesPage() {
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [generatorCourse, setGeneratorCourse] = useState<string | null>(null);

  const { data: courses = [] } = useQuery<Course[]>({
    queryKey: ["teacher-courses"],
    queryFn: () => api.get("/api/courses").then((r) => r.data),
  });

  const activeCourseId = selectedCourse ?? courses[0]?.id ?? null;

  const { data: quizzes = [], isLoading } = useQuery<Quiz[]>({
    queryKey: ["quizzes", activeCourseId],
    queryFn: () =>
      api.get(`/api/quizzes/course/${activeCourseId}`).then((r) => r.data),
    enabled: !!activeCourseId,
  });

  const activeCourse = courses.find((c) => c.id === activeCourseId);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Quizzes</h1>
        {activeCourseId && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setGeneratorCourse(activeCourseId)}
          >
            ✨ Generate Quiz
          </button>
        )}
      </div>

      {/* Course selector tabs */}
      {courses.length > 0 && (
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
      )}

      {courses.length === 0 && (
        <div className="text-center py-16">
          <p className="text-5xl mb-3">📚</p>
          <p className="text-base-content/60 mb-4">Create a course first to add quizzes.</p>
          <Link href="/dashboard/teacher/courses" className="btn btn-primary">
            Go to Courses
          </Link>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-10">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {!isLoading && quizzes.length === 0 && activeCourseId && (
        <div className="text-center py-16">
          <p className="text-5xl mb-3">📝</p>
          <p className="text-base-content/60 mb-4">
            No quizzes yet for <strong>{activeCourse?.title}</strong>.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setGeneratorCourse(activeCourseId)}
          >
            ✨ Generate First Quiz
          </button>
        </div>
      )}

      {!isLoading && quizzes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table table-zebra w-full">
            <thead>
              <tr>
                <th>Title</th>
                <th>Source</th>
                <th>Adaptive</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {quizzes.map((quiz) => (
                <tr key={quiz.id}>
                  <td className="font-medium">{quiz.title}</td>
                  <td>
                    <span className="badge badge-ghost badge-sm capitalize">
                      {quiz.generated_from}
                    </span>
                  </td>
                  <td>{quiz.is_adaptive ? "✅" : "—"}</td>
                  <td>
                    <span
                      className={`badge badge-sm ${
                        quiz.is_published ? "badge-success" : "badge-warning"
                      }`}
                    >
                      {quiz.is_published ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/dashboard/teacher/quizzes/${quiz.id}`}
                      className="btn btn-ghost btn-xs"
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quiz Generator Dialog */}
      {generatorCourse && (
        <QuizGeneratorDialog
          courseId={generatorCourse}
          onClose={() => setGeneratorCourse(null)}
        />
      )}
    </div>
  );
}
