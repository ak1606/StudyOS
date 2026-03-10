"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import Link from "next/link";
import api from "@/lib/api";
import type { Course } from "@/types";

const courseSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().optional(),
});

type CourseForm = z.infer<typeof courseSchema>;

export default function TeacherCoursesPage() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);

  // ── Fetch courses ──────────────────────────────────────────────────
  const {
    data: courses,
    isLoading,
    error,
  } = useQuery<Course[]>({
    queryKey: ["courses"],
    queryFn: () => api.get("/api/courses").then((r) => r.data),
  });

  // ── Create course mutation ─────────────────────────────────────────
  const { mutate: createCourse, isPending } = useMutation({
    mutationFn: (data: CourseForm) =>
      api.post("/api/courses", data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Course created!");
      setShowDialog(false);
      reset();
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to create course");
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourseForm>({
    resolver: zodResolver(courseSchema),
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">My Courses</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowDialog(true)}
        >
          + New Course
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-error">
          <span>Failed to load courses</span>
        </div>
      )}

      {/* Empty state */}
      {courses && courses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-base-content/60">
          <span className="text-6xl mb-4">📚</span>
          <p className="text-lg">No courses yet</p>
          <p className="text-sm">
            Click &quot;New Course&quot; to create your first one.
          </p>
        </div>
      )}

      {/* Course grid */}
      {courses && courses.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/dashboard/teacher/courses/${course.id}/edit`}
              className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
            >
              <div className="card-body">
                <h2 className="card-title">{course.title}</h2>
                <p className="text-sm text-base-content/60 line-clamp-2">
                  {course.description || "No description"}
                </p>
                <div className="card-actions justify-between items-center mt-4">
                  <div
                    className={`badge ${
                      course.is_published ? "badge-success" : "badge-warning"
                    }`}
                  >
                    {course.is_published ? "Published" : "Draft"}
                  </div>
                  <div className="text-xs text-base-content/40">
                    Code: {course.enrollment_code}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── Create Course Dialog ──────────────────────────────────── */}
      <dialog
        className={`modal ${showDialog ? "modal-open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowDialog(false);
        }}
      >
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-4">Create New Course</h3>

          <form
            onSubmit={handleSubmit((data) => createCourse(data))}
            className="space-y-4"
          >
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Course Title</span>
              </label>
              <input
                type="text"
                placeholder="Introduction to Machine Learning"
                className={`input input-bordered w-full ${
                  errors.title ? "input-error" : ""
                }`}
                {...register("title")}
              />
              {errors.title && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {errors.title.message}
                  </span>
                </label>
              )}
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Description (optional)</span>
              </label>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={3}
                placeholder="A comprehensive course covering…"
                {...register("description")}
              />
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowDialog(false);
                  reset();
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn btn-primary ${isPending ? "loading" : ""}`}
                disabled={isPending}
              >
                {isPending ? "Creating…" : "Create Course"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
