import { isQuietTime, londonDateKey, londonMinuteOfDay, timeToMinutes } from "../dates";
import type { UserSettings } from "../types";

export interface DuePushes {
  digest: boolean;
  reentry: boolean;
  closing: boolean;
}

/**
 * Which notifications this cron run should consider for a user. The digest and
 * re-entry reminder go out once per UK day, at the first run on or after the
 * chosen time, so they work with any cron frequency.
 */
export function duePushes(settings: UserSettings, now: Date): DuePushes {
  const today = londonDateKey(now);
  const minute = londonMinuteOfDay(now);
  return {
    digest: settings.digest_enabled && settings.last_digest_on !== today && minute >= timeToMinutes(settings.digest_time),
    reentry: settings.reentry_enabled && settings.last_reentry_on !== today && minute >= timeToMinutes(settings.reentry_time),
    closing: settings.closing_enabled && !isQuietTime(minute, settings.quiet_start, settings.quiet_end),
  };
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "A · B · C and 4 more" */
export function listPrizes(prizes: string[], max = 3): string {
  const shown = prizes.slice(0, max).map((p) => (p.length > 48 ? `${p.slice(0, 47)}…` : p));
  const more = prizes.length - shown.length;
  return shown.join(" · ") + (more > 0 ? ` and ${more} more` : "");
}
