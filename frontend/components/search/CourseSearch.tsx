"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import api from "@/lib/api";
import type { Source } from "@/types";

interface SearchResult {
  chunk_id: string;
  course_id: string;
  source_type: string;
  source_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

interface Props {
  courseId: string;
  onNavigate?: (sourceId: string, sourceType: string) => void;
}

export default function CourseSearch({ courseId, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery<{ query: string; results: SearchResult[] }>({
    queryKey: ["search", courseId, debouncedQuery],
    queryFn: () =>
      api
        .get(`/api/courses/${courseId}/search`, {
          params: { q: debouncedQuery, top_k: 5 },
        })
        .then((r) => r.data),
    enabled: debouncedQuery.length >= 2,
  });

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const results = data?.results ?? [];

  const sourceLabel = useCallback((r: SearchResult) => {
    if (r.metadata) {
      return (
        (r.metadata as Record<string, string>).lecture_title ??
        (r.metadata as Record<string, string>).material_title ??
        r.source_type
      );
    }
    return r.source_type;
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <div className="relative">
        <input
          type="text"
          className="input input-bordered w-full pl-10"
          placeholder="Search course content…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.length >= 2 && setOpen(true)}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40">
          🔍
        </span>
        {isFetching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 loading loading-spinner loading-xs" />
        )}
      </div>

      {/* Dropdown */}
      {open && debouncedQuery.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-base-300 bg-base-100 shadow-lg max-h-80 overflow-y-auto">
          {results.length === 0 && !isFetching && (
            <p className="p-3 text-sm text-base-content/50">No results found.</p>
          )}
          {results.map((r) => (
            <button
              key={r.chunk_id}
              className="w-full text-left p-3 hover:bg-base-200 transition-colors border-b border-base-200 last:border-0"
              onClick={() => {
                onNavigate?.(r.source_id, r.source_type);
                setOpen(false);
                setQuery("");
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="badge badge-xs badge-ghost">
                  {r.source_type.replace("_", " ")}
                </span>
                <span className="text-xs text-base-content/40">
                  {Math.round(r.score * 100)}% match
                </span>
              </div>
              <p className="text-sm line-clamp-2">{r.content}</p>
              <p className="text-xs text-primary mt-1 truncate">
                {sourceLabel(r)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
