// /lib/day.ts
// Day helpers anchored to America/Puerto_Rico timezone
// so all users share the same "today" regardless of location.

const PR_TZ = "America/Puerto_Rico";

/**
 * Returns dayId in format "YYYY-MM-DD" anchored to Puerto Rico timezone.
 * Example: "2026-04-06"
 */
export function getDayId(date = new Date()): string {
  const parts = date.toLocaleDateString("en-US", {
    timeZone: PR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // parts = "04/06/2026"
  const [month, day, year] = parts.split("/");
  return `${year}-${month}-${day}`;
}

/**
 * Human-readable label for a dayId.
 * Example (es-PR): "lunes, 6 de abril de 2026"
 */
export function getDayLabel(dayId: string, locale = "es-PR"): string {
  // Parse "YYYY-MM-DD" safely
  const [year, month, day] = dayId.split("-").map(Number);
  // Use noon UTC to avoid any DST edge cases
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return d.toLocaleDateString(locale, {
    timeZone: PR_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Returns true if the game's startTime falls on the given dayId in PR timezone.
 */
export function isGameOnDay(startTime: any, dayId: string): boolean {
  try {
    const d: Date =
      startTime?.toDate?.() instanceof Date
        ? startTime.toDate()
        : startTime instanceof Date
          ? startTime
          : typeof startTime === "number"
            ? new Date(startTime)
            : null;
    if (!d) return false;
    return getDayId(d) === dayId;
  } catch {
    return false;
  }
}

export default getDayId;
