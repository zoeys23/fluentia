/**
 * Session ID management.
 *
 * user_id: persistent UUID (ties onboarding, plan, memory together)
 * session_id: unique per practice session (new UUID each time)
 */

export function getUserId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("user_id");
  if (!id) {
    // Migrate from legacy single-ID scheme
    id = localStorage.getItem("session_id") ?? crypto.randomUUID();
    localStorage.setItem("user_id", id);
  }
  return id;
}

/** @deprecated Use getUserId() for user identity, createSessionId() for new sessions */
export function getSessionId(): string {
  return getUserId();
}

export function createSessionId(): string {
  return crypto.randomUUID();
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
