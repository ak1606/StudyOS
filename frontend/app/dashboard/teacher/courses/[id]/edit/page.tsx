"use client";

import { useCallback, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import api from "@/lib/api";
import type { CourseDetail, CourseModule, Lecture } from "@/types";

// ── Schemas ──────────────────────────────────────────────────────────

const moduleSchema = z.object({
  title: z.string().min(1, "Required").max(200),
  description: z.string().optional(),
});
type ModuleForm = z.infer<typeof moduleSchema>;

const youtubeSchema = z.object({
  title: z.string().min(1, "Required").max(200),
  youtube_url: z.string().url("Must be a valid URL"),
  description: z.string().optional(),
});
type YouTubeForm = z.infer<typeof youtubeSchema>;

const materialSchema = z.object({
  title: z.string().min(1, "Required").max(200),
  type: z.enum(["pdf", "youtube", "link", "file"]),
  external_url: z.string().url().optional().or(z.literal("")),
});
type MaterialForm = z.infer<typeof materialSchema>;

// ── Sortable Module Item ─────────────────────────────────────────────

function SortableModule({
  module,
  isActive,
  onClick,
}: {
  module: CourseModule;
  isActive: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border-2 p-3 cursor-pointer transition-colors ${
        isActive ? "border-primary bg-primary/5" : "border-base-300 hover:border-base-content/20"
      }`}
      onClick={onClick}
    >
      <button
        className="cursor-grab text-base-content/40 hover:text-base-content"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{module.title}</p>
        <p className="text-xs text-base-content/50">
          {module.lectures.length} lectures · {module.materials.length} materials
        </p>
      </div>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "badge-warning",
    processing: "badge-info",
    ready: "badge-success",
    failed: "badge-error",
  };
  return <span className={`badge badge-sm ${map[status] ?? ""}`}>{status}</span>;
}

// ── Main Page ────────────────────────────────────────────────────────

export default function CourseEditPage() {
  const params = useParams();
  const courseId = params.id as string;
  const queryClient = useQueryClient();

  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [showModuleDialog, setShowModuleDialog] = useState(false);
  const [showMaterialDialog, setShowMaterialDialog] = useState(false);
  const [lectureTab, setLectureTab] = useState<"upload" | "youtube">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ── Query: course detail ───────────────────────────────────────────
  const { data: course, isLoading } = useQuery<CourseDetail>({
    queryKey: ["course", courseId],
    queryFn: () => api.get(`/api/courses/${courseId}`).then((r) => r.data),
  });

  // ── Mutation: create module ────────────────────────────────────────
  const { mutate: addModule, isPending: addingModule } = useMutation({
    mutationFn: (data: ModuleForm) =>
      api.post(`/api/courses/${courseId}/modules`, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      toast.success("Module added");
      setShowModuleDialog(false);
      resetModule();
    },
    onError: () => toast.error("Failed to add module"),
  });

  // ── Mutation: add material ─────────────────────────────────────────
  const { mutate: addMaterial, isPending: addingMaterial } = useMutation({
    mutationFn: (data: MaterialForm) =>
      api
        .post(`/api/materials/modules/${activeModuleId}/materials`, {
          ...data,
          file_url: null,
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      toast.success("Material added");
      setShowMaterialDialog(false);
      resetMaterial();
    },
    onError: () => toast.error("Failed to add material"),
  });

  // ── Mutation: add YouTube lecture ────────────────────────────────
  const { mutate: addYoutubeLecture, isPending: addingYoutube } = useMutation({
    mutationFn: (data: YouTubeForm) =>
      api
        .post("/api/lectures/youtube", {
          module_id: activeModuleId,
          title: data.title,
          description: data.description ?? "",
          youtube_url: data.youtube_url,
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      toast.success("YouTube lecture added — transcript being fetched!");
      resetYouTube();
    },
    onError: () => toast.error("Failed to add YouTube lecture"),
  });

  // ── Forms ──────────────────────────────────────────────────────────
  const {
    register: regModule,
    handleSubmit: submitModule,
    reset: resetModule,
    formState: { errors: moduleErrors },
  } = useForm<ModuleForm>({ resolver: zodResolver(moduleSchema) });

  const {
    register: regMaterial,
    handleSubmit: submitMaterial,
    reset: resetMaterial,
    formState: { errors: materialErrors },
  } = useForm<MaterialForm>({
    resolver: zodResolver(materialSchema),
    defaultValues: { type: "youtube" },
  });

  const {
    register: regYouTube,
    handleSubmit: submitYouTube,
    reset: resetYouTube,
    formState: { errors: youtubeErrors },
  } = useForm<YouTubeForm>({ resolver: zodResolver(youtubeSchema) });

  // ── Upload video ───────────────────────────────────────────────────
  const handleVideoUpload = useCallback(
    async (file: File) => {
      if (!activeModuleId) {
        toast.error("Select a module first");
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "video");
        formData.append("course_id", courseId);
        formData.append("module_id", activeModuleId);
        formData.append("title", file.name.replace(/\.[^.]+$/, ""));

        await api.post("/api/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        queryClient.invalidateQueries({ queryKey: ["course", courseId] });
        toast.success("Video uploaded — transcription started!");
      } catch {
        toast.error("Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [activeModuleId, courseId, queryClient]
  );

  // ── DnD handler ────────────────────────────────────────────────────
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !course) return;

      const oldIndex = course.modules.findIndex((m) => m.id === active.id);
      const newIndex = course.modules.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(course.modules, oldIndex, newIndex);
      // Optimistic update
      queryClient.setQueryData(["course", courseId], {
        ...course,
        modules: reordered,
      });

      // Persist new order
      try {
        await api.put(`/api/courses/modules/${active.id}`, {
          order_index: newIndex,
        });
      } catch {
        queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      }
    },
    [course, courseId, queryClient]
  );

  const activeModule = course?.modules.find((m) => m.id === activeModuleId);

  // ── Loading ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="alert alert-error">Course not found</div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{course.title}</h1>
        <p className="text-base-content/60 mt-1">
          {course.description || "No description"}
        </p>
        <div className="flex gap-2 mt-2">
          <span
            className={`badge ${
              course.is_published ? "badge-success" : "badge-warning"
            }`}
          >
            {course.is_published ? "Published" : "Draft"}
          </span>
          <span className="badge badge-outline">
            Code: {course.enrollment_code}
          </span>
        </div>
      </div>

      <div className="flex gap-6">
        {/* ── Left Sidebar: Modules ──────────────────────────────── */}
        <div className="w-72 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Modules</h2>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setShowModuleDialog(true)}
            >
              + Add
            </button>
          </div>

          {course.modules.length === 0 && (
            <p className="text-sm text-base-content/50 py-4 text-center">
              No modules yet. Add one to get started.
            </p>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={course.modules.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {course.modules.map((mod) => (
                  <SortableModule
                    key={mod.id}
                    module={mod}
                    isActive={mod.id === activeModuleId}
                    onClick={() => setActiveModuleId(mod.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* ── Right Content: Selected Module ─────────────────────── */}
        <div className="flex-1 min-w-0">
          {!activeModule ? (
            <div className="flex flex-col items-center justify-center py-20 text-base-content/50">
              <span className="text-5xl mb-3">👈</span>
              <p>Select a module from the sidebar</p>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">{activeModule.title}</h2>

              {/* ── Lectures ──────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Lectures</h3>
                </div>

                {/* Tabs: Upload vs YouTube */}
                <div className="tabs tabs-boxed mb-4">
                  <button
                    className={`tab ${lectureTab === "upload" ? "tab-active" : ""}`}
                    onClick={() => setLectureTab("upload")}
                  >
                    📹 Upload Video
                  </button>
                  <button
                    className={`tab ${lectureTab === "youtube" ? "tab-active" : ""}`}
                    onClick={() => setLectureTab("youtube")}
                  >
                    ▶️ YouTube URL
                  </button>
                </div>

                {lectureTab === "upload" ? (
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors mb-4 ${
                      uploading
                        ? "border-info bg-info/5"
                        : "border-base-300 hover:border-primary"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) handleVideoUpload(file);
                    }}
                  >
                    {uploading ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="loading loading-spinner" />
                        <span>Uploading…</span>
                      </div>
                    ) : (
                      <>
                        <p className="text-lg">📹 Drop a video here or click to upload</p>
                        <p className="text-xs text-base-content/50 mt-1">
                          MP4, WebM, MOV — max 500 MB
                        </p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleVideoUpload(file);
                      }}
                    />
                  </div>
                ) : (
                  <form
                    onSubmit={submitYouTube((d) => addYoutubeLecture(d))}
                    className="space-y-3 mb-4 bg-base-200 rounded-lg p-4"
                  >
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text">Lecture Title</span>
                      </label>
                      <input
                        type="text"
                        className={`input input-bordered input-sm w-full ${
                          youtubeErrors.title ? "input-error" : ""
                        }`}
                        placeholder="e.g. Introduction to Variables"
                        {...regYouTube("title")}
                      />
                      {youtubeErrors.title && (
                        <span className="text-error text-xs mt-1">
                          {youtubeErrors.title.message}
                        </span>
                      )}
                    </div>
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text">YouTube URL</span>
                      </label>
                      <input
                        type="url"
                        className={`input input-bordered input-sm w-full ${
                          youtubeErrors.youtube_url ? "input-error" : ""
                        }`}
                        placeholder="https://www.youtube.com/watch?v=..."
                        {...regYouTube("youtube_url")}
                      />
                      {youtubeErrors.youtube_url && (
                        <span className="text-error text-xs mt-1">
                          {youtubeErrors.youtube_url.message}
                        </span>
                      )}
                    </div>
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text">Description (optional)</span>
                      </label>
                      <input
                        type="text"
                        className="input input-bordered input-sm w-full"
                        placeholder="Brief description…"
                        {...regYouTube("description")}
                      />
                    </div>
                    <button
                      type="submit"
                      className={`btn btn-primary btn-sm w-full ${
                        addingYoutube ? "loading" : ""
                      }`}
                      disabled={addingYoutube || !activeModuleId}
                    >
                      {addingYoutube ? "Adding…" : "▶️ Add YouTube Lecture"}
                    </button>
                  </form>
                )}

                {/* Lecture list */}
                {activeModule.lectures.length === 0 ? (
                  <p className="text-sm text-base-content/50">
                    No lectures yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeModule.lectures.map((lec: Lecture) => (
                      <a
                        key={lec.id}
                        href={`/dashboard/lecture/${lec.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-lg border border-base-300 p-3 hover:border-primary transition-colors"
                      >
                        <span className="text-lg">
                          {(lec.video_url ?? "").includes("youtube") ||
                          (lec.video_url ?? "").includes("youtu.be")
                            ? "▶️"
                            : "🎬"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{lec.title}</p>
                          <p className="text-xs text-base-content/50 truncate">
                            {lec.video_url}
                          </p>
                        </div>
                        <StatusBadge status={lec.status} />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Materials ─────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Materials</h3>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => setShowMaterialDialog(true)}
                  >
                    + Add Material
                  </button>
                </div>

                {activeModule.materials.length === 0 ? (
                  <p className="text-sm text-base-content/50">
                    No materials yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeModule.materials.map((mat) => (
                      <div
                        key={mat.id}
                        className="flex items-center gap-3 rounded-lg border border-base-300 p-3"
                      >
                        <span className="text-lg">
                          {mat.type === "pdf" ? "📄" : mat.type === "youtube" ? "▶️" : "🔗"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{mat.title}</p>
                          <p className="text-xs text-base-content/50">
                            {mat.type}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Module Dialog ─────────────────────────────────────────── */}
      <dialog className={`modal ${showModuleDialog ? "modal-open" : ""}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-4">Add Module</h3>
          <form
            onSubmit={submitModule((d) => addModule(d))}
            className="space-y-4"
          >
            <div className="form-control">
              <label className="label">
                <span className="label-text">Title</span>
              </label>
              <input
                type="text"
                className={`input input-bordered w-full ${
                  moduleErrors.title ? "input-error" : ""
                }`}
                {...regModule("title")}
              />
              {moduleErrors.title && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {moduleErrors.title.message}
                  </span>
                </label>
              )}
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Description</span>
              </label>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                {...regModule("description")}
              />
            </div>
            <div className="modal-action">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowModuleDialog(false);
                  resetModule();
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn btn-primary ${addingModule ? "loading" : ""}`}
                disabled={addingModule}
              >
                Add Module
              </button>
            </div>
          </form>
        </div>
      </dialog>

      {/* ── Material Dialog ───────────────────────────────────────── */}
      <dialog className={`modal ${showMaterialDialog ? "modal-open" : ""}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-4">Add Material</h3>
          <form
            onSubmit={submitMaterial((d) => addMaterial(d))}
            className="space-y-4"
          >
            <div className="form-control">
              <label className="label">
                <span className="label-text">Title</span>
              </label>
              <input
                type="text"
                className={`input input-bordered w-full ${
                  materialErrors.title ? "input-error" : ""
                }`}
                {...regMaterial("title")}
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Type</span>
              </label>
              <select
                className="select select-bordered w-full"
                {...regMaterial("type")}
              >
                <option value="youtube">YouTube Link</option>
                <option value="link">External Link</option>
                <option value="pdf">PDF (upload separately)</option>
                <option value="file">Other File</option>
              </select>
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">URL</span>
              </label>
              <input
                type="url"
                className="input input-bordered w-full"
                placeholder="https://..."
                {...regMaterial("external_url")}
              />
            </div>
            <div className="modal-action">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowMaterialDialog(false);
                  resetMaterial();
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn btn-primary ${addingMaterial ? "loading" : ""}`}
                disabled={addingMaterial}
              >
                Add Material
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
