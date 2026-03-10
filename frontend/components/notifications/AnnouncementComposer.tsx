"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";

interface Props {
  courseId: string;
}

export default function AnnouncementComposer({ courseId }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [intent, setIntent] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const qc = useQueryClient();

  const draftMutation = useMutation({
    mutationFn: (intent: string) =>
      api.post("/api/announcements/draft", { intent, course_id: courseId }).then((r) => r.data),
    onSuccess: (data) => {
      setTitle(data.title);
      setBody(data.body);
      setIntent("");
      toast.success("AI draft generated!");
    },
    onError: () => toast.error("Failed to generate AI draft"),
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/courses/${courseId}/announcements`, {
        title,
        body,
        ...(scheduled && scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
      }),
    onSuccess: () => {
      toast.success(scheduled ? "Announcement scheduled!" : "Announcement sent!");
      setTitle("");
      setBody("");
      setScheduled(false);
      setScheduledAt("");
      qc.invalidateQueries({ queryKey: ["announcements", courseId] });
    },
    onError: () => toast.error("Failed to create announcement"),
  });

  return (
    <div className="card bg-base-200">
      <div className="card-body">
        <h2 className="card-title text-lg">Create Announcement</h2>

        {/* AI Draft */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            className="input input-bordered flex-1 input-sm"
            placeholder="Describe your intent, e.g. 'Remind students about next quiz deadline'"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => draftMutation.mutate(intent)}
            disabled={!intent.trim() || draftMutation.isPending}
          >
            {draftMutation.isPending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "✨ Write with AI"
            )}
          </button>
        </div>

        {/* Title */}
        <input
          type="text"
          className="input input-bordered w-full mb-3"
          placeholder="Announcement title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* Body */}
        <textarea
          className="textarea textarea-bordered w-full min-h-[120px] mb-3"
          placeholder="Announcement body…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        {/* Schedule Toggle */}
        <div className="flex items-center gap-3 mb-4">
          <label className="label cursor-pointer gap-2">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={scheduled}
              onChange={(e) => setScheduled(e.target.checked)}
            />
            <span className="label-text text-sm">Schedule for later</span>
          </label>
          {scheduled && (
            <input
              type="datetime-local"
              className="input input-bordered input-sm"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          )}
        </div>

        <button
          className="btn btn-primary"
          onClick={() => publishMutation.mutate()}
          disabled={!title.trim() || !body.trim() || publishMutation.isPending || (scheduled && !scheduledAt)}
        >
          {publishMutation.isPending ? (
            <span className="loading loading-spinner loading-sm" />
          ) : scheduled ? (
            "📅 Schedule"
          ) : (
            "📢 Send Now"
          )}
        </button>
      </div>
    </div>
  );
}
