"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import api from "@/lib/api";

export default function StudentProgressPage() {
  const params = useParams();
  const courseId = params.id as string;

  const { data, isLoading } = useQuery({
    queryKey: ["student-progress", courseId],
    queryFn: () => api.get(`/api/analytics/student/${courseId}`).then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-16 text-base-content/60">No progress data yet.</div>;
  }

  const radarData = (data.concept_mastery ?? []).map((cm: any) => ({
    concept: cm.concept,
    mastery: cm.pct,
  }));

  const trendData = (data.engagement_trend ?? []).map((val: number, i: number) => ({
    week: `W${i + 1}`,
    score: val,
  }));

  const riskColor = data.risk_level === "high" ? "text-error" : data.risk_level === "medium" ? "text-warning" : "text-success";
  const gradeColor = data.predicted_grade === "A" || data.predicted_grade === "B"
    ? "badge-success" : data.predicted_grade === "C" ? "badge-warning" : "badge-error";

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">My Progress</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Lectures Completed</div>
          <div className="stat-value text-2xl">{data.lectures_completed_pct}%</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Avg Quiz Score</div>
          <div className="stat-value text-2xl">{data.avg_quiz_score}%</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Risk Level</div>
          <div className={`stat-value text-2xl capitalize ${riskColor}`}>{data.risk_level}</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Predicted Grade</div>
          <div className="stat-value">
            <span className={`badge ${gradeColor} badge-lg`}>{data.predicted_grade}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Concept Mastery Radar */}
        {radarData.length > 0 && (
          <div className="card bg-base-200">
            <div className="card-body">
              <h2 className="card-title text-lg">Concept Mastery</h2>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="concept" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 100]} />
                  <Radar
                    name="Mastery"
                    dataKey="mastery"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Engagement Trend */}
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title text-lg">Engagement Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Coach Message */}
      <div className="card bg-gradient-to-r from-primary/10 to-secondary/10 mb-8">
        <div className="card-body">
          <h2 className="card-title text-lg">🤖 AI Coach Says</h2>
          <p className="text-base-content/80">{data.coach_message}</p>
        </div>
      </div>
    </div>
  );
}
