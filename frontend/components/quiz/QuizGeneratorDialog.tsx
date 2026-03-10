"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import type { Quiz, Question } from "@/types";

interface Props {
  courseId: string;
  onClose: () => void;
}

const BLOOM_OPTIONS = ["remember", "understand", "apply", "analyze"];

export function QuizGeneratorDialog({ courseId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"config" | "generating" | "review">("config");
  const [questionCount, setQuestionCount] = useState(10);
  const [bloomLevels, setBloomLevels] = useState<string[]>(["remember", "understand", "apply"]);
  const [isAdaptive, setIsAdaptive] = useState(false);
  const [sourceType, setSourceType] = useState<"lecture" | "material">("lecture");
  const [sourceId, setSourceId] = useState("");
  const [generatedQuizId, setGeneratedQuizId] = useState<string | null>(null);

  // Fetch course detail to get lectures/materials
  const { data: courseDetail } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => api.get(`/api/courses/${courseId}`).then((r) => r.data),
  });

  const sources = sourceType === "lecture"
    ? (courseDetail?.modules ?? []).flatMap((m: any) => m.lectures ?? [])
    : (courseDetail?.modules ?? []).flatMap((m: any) => m.materials ?? []);

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: () =>
      api.post("/api/quizzes/generate", {
        course_id: courseId,
        source_type: sourceType,
        source_id: sourceId,
        num_questions: questionCount,
        bloom_levels: bloomLevels,
        is_adaptive: isAdaptive,
      }),
    onSuccess: (res) => {
      setGeneratedQuizId(res.data.quiz_id);
      setStep("generating");
      // Poll for quiz completion
      pollForQuiz(res.data.quiz_id);
    },
    onError: () => toast.error("Failed to start quiz generation"),
  });

  // Poll for generated quiz
  const pollForQuiz = (quizId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/quizzes/${quizId}`);
        if (res.data.questions && res.data.questions.length > 0) {
          clearInterval(interval);
          setStep("review");
        }
      } catch {
        // Still generating...
      }
    }, 3000);

    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(interval);
      if (step === "generating") {
        setStep("review");
      }
    }, 120000);
  };

  // Fetch generated quiz
  const { data: quiz } = useQuery<Quiz & { questions: Question[] }>({
    queryKey: ["quiz", generatedQuizId],
    queryFn: () => api.get(`/api/quizzes/${generatedQuizId}`).then((r) => r.data),
    enabled: step === "review" && !!generatedQuizId,
    refetchInterval: step === "review" ? 5000 : false,
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: () => api.put(`/api/quizzes/${generatedQuizId}/publish`),
    onSuccess: () => {
      toast.success("Quiz published!");
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      onClose();
    },
  });

  const toggleBloom = (level: string) => {
    setBloomLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  return (
    <dialog className="modal modal-open">
      <div className="modal-box w-11/12 max-w-3xl">
        <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>✕</button>

        {step === "config" && (
          <>
            <h3 className="text-xl font-bold mb-4">🤖 Generate Quiz with AI</h3>

            <div className="form-control mb-4">
              <label className="label"><span className="label-text">Source Type</span></label>
              <select
                className="select select-bordered"
                value={sourceType}
                onChange={(e) => { setSourceType(e.target.value as any); setSourceId(""); }}
              >
                <option value="lecture">Lecture</option>
                <option value="material">Material</option>
              </select>
            </div>

            <div className="form-control mb-4">
              <label className="label"><span className="label-text">Select Source</span></label>
              <select className="select select-bordered" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Choose {sourceType}...</option>
                {sources.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>

            <div className="form-control mb-4">
              <label className="label"><span className="label-text">Number of Questions</span></label>
              <input
                type="range"
                min="5" max="30" step="5"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="range range-primary"
              />
              <div className="text-center font-semibold">{questionCount}</div>
            </div>

            <div className="form-control mb-4">
              <label className="label"><span className="label-text">Bloom Levels</span></label>
              <div className="flex flex-wrap gap-2">
                {BLOOM_OPTIONS.map((level) => (
                  <button
                    key={level}
                    className={`btn btn-sm ${bloomLevels.includes(level) ? "btn-primary" : "btn-outline"}`}
                    onClick={() => toggleBloom(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-control mb-6">
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={isAdaptive}
                  onChange={(e) => setIsAdaptive(e.target.checked)}
                />
                <span className="label-text">Adaptive Assessment</span>
              </label>
            </div>

            <div className="modal-action">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!sourceId || generateMutation.isPending}
                onClick={() => generateMutation.mutate()}
              >
                {generateMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : "Generate Quiz"}
              </button>
            </div>
          </>
        )}

        {step === "generating" && (
          <div className="flex flex-col items-center py-12">
            <span className="loading loading-ring loading-lg text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">AI is generating your quiz...</h3>
            <p className="text-base-content/60">This may take 30-60 seconds</p>
          </div>
        )}

        {step === "review" && quiz && (
          <>
            <h3 className="text-xl font-bold mb-4">📝 Review Generated Quiz</h3>
            <p className="text-sm text-base-content/60 mb-4">
              {quiz.questions?.length ?? 0} questions generated. Review and edit before publishing.
            </p>

            <div className="max-h-96 overflow-y-auto space-y-4">
              {(quiz.questions ?? []).map((q, i) => (
                <div key={q.id} className="card bg-base-200">
                  <div className="card-body p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold">Q{i + 1}. {q.question_text}</h4>
                      <div className="flex gap-1 shrink-0">
                        <span className="badge badge-sm badge-outline">{q.type}</span>
                        <span className="badge badge-sm badge-primary">D{q.difficulty}</span>
                      </div>
                    </div>
                    {q.options && (
                      <ul className="list-disc list-inside text-sm mt-2 space-y-1">
                        {q.options.map((opt, j) => (
                          <li key={j} className={opt === q.correct_answer ? "text-success font-medium" : ""}>
                            {opt} {opt === q.correct_answer && "✓"}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-base-content/50 mt-1">
                      Answer: {q.correct_answer} · {q.bloom_level} · {q.concept_tag}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-action">
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
              <button
                className="btn btn-success"
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : "Publish Quiz"}
              </button>
            </div>
          </>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
