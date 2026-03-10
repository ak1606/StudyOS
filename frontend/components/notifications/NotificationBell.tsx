"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BellIcon } from "lucide-react";
import api from "@/lib/api";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/api/notifications?limit=10").then((r) => r.data),
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.put(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.put("/api/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadCount: number = data?.unread_count ?? 0;
  const items: Notification[] = data?.items ?? [];

  const typeIcon = (type: string) => {
    switch (type) {
      case "announcement": return "📢";
      case "reminder": return "⏰";
      case "alert": return "⚠️";
      case "ai_insight": return "🤖";
      default: return "🔔";
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn btn-ghost btn-circle"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        <div className="indicator">
          <BellIcon className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="indicator-item badge badge-error badge-xs">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-base-100 border border-base-300 rounded-xl shadow-xl z-50">
          <div className="flex items-center justify-between p-3 border-b border-base-300">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => markAllRead.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-center py-8 text-base-content/60 text-sm">No notifications</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-3 p-3 hover:bg-base-200 cursor-pointer border-b border-base-300/50 ${
                    !n.is_read ? "bg-primary/5" : ""
                  }`}
                  onClick={() => {
                    if (!n.is_read) markRead.mutate(n.id);
                    if (n.action_url) window.location.href = n.action_url;
                    setOpen(false);
                  }}
                >
                  <span className="text-lg">{typeIcon(n.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${!n.is_read ? "font-semibold" : ""}`}>{n.title}</p>
                    <p className="text-xs text-base-content/60 truncate">{n.body}</p>
                    <p className="text-xs text-base-content/40 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!n.is_read && <span className="w-2 h-2 bg-primary rounded-full mt-1 shrink-0" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
