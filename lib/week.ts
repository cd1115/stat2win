// /lib/week.ts
// Week helpers (Sunday-based) -> "YYYY-W05"
// UI label -> "Semana del 1 de febrero al 8 de febrero"

export function getWeekStartSunday(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const day = d.getDay(); // 0=Sunday
  d.setDate(d.getDate() - day); // go back to Sunday
  return d;
}

export function getWeekWindowSunday(date = new Date()) {
  const start = getWeekStartSunday(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

/**
 * Sunday-based weekId in format "YYYY-W##"
 * Week 1 = the week window (Sun..Sun) that contains Jan 1.
 */
export function getWeekId(date = new Date()) {
  const start = getWeekStartSunday(date);
  const year = start.getFullYear();

  // Week 1 starts on the Sunday of the week that contains Jan 1
  const jan1 = new Date(year, 0, 1);
  const firstSunday = getWeekStartSunday(jan1);

  const diffDays = Math.floor(
    (start.getTime() - firstSunday.getTime()) / 86400000,
  );
  const weekNo = Math.floor(diffDays / 7) + 1;

  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * UI label example:
 * "Semana del 1 de febrero al 8 de febrero"
 */
export function getWeekRangeLabel(date = new Date(), locale = "es-PR") {
  const { start, end } = getWeekWindowSunday(date);

  const fmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
  });
  return `Semana del ${fmt.format(start)} al ${fmt.format(end)}`;
}

/**
 * Optional compact range (if you ever want it):
 * "1 feb – 8 feb"
 */
export function formatWeekRange(date = new Date(), locale = "es-PR") {
  const { start, end } = getWeekWindowSunday(date);

  const fmt = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}
export default getWeekId;