const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface OnboardingResponse {
  reply: string;
  plan_ready: boolean;
  plan?: LearningPlan;
}

export async function sendOnboardingMessage(
  sessionId: string,
  message: string
): Promise<OnboardingResponse> {
  const res = await fetch(`${BACKEND}/api/onboarding/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`Onboarding error: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface PlanDay {
  day: number;           // 1–7
  title: string;
  topics: string[];
  session_brief: string; // injected into the live agent system prompt
}

export interface PlanWeek {
  week: number;          // 1 or 2
  theme: string;
  days: PlanDay[];
}

export interface LearningPlan {
  language: string;
  dialect: string;
  dialect_code: string;  // BCP 47 e.g. "es-ES"
  tutor_name: string;
  level: "beginner" | "intermediate" | "advanced";
  goal: string;
  summary: string;
  weeks: PlanWeek[];
}

export async function getPlan(sessionId: string): Promise<LearningPlan | null> {
  const res = await fetch(`${BACKEND}/api/plan/${sessionId}`);
  if (!res.ok) throw new Error(`Plan fetch error: ${res.status}`);
  const data = await res.json();
  return data.plan ?? null;
}

export async function suggestTopic(
  sessionId: string,
  suggestion: string
): Promise<LearningPlan> {
  const res = await fetch(`${BACKEND}/api/plan/${sessionId}/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggestion }),
  });
  if (!res.ok) throw new Error(`Suggest topic error: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface KeyPhrase {
  target: string;
  native: string;
  tag: "first_use" | "dialect_specific" | "improving";
  context: string;
}

export interface SessionPerformance {
  strengths: string[];
  struggles: string[];
  fluency_rating: number;    // 1–5
  confidence_rating: number; // 1–5
}

export interface DayAdjustment {
  week: number;
  day: number;
  action: "reinforce" | "replace" | "add_drill";
  reason: string;
}

export interface PlanRecommendation {
  ready_for_next: boolean;
  reinforce: string[];
  accelerate: string[];
  adjust_days: DayAdjustment[];
  new_topics_discovered: { name: string; reason: string }[];
}

export interface SessionSummary {
  session_meta: {
    week: number;
    day: number;
    day_title: string;
    planned_topics: string[];
  };
  tutor_note: string;
  key_phrases: KeyPhrase[];
  performance: SessionPerformance;
  plan_recommendation: PlanRecommendation;
}

export async function sendUtterance(
  sessionId: string,
  speaker: "user" | "tutor",
  text: string,
): Promise<void> {
  await fetch(`${BACKEND}/api/session/${sessionId}/utterances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ speaker, text }),
  });
}

export async function endSession(
  sessionId: string,
  week: number,
  day: number,
): Promise<SessionSummary> {
  const res = await fetch(
    `${BACKEND}/api/session/${sessionId}/end?week=${week}&day=${day}`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`End session error: ${res.status}`);
  return res.json();
}

export async function applyRecommendations(sessionId: string): Promise<LearningPlan> {
  const res = await fetch(
    `${BACKEND}/api/session/${sessionId}/apply-recommendations`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`Apply recommendations error: ${res.status}`);
  return res.json();
}

export interface SessionExport {
  session_id: string;
  created_at: string;
  utterances: { speaker: string; text: string; timestamp: string }[];
  plan: LearningPlan | null;
  summary: SessionSummary | null;
}

export async function exportSession(sessionId: string): Promise<SessionExport> {
  const res = await fetch(`${BACKEND}/api/session/${sessionId}/export`);
  if (!res.ok) throw new Error(`Export error: ${res.status}`);
  return res.json();
}
