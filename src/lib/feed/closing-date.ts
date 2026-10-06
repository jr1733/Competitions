import { londonDateTime, londonParts } from "../dates";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/** Phrases that introduce a closing date. */
const KEYWORD =
  /\b(?:clos(?:es|ing|e)(?:\s+date)?|ends?|ending|end\s+date|deadline|expires?|expiry(?:\s+date)?|(?:runs?|open)\s+until|until|entries\s+(?:must\s+be\s+)?(?:received\s+)?by|enter\s+by|last\s+entries)\b/gi;

/** Filler allowed between the keyword and the date: "closes at 11:59pm on Friday the 9th…" */
const FILLER =
  /^[\s:,\-–—]*(?:is\s+|on\s+|at\s+(?:midnight|noon|midday|\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)\s*(?:\(?(?:uk|gmt|bst)\)?\s*)?(?:on\s+)?)?(?:the\s+)?(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?\.?,?\s+)?(?:the\s+)?/i;

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;
const NUMERIC = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/;
const DAY_MONTH = /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\.?,?(?:\s+(\d{4}))?\b/i;
const MONTH_DAY = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b,?(?:\s+(\d{4}))?\b/i;
const TIME = /^[\s,]*(?:at\s+)?(?:(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)|(\d{1,2})[:.](\d{2})|(midnight|noon|midday))/i;

interface DateParts {
  year: number | null;
  month: number;
  day: number;
  hour: number | null;
  minute: number | null;
}

function readTime(rest: string, before: string): { hour: number; minute: number } | null {
  const m = TIME.exec(rest) ?? TIME.exec(before.replace(/^[\s:,\-–—]*/, ""));
  if (!m) return null;
  if (m[6]) {
    const word = m[6].toLowerCase();
    return word === "midnight" ? { hour: 23, minute: 59 } : { hour: 12, minute: 0 };
  }
  if (m[3]) {
    let hour = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") hour += 12;
    return { hour, minute: m[2] ? Number(m[2]) : 0 };
  }
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

/** Parse a date at the very start of `input`. UK day-first order for numeric dates. */
export function parseDateAtStart(input: string): DateParts | null {
  const filler = FILLER.exec(input)?.[0] ?? "";
  const s = input.slice(filler.length);
  let parts: DateParts | null = null;
  let consumed = 0;

  let m: RegExpExecArray | null;
  if ((m = ISO.exec(s))) {
    parts = {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: m[4] ? Number(m[4]) : null,
      minute: m[5] ? Number(m[5]) : null,
    };
    consumed = m[0].length;
  } else if ((m = NUMERIC.exec(s))) {
    const year = Number(m[3]);
    parts = { year: year < 100 ? 2000 + year : year, month: Number(m[2]), day: Number(m[1]), hour: null, minute: null };
    consumed = m[0].length;
  } else if ((m = DAY_MONTH.exec(s)) && MONTHS[m[2].toLowerCase()]) {
    parts = { year: m[3] ? Number(m[3]) : null, month: MONTHS[m[2].toLowerCase()], day: Number(m[1]), hour: null, minute: null };
    consumed = m[0].length;
  } else if ((m = MONTH_DAY.exec(s)) && MONTHS[m[1].toLowerCase()]) {
    parts = { year: m[3] ? Number(m[3]) : null, month: MONTHS[m[1].toLowerCase()], day: Number(m[2]), hour: null, minute: null };
    consumed = m[0].length;
  }
  if (!parts) return null;
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return null;

  if (parts.hour === null) {
    const time = readTime(s.slice(consumed, consumed + 40), filler);
    if (time) {
      parts.hour = time.hour;
      parts.minute = time.minute;
    }
  }
  return parts;
}

/** Turn parsed parts into an instant, filling in a missing year and time sensibly. */
function toInstant(parts: DateParts, now: Date): Date | null {
  let year = parts.year;
  if (year === null) {
    year = londonParts(now).year;
    // "Closes 2 January" seen in October means next January.
    const guess = londonDateTime(year, parts.month, parts.day, 23, 59, 59);
    if (guess.getTime() < now.getTime() - 60 * 86_400_000) year += 1;
  }
  const hour = parts.hour ?? 23;
  const minute = parts.minute ?? 59;
  const second = parts.hour === null ? 59 : 0;
  const date = londonDateTime(year, parts.month, parts.day, hour, minute, second);

  // Reject impossible dates like 31 February (which would roll into March).
  const check = londonParts(date);
  if (check.month !== parts.month || check.day !== parts.day) return null;

  // Ignore anything wildly out of range: it's probably not a closing date.
  const span = date.getTime() - now.getTime();
  if (span < -365 * 86_400_000 || span > 3 * 365 * 86_400_000) return null;
  return date;
}

function fromHint(hint: string, now: Date): Date | null {
  const parts = parseDateAtStart(hint);
  if (parts) return toInstant(parts, now);
  // RFC 822 / ISO with offset, e.g. "Fri, 09 Oct 2026 23:59:00 +0100".
  if (/\d{4}/.test(hint)) {
    const ms = Date.parse(hint);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  return null;
}

function fromText(text: string, now: Date): Date | null {
  KEYWORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KEYWORD.exec(text))) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const parts = parseDateAtStart(after);
    if (parts) {
      const date = toInstant(parts, now);
      if (date) return date;
    }
  }
  return null;
}

/**
 * Find a competition's closing date. Explicit feed fields win, then phrases
 * like "Closes 9th October 2026" in the title or description. Dates without
 * a time are treated as 23:59:59 UK time. Returns null when nothing is found.
 */
export function extractClosingDate(input: { title: string; text: string; dateHints?: string[] }, now = new Date()): Date | null {
  for (const hint of input.dateHints ?? []) {
    const date = fromHint(hint, now);
    if (date) return date;
  }
  return fromText(input.title, now) ?? fromText(input.text, now);
}
