"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import NotificationBell from "@/components/notifications/NotificationBell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex items-center justify-end gap-2 px-6 py-3 border-b border-base-300 bg-base-100 shrink-0">
            <NotificationBell />
          </header>
          <main className="flex-1 overflow-y-auto bg-base-100">
            <div className="page-container">{children}</div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
