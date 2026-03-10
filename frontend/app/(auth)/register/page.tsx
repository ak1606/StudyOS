"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/stores/auth-store";

const registerSchema = z
  .object({
    full_name: z
      .string()
      .min(1, "Name is required")
      .max(255, "Name is too long"),
    email: z.string().email("Please enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string(),
    role: z.enum(["teacher", "student"], {
      required_error: "Please select a role",
    }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const registerUser = useAuthStore((s) => s.register);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: "student" },
  });

  const selectedRole = watch("role");

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      await registerUser(data.email, data.password, data.full_name, data.role);
      toast.success("Account created successfully!");
      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Registration failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 px-4">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body">
          <h1 className="card-title text-2xl font-bold justify-center mb-2">
            Create Account
          </h1>
          <p className="text-center text-base-content/60 mb-6">
            Join the AI-Enhanced LMS
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Full Name */}
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Full Name</span>
              </label>
              <input
                type="text"
                placeholder="John Doe"
                className={`input input-bordered w-full ${
                  errors.full_name ? "input-error" : ""
                }`}
                {...register("full_name")}
              />
              {errors.full_name && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {errors.full_name.message}
                  </span>
                </label>
              )}
            </div>

            {/* Email */}
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Email</span>
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                className={`input input-bordered w-full ${
                  errors.email ? "input-error" : ""
                }`}
                {...register("email")}
              />
              {errors.email && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {errors.email.message}
                  </span>
                </label>
              )}
            </div>

            {/* Role Selector */}
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">I am a…</span>
              </label>
              <div className="flex gap-4">
                <label
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                    selectedRole === "student"
                      ? "border-primary bg-primary/5"
                      : "border-base-300"
                  }`}
                >
                  <input
                    type="radio"
                    className="radio radio-primary"
                    value="student"
                    {...register("role")}
                  />
                  <div>
                    <div className="font-semibold">Student</div>
                    <div className="text-xs text-base-content/60">
                      Learn &amp; explore
                    </div>
                  </div>
                </label>
                <label
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                    selectedRole === "teacher"
                      ? "border-primary bg-primary/5"
                      : "border-base-300"
                  }`}
                >
                  <input
                    type="radio"
                    className="radio radio-primary"
                    value="teacher"
                    {...register("role")}
                  />
                  <div>
                    <div className="font-semibold">Teacher</div>
                    <div className="text-xs text-base-content/60">
                      Create courses
                    </div>
                  </div>
                </label>
              </div>
              {errors.role && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {errors.role.message}
                  </span>
                </label>
              )}
            </div>

            {/* Password */}
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Password</span>
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className={`input input-bordered w-full ${
                  errors.password ? "input-error" : ""
                }`}
                {...register("password")}
              />
              {errors.password && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {errors.password.message}
                  </span>
                </label>
              )}
            </div>

            {/* Confirm Password */}
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Confirm Password</span>
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className={`input input-bordered w-full ${
                  errors.confirm_password ? "input-error" : ""
                }`}
                {...register("confirm_password")}
              />
              {errors.confirm_password && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {errors.confirm_password.message}
                  </span>
                </label>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              className={`btn btn-primary w-full ${isLoading ? "loading" : ""}`}
              disabled={isLoading}
            >
              {isLoading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <div className="divider">OR</div>

          <p className="text-center text-sm">
            Already have an account?{" "}
            <Link href="/login" className="link link-primary font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
