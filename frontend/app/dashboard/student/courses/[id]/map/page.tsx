"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";

// Dynamic import needed for SSR-incompatible canvas lib
import dynamic from "next/dynamic";
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface ConceptNode {
  id: string;
  concept: string;
  mastery: number; // 0-100
}

interface ConceptLink {
  source: string;
  target: string;
}

export default function ConceptMapPage() {
  const params = useParams();
  const courseId = params.id as string;
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  const { data: progress, isLoading } = useQuery({
    queryKey: ["student-progress", courseId],
    queryFn: () => api.get(`/api/analytics/student/${courseId}`).then((r) => r.data),
  });

  // Resize handler
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(entry.contentRect.height, 400),
        });
      }
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Build graph data from concept mastery
  const concepts: ConceptNode[] = (progress?.concept_mastery ?? []).map((cm: any) => ({
    id: cm.concept,
    concept: cm.concept,
    mastery: cm.pct,
  }));

  // Create links between adjacent concepts (simple chain graph)
  const links: ConceptLink[] = concepts.slice(0, -1).map((_, i) => ({
    source: concepts[i].id,
    target: concepts[i + 1].id,
  }));

  const masteryColor = useCallback((pct: number) => {
    if (pct >= 80) return "#22c55e"; // green
    if (pct >= 50) return "#f59e0b"; // amber
    return "#ef4444"; // red
  }, []);

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D) => {
      const label = node.concept as string;
      const mastery = node.mastery as number;
      const r = 16;

      // Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = masteryColor(mastery);
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label.length > 14 ? label.slice(0, 12) + "…" : label, node.x, node.y + 3);

      // Mastery pct above
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(`${mastery}%`, node.x, node.y - r - 6);
    },
    [masteryColor]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (concepts.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-3">🗺️</p>
        <p className="text-base-content/60">
          Take some quizzes to build your concept map.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Concept Map</h1>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-sm">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-success inline-block" /> ≥80% Mastered
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-warning inline-block" /> 50-79% Learning
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-error inline-block" /> &lt;50% Needs Work
        </span>
      </div>

      <div ref={containerRef} className="card bg-base-200 overflow-hidden" style={{ minHeight: 500 }}>
        <ForceGraph2D
          graphData={{ nodes: concepts, links }}
          width={dimensions.width}
          height={dimensions.height}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, 18, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          linkColor={() => "#6b7280"}
          linkWidth={2}
          cooldownTicks={100}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      </div>
    </div>
  );
}
