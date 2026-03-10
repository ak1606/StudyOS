"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";

/**
 * /dashboard root → redirect to role-specific dashboard.
 */
export default function DashboardRedirect() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user?.role === "teacher") {
      router.replace("/dashboard/teacher");
    } else if (user?.role === "student") {
      router.replace("/dashboard/student");
    } else if (user?.role === "admin") {
      router.replace("/dashboard/teacher");
    }
  }, [user, router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <span className="loading loading-spinner loading-lg" />
    </div>
  );
}
