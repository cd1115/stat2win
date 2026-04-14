// /lib/week.ts
// Week helpers (Sunday-based) -> "YYYY-W05"
// All calculations anchored to America/Puerto_Rico timezone
// so all users see the same week boundaries regardless of location.

const PR_TZ = "America/Puerto_Rico";

/**
 * Returns a Date representing midnight PR time for the given date,
 * converted back to a JS Date (UTC internally).
 */
function toMidnightPR(date: Date): Date {
  // Get the date string in PR timezone
  const prStr = date.toLocaleDateString("en-US", {
    timeZone: PR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // Parse as midnight PR = UTC+4 offset (AST is UTC-4)
  const [month, day, year] = prStr.split("/").map(Number);
  // Midnight PR = 04:00 UTC (AST = UTC-4)
  return new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
}

export function getWeekStartSunday(date = new Date()): Date {
  const midnight = toMidnightPR(date);

  // Get day of week in PR timezone
  const prDateStr = date.toLocaleDateString("en-US", {
    timeZone: PR_TZ,
    weekday: "short",
  });
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dayMap[prDateStr] ?? new Date(
    date.toLocaleString("en-US", { timeZone: PR_TZ })
  ).getDay();

  // Go back to Sunday
  const start = new Date(midnight);
  start.setUTCDate(start.getUTCDate() - dayOfWeek);
  return start;
}

export function getWeekWindowSunday(date = new Date()) {
  const start = getWeekStartSunday(date);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

/**
 * Sunday-based weekId in format "YYYY-W##"
 * Anchored to Puerto Rico timezone so all users share the same week.
 */
export function getWeekId(date = new Date()): string {
  const start = getWeekStartSunday(date);

  // Year is determined by the PR date of the week start
  const prYear = Number(
    start.toLocaleDateString("en-US", { timeZone: PR_TZ, year: "numeric" })
  );

  // First Sunday of the year in PR time
  const jan1 = new Date(Date.UTC(prYear, 0, 1, 4, 0, 0, 0)); // Jan 1 midnight PR
  const firstSunday = getWeekStartSunday(jan1);

  const diffDays = Math.floor(
    (start.getTime() - firstSunday.getTime()) / 86400000,
  );
  const weekNo = Math.floor(diffDays / 7) + 1;

  return `${prYear}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * UI label — shows the week range in user's local timezone for display,
 * but the weekId is always PR-anchored.
 *
 * Example (en-US): "Week of Mar 30 – Apr 6"
 * Example (es-PR): "Semana del 30 de marzo al 6 de abril"
 */
export function getWeekRangeLabel(date = new Date(), locale = "es-PR"): string {
  const { start, end } = getWeekWindowSunday(date);

  const fmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: PR_TZ,
  });

  if (locale.startsWith("es")) {
    return `Semana del ${fmt.format(start)} al ${fmt.format(end)}`;
  }

  const fmtEn = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: PR_TZ,
  });
  return `Week of ${fmtEn.format(start)} – ${fmtEn.format(end)}`;
}

/**
 * Compact range: "Mar 30 – Apr 6"
 */
export function formatWeekRange(date = new Date(), locale = "es-PR"): string {
  const { start, end } = getWeekWindowSunday(date);

  const fmt = new Intl.DateTimeFormat(locale.startsWith("es") ? "es-PR" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: PR_TZ,
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export default getWeekId;
