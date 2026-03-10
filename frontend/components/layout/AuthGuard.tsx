"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";

/**
 * Client-side auth guard. Wraps dashboard layouts.
 * Sets the `lms-session` cookie so edge middleware can check it.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, accessToken, loadUser } = useAuthStore();

  useEffect(() => {
    if (!accessToken) {
      router.replace("/login");
      return;
    }

    // Set a thin cookie for middleware
    document.cookie = `lms-session=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

    if (!user) {
      loadUser();
    }
  }, [accessToken, user, loadUser, router]);

  if (!accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return <>{children}</>;
}
