"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data considered fresh for 5 minutes — avoids redundant refetches
            staleTime: 5 * 60 * 1000,
            // Keep unused cache for 10 minutes before garbage-collecting
            gcTime: 10 * 60 * 1000,
            retry: 1,
            // Exponential back-off on retries (max 10 s)
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
