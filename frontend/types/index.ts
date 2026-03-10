/* =======================================================================
   Shared TypeScript interfaces — mirrors Pydantic response schemas.
   All data fetching (React Query) should type responses with these.
   ======================================================================= */

// ── Auth ──────────────────────────────────────────────────────────────

export type UserRole = "admin" | "teacher" | "student" | "parent";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
}

// ── Courses ──────────────────────────────────────────────────────────

export interface Course {
  id: string;
  title: string;
  description: string | null;
  teacher_id: string;
  cover_image_url: string | null;
  is_published: boolean;
  enrollment_code: string;
  created_at: string;
  updated_at: string;
}

export interface CourseDetail extends Course {
  teacher: User;
  modules: CourseModule[];
  enrollment_count: number;
}

// ── Modules ──────────────────────────────────────────────────────────

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number;
  lectures: Lecture[];
  materials: Material[];
}

// ── Lectures ─────────────────────────────────────────────────────────

export type LectureStatus = "pending" | "processing" | "ready" | "failed";

export interface Lecture {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  video_url: string;
  duration_seconds: number | null;
  transcript: string | null;
  summary: string | null;
  status: LectureStatus;
  order_index: number;
  created_at: string;
}

// ── Materials ────────────────────────────────────────────────────────

export type MaterialType = "pdf" | "youtube" | "link" | "file";

export interface Material {
  id: string;
  module_id: string;
  title: string;
  type: MaterialType;
  file_url: string | null;
  external_url: string | null;
  order_index: number;
}

// ── Chat ─────────────────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  course_id: string;
  student_id: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  created_at: string;
}

export interface Source {
  chunk_id: string;
  content: string;
  source_type: string;
  score: number;
}

// ── Quizzes ──────────────────────────────────────────────────────────

export type QuestionType = "mcq" | "true_false" | "short_answer";
export type BloomLevel = "remember" | "understand" | "apply" | "analyze";

export interface Quiz {
  id: string;
  course_id: string;
  module_id: string | null;
  title: string;
  generated_from: "lecture" | "material" | "manual";
  is_adaptive: boolean;
  is_published: boolean;
  created_at: string;
}

export interface Question {
  id: string;
  quiz_id: string;
  type: QuestionType;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string;
  bloom_level: BloomLevel;
  difficulty: number;
  concept_tag: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  student_id: string;
  started_at: string;
  completed_at: string | null;
  score: number | null;
}

// ── Analytics ────────────────────────────────────────────────────────

export interface EngagementScore {
  student_id: string;
  course_id: string;
  week_start: string;
  watch_score: number;
  quiz_score: number;
  discussion_score: number;
  total_score: number;
}

export interface ClassInsight {
  id: string;
  course_id: string;
  week_start: string;
  insight_text: string;
}

// ── Notifications ────────────────────────────────────────────────────

export type NotificationType = "announcement" | "reminder" | "alert" | "ai_insight";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

// ── API Error ────────────────────────────────────────────────────────

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail: string;
}
