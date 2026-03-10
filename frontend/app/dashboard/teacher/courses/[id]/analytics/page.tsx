"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import api from "@/lib/api";

export default function TeacherAnalyticsPage() {
  const params = useParams();
  const courseId = params.id as string;

  const { data: overview, isLoading } = useQuery({
    queryKey: ["course-overview", courseId],
    queryFn: () => api.get(`/api/analytics/course/${courseId}`).then((r) => r.data),
  });

  const { data: insight, refetch: refetchInsight, isFetching: insightFetching } = useQuery({
    queryKey: ["course-insight", courseId],
    queryFn: () => api.get(`/api/analytics/course/${courseId}/insight`).then((r) => r.data),
    enabled: !!courseId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!overview) {
    return <div className="text-center py-16 text-base-content/60">No analytics data yet.</div>;
  }

  const riskColor = (level: string) =>
    level === "high" ? "badge-error" : level === "medium" ? "badge-warning" : "badge-success";

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Course Analytics</h1>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Total Students</div>
          <div className="stat-value text-2xl">{overview.total_students}</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Avg Quiz Score</div>
          <div className="stat-value text-2xl">{overview.avg_score}%</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">At-Risk Students</div>
          <div className="stat-value text-2xl text-error">{overview.at_risk_students?.length ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Lecture Engagement */}
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title text-lg">Lecture Engagement</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={overview.lecture_engagement ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="title" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="avg_watch_pct" fill="#6366f1" name="Avg Watch %" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Confused Concepts */}
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title text-lg">Confused Concepts</h2>
            {(overview.confused_concepts ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={overview.confused_concepts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="concept" type="category" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="avg_wrong_pct" fill="#ef4444" name="Avg Wrong %" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-base-content/60 py-8 text-center">No confused concepts detected yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* At-Risk Students Table */}
      {(overview.at_risk_students ?? []).length > 0 && (
        <div className="card bg-base-200 mb-8">
          <div className="card-body">
            <h2 className="card-title text-lg">At-Risk Students</h2>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Risk Level</th>
                    <th>Avg Score</th>
                    <th>Engagement</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.at_risk_students.map((s: any) => (
                    <tr key={s.student_id}>
                      <td className="font-medium">{s.name}</td>
                      <td>
                        <span className={`badge ${riskColor(s.risk_level)} badge-sm capitalize`}>{s.risk_level}</span>
                      </td>
                      <td>{s.avg_score}%</td>
                      <td>{s.engagement_score}%</td>
                      <td>{s.last_active ? new Date(s.last_active).toLocaleDateString() : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* AI Weekly Insight */}
      <div className="card bg-gradient-to-r from-primary/10 to-secondary/10 mb-8">
        <div className="card-body">
          <div className="flex items-center justify-between mb-2">
            <h2 className="card-title text-lg">🤖 AI Weekly Insight</h2>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => refetchInsight()}
              disabled={insightFetching}
            >
              {insightFetching ? <span className="loading loading-spinner loading-xs" /> : "↻ Refresh"}
            </button>
          </div>
          {insight ? (
            <>
              <p className="text-base-content/80 whitespace-pre-line">{insight.insight_text}</p>
              <p className="text-xs text-base-content/40 mt-2">
                Generated: {new Date(insight.generated_at).toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-base-content/60">No insight generated yet. Check back after the weekly analysis runs.</p>
          )}
        </div>
      </div>
    </div>
  );
}
