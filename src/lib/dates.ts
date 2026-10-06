import { TZDate } from "@date-fns/tz";
import { TIME_ZONE, type Reentry } from "./constants";

/** Wall-clock parts of an instant in UK time. */
export function londonParts(date: Date) {
  const d = new TZDate(date.getTime(), TIME_ZONE);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    weekday: d.getDay(),
  };
}

/** The instant for a UK wall-clock time. Month is 1-12. Day overflow rolls over. */
export function londonDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const d = new TZDate(year, month - 1, day, hour, minute, second, TIME_ZONE);
  return new Date(d.getTime());
}

/** yyyy-mm-dd for the UK calendar day containing `date`. */
export function londonDateKey(date: Date): string {
  const { year, month, day } = londonParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function startOfLondonDay(date: Date): Date {
  const { year, month, day } = londonParts(date);
  return londonDateTime(year, month, day);
}

/** Midnight UK time, `days` calendar days after the day containing `date`. */
export function addLondonDays(date: Date, days: number): Date {
  const { year, month, day } = londonParts(date);
  return londonDateTime(year, month, day + days);
}

/**
 * When a re-entry competition can next be entered. Daily competitions reopen
 * at midnight UK time; weekly ones on the same weekday a week later.
 */
export function nextDueAt(reentry: Reentry, lastEnteredAt: Date | null): Date | null {
  if (reentry === "none" || !lastEnteredAt) return null;
  return addLondonDays(lastEnteredAt, reentry === "daily" ? 1 : 7);
}

/** Minutes since UK midnight. */
export function londonMinuteOfDay(date: Date): number {
  const { hour, minute } = londonParts(date);
  return hour * 60 + minute;
}

/** "08:30" or "08:30:00" → 510. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map((part) => Number.parseInt(part, 10));
  return (h || 0) * 60 + (m || 0);
}

/** "08:30:00" → "08:30" (for <input type="time">). */
export function trimSeconds(time: string): string {
  return time.slice(0, 5);
}

/** Quiet hours can wrap midnight (22:00 → 07:00). */
export function isQuietTime(minuteOfDay: number, quietStart: string, quietEnd: string): boolean {
  const start = timeToMinutes(quietStart);
  const end = timeToMinutes(quietEnd);
  if (start === end) return false;
  return start < end
    ? minuteOfDay >= start && minuteOfDay < end
    : minuteOfDay >= start || minuteOfDay < end;
}

// ---------------------------------------------------------------------------
// Display helpers (en-GB, UK time)
// ---------------------------------------------------------------------------

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/** Whole UK calendar days from `now` to `date` (0 = today, 1 = tomorrow, -1 = yesterday). */
export function londonDayDiff(date: Date, now: Date): number {
  const a = startOfLondonDay(date).getTime();
  const b = startOfLondonDay(now).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function formatShortDate(date: Date, now = new Date()): string {
  const sameYear = londonParts(date).year === londonParts(now).year;
  return sameYear ? dayMonth.format(date) : dayMonthYear.format(date);
}

export function formatTime(date: Date): string {
  return timeFmt.format(date);
}

export interface ClosingLabel {
  text: string;
  urgency: "closed" | "today" | "soon" | "normal" | "none";
}

export function describeClosing(closesAt: string | null, now = new Date()): ClosingLabel {
  if (!closesAt) return { text: "No closing date", urgency: "none" };
  const date = new Date(closesAt);
  if (date.getTime() <= now.getTime()) return { text: "Closed", urgency: "closed" };
  const days = londonDayDiff(date, now);
  const time = formatTime(date);
  if (days === 0) return { text: `Closes today ${time}`, urgency: "today" };
  if (days === 1) return { text: `Closes tomorrow ${time}`, urgency: "soon" };
  if (days < 7) return { text: `Closes ${formatShortDate(date, now)} · ${days} days`, urgency: "soon" };
  return { text: `Closes ${formatShortDate(date, now)}`, urgency: "normal" };
}

export function describeDue(nextDue: string | null, now = new Date()): string {
  if (!nextDue) return "";
  const date = new Date(nextDue);
  if (date.getTime() <= now.getTime()) return "Due now";
  const days = londonDayDiff(date, now);
  if (days <= 1) return "Due tomorrow";
  return `Due ${formatShortDate(date, now)}`;
}

/** "Today", "Yesterday", or "Mon 5 Oct". `key` is yyyy-mm-dd. */
export function formatDayHeading(key: string, now = new Date()): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = londonDateTime(y, m, d, 12);
  const diff = londonDayDiff(date, now);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  return formatShortDate(date, now);
}

export function timeAgo(iso: string | number | null, now = Date.now()): string {
  if (!iso) return "never";
  const then = typeof iso === "number" ? iso : new Date(iso).getTime();
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
