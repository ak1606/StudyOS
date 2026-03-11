"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────

interface TableInfo {
  name: string;
  row_count: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}

interface RowsResponse {
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

// ── Schema panel ──────────────────────────────────────────────────────

function SchemaPanel({ tableName }: { tableName: string }) {
  const { data, isLoading } = useQuery<ColumnInfo[]>({
    queryKey: ["db-schema", tableName],
    queryFn: () =>
      api.get(`/api/admin/db/tables/${tableName}/schema`).then((r) => r.data),
    staleTime: 60_000,
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 p-4 text-sm">
        <span className="loading loading-spinner loading-xs" /> Loading schema…
      </div>
    );

  return (
    <div className="overflow-x-auto">
      <table className="table table-xs w-full">
        <thead>
          <tr>
            <th>Column</th>
            <th>Type</th>
            <th>Nullable</th>
            <th>Default</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((col) => (
            <tr key={col.name}>
              <td className="font-mono font-medium">{col.name}</td>
              <td className="font-mono text-info">{col.type}</td>
              <td>
                {col.nullable ? (
                  <span className="badge badge-ghost badge-xs">null</span>
                ) : (
                  <span className="badge badge-error badge-xs">NOT NULL</span>
                )}
              </td>
              <td className="font-mono text-xs text-base-content/50">
                {col.default ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Rows panel ────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

function RowsPanel({ tableName }: { tableName: string }) {
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching } = useQuery<RowsResponse>({
    queryKey: ["db-rows", tableName, page],
    queryFn: () =>
      api
        .get(
          `/api/admin/db/tables/${tableName}/rows?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
        )
        .then((r) => r.data),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 p-4 text-sm">
        <span className="loading loading-spinner loading-xs" /> Loading rows…
      </div>
    );

  if (!data) return null;

  const totalPages = Math.ceil(data.total / PAGE_SIZE);

  return (
    <div>
      {/* Row count + pagination */}
      <div className="flex items-center justify-between px-1 py-2 text-sm text-base-content/60">
        <span>
          {data.total.toLocaleString()} rows · showing{" "}
          {data.offset + 1}–{Math.min(data.offset + PAGE_SIZE, data.total)}
        </span>
        <div className="flex items-center gap-2">
          {isFetching && <span className="loading loading-spinner loading-xs" />}
          <div className="join">
            <button
              className="join-item btn btn-xs"
              disabled={page === 0}
              onClick={() => setPage(0)}
            >
              «
            </button>
            <button
              className="join-item btn btn-xs"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </button>
            <button className="join-item btn btn-xs btn-disabled">
              {page + 1} / {totalPages || 1}
            </button>
            <button
              className="join-item btn btn-xs"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </button>
            <button
              className="join-item btn btn-xs"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(totalPages - 1)}
            >
              »
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="table table-xs table-pin-rows w-full">
          <thead>
            <tr>
              {data.columns.map((col) => (
                <th key={col} className="font-mono whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={data.columns.length}
                  className="text-center py-8 text-base-content/50"
                >
                  No rows
                </td>
              </tr>
            ) : (
              data.rows.map((row, i) => (
                <tr key={i} className="hover">
                  {data.columns.map((col) => {
                    const val = row[col];
                    const str =
                      val === null || val === undefined
                        ? "NULL"
                        : typeof val === "object"
                        ? JSON.stringify(val)
                        : String(val);
                    return (
                      <td
                        key={col}
                        className={`font-mono text-xs max-w-xs truncate ${
                          val === null || val === undefined
                            ? "text-base-content/30 italic"
                            : ""
                        }`}
                        title={str}
                      >
                        {str}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function DBBrowserPage() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"rows" | "schema">("rows");

  const { data: tables, isLoading } = useQuery<TableInfo[]>({
    queryKey: ["db-tables"],
    queryFn: () => api.get("/api/admin/db/tables").then((r) => r.data),
    staleTime: 30_000,
  });

  return (
    <div className="max-w-full">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">🗄️ DB Browser</h1>
        <p className="text-sm text-base-content/60 mt-1">
          Inspect database tables — read-only view.
        </p>
      </div>

      <div className="flex gap-4 h-[calc(100vh-10rem)]">
        {/* ── Table List ── */}
        <div className="w-56 shrink-0 bg-base-200 rounded-xl overflow-y-auto">
          <div className="p-3 font-semibold text-sm border-b border-base-300 sticky top-0 bg-base-200">
            Tables
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner" />
            </div>
          ) : (
            <ul className="menu menu-sm p-2 gap-0.5">
              {(tables ?? []).map((t) => (
                <li key={t.name}>
                  <button
                    className={`flex items-center justify-between ${
                      selectedTable === t.name ? "active" : ""
                    }`}
                    onClick={() => {
                      setSelectedTable(t.name);
                      setActiveTab("rows");
                    }}
                  >
                    <span className="font-mono truncate text-xs">{t.name}</span>
                    <span className="badge badge-ghost badge-xs shrink-0">
                      {t.row_count.toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 min-w-0 bg-base-100 rounded-xl border border-base-300 overflow-hidden flex flex-col">
          {!selectedTable ? (
            <div className="flex flex-col items-center justify-center flex-1 text-base-content/50">
              <span className="text-5xl mb-3">👈</span>
              <p>Select a table</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 px-4 pt-4 border-b border-base-300 shrink-0">
                <h2 className="font-mono font-bold text-lg">{selectedTable}</h2>
                <div className="tabs tabs-boxed tabs-sm ml-auto mb-2">
                  <button
                    className={`tab ${activeTab === "rows" ? "tab-active" : ""}`}
                    onClick={() => setActiveTab("rows")}
                  >
                    📋 Rows
                  </button>
                  <button
                    className={`tab ${activeTab === "schema" ? "tab-active" : ""}`}
                    onClick={() => setActiveTab("schema")}
                  >
                    🏗️ Schema
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                {activeTab === "rows" ? (
                  <RowsPanel key={selectedTable} tableName={selectedTable} />
                ) : (
                  <SchemaPanel key={selectedTable} tableName={selectedTable} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
