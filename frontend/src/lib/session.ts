/**
 * Session ID management.
 *
 * Every user gets a single persistent UUID stored in localStorage.
 * It ties onboarding, plan, voice sessions, and summaries together.
 */

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("session_id", id);
  }
  return id;
}

export function getCurrentDay(): { week: number; day: number } {
  if (typeof window === "undefined") return { week: 1, day: 1 };
  const week = parseInt(localStorage.getItem("current_week") ?? "1", 10);
  const day = parseInt(localStorage.getItem("current_day") ?? "1", 10);
  return { week, day };
}

export function setCurrentDay(week: number, day: number): void {
  localStorage.setItem("current_week", String(week));
  localStorage.setItem("current_day", String(day));
}

export function advanceDay(totalWeeks: number, daysPerWeek: number): void {
  const { week, day } = getCurrentDay();
  if (day < daysPerWeek) {
    setCurrentDay(week, day + 1);
  } else if (week < totalWeeks) {
    setCurrentDay(week + 1, 1);
  }
}
