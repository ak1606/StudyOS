"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import type { Question } from "@/types";

export default function StudentQuizPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = params.id as string;

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [feedback, setFeedback] = useState<{
    is_correct: boolean;
    correct_answer: string;
    explanation: string;
  } | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [showResults, setShowResults] = useState(false);

  // Fetch quiz info
  const { data: quiz } = useQuery({
    queryKey: ["quiz", quizId],
    queryFn: () => api.get(`/api/quizzes/${quizId}`).then((r) => r.data),
  });

  const totalQuestions = quiz?.questions?.length ?? 0;

  // Start attempt
  const startMutation = useMutation({
    mutationFn: () => api.post(`/api/quizzes/${quizId}/attempts`),
    onSuccess: (res) => {
      setAttemptId(res.data.id);
    },
    onError: () => toast.error("Failed to start quiz"),
  });

  // Fetch next question
  const fetchNext = async (aid: string) => {
    try {
      const res = await api.get(`/api/quizzes/${quizId}/attempts/${aid}/next`);
      if (res.data) {
        setCurrentQuestion(res.data);
        setSelectedAnswer("");
        setFeedback(null);
      } else {
        // No more questions
        setShowResults(true);
      }
    } catch {
      setShowResults(true);
    }
  };

  // Submit answer
  const answerMutation = useMutation({
    mutationFn: (answer: string) =>
      api.post(`/api/quizzes/${quizId}/attempts/${attemptId}/answer`, {
        question_id: currentQuestion?.id,
        student_answer: answer,
      }),
    onSuccess: (res) => {
      setFeedback(res.data);
      setAnsweredCount((c) => c + 1);
    },
    onError: () => toast.error("Failed to submit answer"),
  });

  // Fetch results
  const { data: results } = useQuery({
    queryKey: ["attempt-result", attemptId],
    queryFn: () =>
      api.get(`/api/quizzes/${quizId}/attempts/${attemptId}/result`).then((r) => r.data),
    enabled: showResults && !!attemptId,
  });

  // Auto-start attempt
  useEffect(() => {
    if (!attemptId) {
      startMutation.mutate();
    }
  }, []);

  // Fetch first question after attempt created
  useEffect(() => {
    if (attemptId) {
      fetchNext(attemptId);
    }
  }, [attemptId]);

  const handleNextQuestion = () => {
    if (attemptId) {
      fetchNext(attemptId);
    }
  };

  const progressPct = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  // ── Results Screen ─────────────────────────────────────────────────
  if (showResults && results) {
    const masteryEntries = Object.entries(results.mastery_data ?? {}) as [
      string,
      { correct: number; total: number; pct: number }
    ][];

    return (
      <div className="max-w-2xl mx-auto py-8">
        <h1 className="text-3xl font-bold mb-2">Quiz Results 🎉</h1>
        <p className="text-base-content/60 mb-6">{quiz?.title}</p>

        {/* Score card */}
        <div className="card bg-base-200 mb-6">
          <div className="card-body items-center text-center">
            <div className={`radial-progress text-4xl font-bold ${
              (results.score ?? 0) >= 70 ? "text-success" : (results.score ?? 0) >= 50 ? "text-warning" : "text-error"
            }`} style={{ "--value": results.score ?? 0, "--size": "8rem" } as any}>
              {results.score?.toFixed(0)}%
            </div>
            <p className="mt-2 text-sm text-base-content/60">
              {results.correct_count} / {results.total_questions} correct
            </p>
          </div>
        </div>

        {/* Concept mastery bars */}
        {masteryEntries.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Concept Mastery</h2>
            <div className="space-y-3">
              {masteryEntries.map(([concept, data]) => (
                <div key={concept}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{concept}</span>
                    <span className="font-semibold">{data.pct}%</span>
                  </div>
                  <progress
                    className={`progress w-full ${data.pct >= 70 ? "progress-success" : data.pct >= 50 ? "progress-warning" : "progress-error"}`}
                    value={data.pct}
                    max="100"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weak areas */}
        {masteryEntries.filter(([, d]) => d.pct < 60).length > 0 && (
          <div className="alert alert-warning mb-6">
            <span>⚠️ Focus on: {masteryEntries.filter(([, d]) => d.pct < 60).map(([c]) => c).join(", ")}</span>
          </div>
        )}

        {/* Response details */}
        <div className="space-y-3 mb-6">
          {(results.responses ?? []).map((r: any, i: number) => (
            <div key={i} className={`card ${r.is_correct ? "bg-success/10" : "bg-error/10"}`}>
              <div className="card-body p-4">
                <p className="font-medium">Q{i + 1}. {r.question_text}</p>
                <p className="text-sm">Your answer: <span className="font-semibold">{r.student_answer}</span></p>
                {!r.is_correct && (
                  <p className="text-sm text-success">Correct: {r.correct_answer}</p>
                )}
                <p className="text-xs text-base-content/60 mt-1">{r.explanation}</p>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-primary w-full" onClick={() => router.back()}>
          Back to Course
        </button>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────
  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <span className="loading loading-spinner loading-lg" />
        <p className="mt-4 text-base-content/60">Loading quiz...</p>
      </div>
    );
  }

  // ── Question Screen ────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-xl font-bold mb-1">{quiz?.title}</h1>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-base-content/60 mb-1">
          <span>Question {answeredCount + 1} of {totalQuestions}</span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <progress className="progress progress-primary w-full" value={progressPct} max="100" />
      </div>

      {/* Question card */}
      <div className="card bg-base-200 mb-6">
        <div className="card-body">
          <div className="flex items-start gap-2 mb-4">
            <span className="badge badge-outline badge-sm">{currentQuestion.type}</span>
            <span className="badge badge-primary badge-sm">Difficulty {currentQuestion.difficulty}</span>
          </div>

          <h2 className="text-lg font-semibold mb-4">{currentQuestion.question_text}</h2>

          {/* MCQ options */}
          {currentQuestion.type === "mcq" && currentQuestion.options && (
            <div className="space-y-2">
              {currentQuestion.options.map((opt, i) => (
                <label
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedAnswer === opt
                      ? "border-primary bg-primary/10"
                      : "border-base-300 hover:bg-base-300"
                  } ${
                    feedback
                      ? opt === feedback.correct_answer
                        ? "border-success bg-success/10"
                        : selectedAnswer === opt && !feedback.is_correct
                        ? "border-error bg-error/10"
                        : ""
                      : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="answer"
                    className="radio radio-primary"
                    checked={selectedAnswer === opt}
                    onChange={() => !feedback && setSelectedAnswer(opt)}
                    disabled={!!feedback}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          )}

          {/* True/False */}
          {currentQuestion.type === "true_false" && (
            <div className="flex gap-4">
              {["True", "False"].map((val) => (
                <button
                  key={val}
                  className={`btn btn-lg flex-1 ${
                    selectedAnswer === val
                      ? "btn-primary"
                      : "btn-outline"
                  } ${
                    feedback
                      ? val === feedback.correct_answer
                        ? "btn-success"
                        : selectedAnswer === val && !feedback.is_correct
                        ? "btn-error"
                        : ""
                      : ""
                  }`}
                  onClick={() => !feedback && setSelectedAnswer(val)}
                  disabled={!!feedback}
                >
                  {val}
                </button>
              ))}
            </div>
          )}

          {/* Short answer */}
          {currentQuestion.type === "short_answer" && (
            <textarea
              className="textarea textarea-bordered w-full"
              placeholder="Type your answer..."
              value={selectedAnswer}
              onChange={(e) => !feedback && setSelectedAnswer(e.target.value)}
              disabled={!!feedback}
              rows={3}
            />
          )}
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`alert ${feedback.is_correct ? "alert-success" : "alert-error"} mb-6`}>
          <div>
            <p className="font-semibold">{feedback.is_correct ? "✅ Correct!" : "❌ Incorrect"}</p>
            <p className="text-sm mt-1">{feedback.explanation}</p>
            {!feedback.is_correct && (
              <p className="text-sm mt-1">Correct answer: <strong>{feedback.correct_answer}</strong></p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {!feedback ? (
          <button
            className="btn btn-primary"
            disabled={!selectedAnswer || answerMutation.isPending}
            onClick={() => answerMutation.mutate(selectedAnswer)}
          >
            {answerMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : "Submit Answer"}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleNextQuestion}>
            {answeredCount >= totalQuestions ? "See Results" : "Next Question →"}
          </button>
        )}
      </div>
    </div>
  );
}
