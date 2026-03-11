"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";

/**
 * Client-side auth guard. Wraps dashboard layouts.
 * Waits for Zustand persist hydration before checking auth
 * so a page reload doesn't incorrectly redirect to login.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, accessToken, loadUser } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  // Wait for Zustand to rehydrate from localStorage before doing anything
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    } else {
      const unsub = useAuthStore.persist.onFinishHydration(() =>
        setHydrated(true)
      );
      return unsub;
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    if (!accessToken) {
      router.replace("/login");
      return;
    }

    // Keep the session cookie alive
    document.cookie = `lms-session=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

    if (!user) {
      loadUser();
    }
  }, [hydrated, accessToken, user, loadUser, router]);

  // Show spinner while store is hydrating or while we have a token but no user yet
  if (!hydrated || (hydrated && !accessToken)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return <>{children}</>;
}
