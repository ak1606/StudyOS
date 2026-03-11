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

const enrollSchema = z.object({
  enrollment_code: z.string().min(4, "Enter a valid enrollment code"),
});
type EnrollForm = z.infer<typeof enrollSchema>;

export default function StudentCoursesPage() {
  const queryClient = useQueryClient();
  const [showEnroll, setShowEnroll] = useState(false);

  const { data: courses = [], isLoading } = useQuery<Course[]>({
    queryKey: ["my-courses"],
    queryFn: () => api.get("/api/courses").then((r) => r.data),
  });

  const { mutate: enroll, isPending } = useMutation({
    mutationFn: (code: string) =>
      api.post("/api/courses/enroll", { enrollment_code: code }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-courses"] });
      toast.success("Enrolled successfully!");
      setShowEnroll(false);
      reset();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.detail ?? "Enrollment failed"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EnrollForm>({ resolver: zodResolver(enrollSchema) });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">My Courses</h1>
        <button className="btn btn-primary" onClick={() => setShowEnroll(true)}>
          + Enroll in Course
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {!isLoading && courses.length === 0 && (
        <div className="text-center py-20">
          <p className="text-6xl mb-4">📚</p>
          <p className="text-xl font-semibold mb-2">No courses yet</p>
          <p className="text-base-content/60 mb-6">
            Ask your teacher for an enrollment code to get started.
          </p>
          <button className="btn btn-primary" onClick={() => setShowEnroll(true)}>
            Enter Enrollment Code
          </button>
        </div>
      )}

      {/* Course Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course) => (
          <div key={course.id} className="card bg-base-200 hover:shadow-lg transition-shadow">
            <div className="card-body">
              <h3 className="card-title text-lg">{course.title}</h3>
              <p className="text-sm text-base-content/60 line-clamp-2">
                {course.description || "No description"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {course.is_published ? (
                  <span className="badge badge-success badge-sm">Active</span>
                ) : (
                  <span className="badge badge-warning badge-sm">Coming Soon</span>
                )}
              </div>
              <div className="card-actions justify-between mt-3">
                <Link
                  href={`/dashboard/student/courses/${course.id}/progress`}
                  className="btn btn-ghost btn-sm"
                >
                  📊 Progress
                </Link>
                <Link
                  href={`/dashboard/student/courses/${course.id}`}
                  className="btn btn-primary btn-sm"
                >
                  Open →
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Enroll Dialog */}
      {showEnroll && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-4">Enroll in a Course</h3>
            <form
              onSubmit={handleSubmit((d) => enroll(d.enrollment_code))}
              className="space-y-4"
            >
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Enrollment Code</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. ABC-1234"
                  className={`input input-bordered w-full ${
                    errors.enrollment_code ? "input-error" : ""
                  }`}
                  {...register("enrollment_code")}
                />
                {errors.enrollment_code && (
                  <label className="label">
                    <span className="label-text-alt text-error">
                      {errors.enrollment_code.message}
                    </span>
                  </label>
                )}
              </div>
              <div className="modal-action mt-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setShowEnroll(false); reset(); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isPending}
                >
                  {isPending ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    "Enroll"
                  )}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => { setShowEnroll(false); reset(); }} />
        </div>
      )}
    </div>
  );
}
