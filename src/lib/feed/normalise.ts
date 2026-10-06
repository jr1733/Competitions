import type { Category, EntryType, Reentry } from "../constants";
import { classifyCategory, classifyEntryType, detectReentry, extractPrize } from "./classify";
import { extractClosingDate } from "./closing-date";
import type { RawFeedItem } from "./parse";
import { decodeEntities, htmlToText, truncate } from "./text";
import { normaliseUrl } from "./url";

export interface CompetitionDraft {
  url: string;
  title: string;
  prize: string;
  summary: string | null;
  closes_at: string | null;
  entry_type: EntryType;
  category: Category;
  reentry: Reentry;
  source: string;
  feed_id: string | null;
  published_at: string | null;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Turn a raw feed item into a competition row. Returns null when the item has
 * no usable link or title, or has already closed.
 */
export function itemToCompetition(
  item: RawFeedItem,
  feed: { id: string | null; name: string },
  now = new Date(),
): CompetitionDraft | null {
  const url = normaliseUrl(item.link);
  const title = htmlToText(decodeEntities(item.title));
  if (!url || !title) return null;

  const text = htmlToText(item.html);
  const categories = item.categories.map((c) => htmlToText(c));
  const closesAt = extractClosingDate({ title, text, dateHints: item.dateHints }, now);
  if (closesAt && closesAt.getTime() <= now.getTime()) return null;

  const prize = extractPrize(title, text);
  return {
    url,
    title: truncate(title, 300),
    prize,
    summary: text ? truncate(text, 400) : null,
    closes_at: closesAt?.toISOString() ?? null,
    entry_type: classifyEntryType({ title, text, categories }),
    category: classifyCategory({ prize, text: `${title}\n${text}`, categories }),
    reentry: detectReentry({ title, text, categories }),
    source: feed.name,
    feed_id: feed.id,
    published_at: toIso(item.publishedAt),
  };
}

/** Keep the first occurrence of each URL. */
export function dedupeByUrl<T extends { url: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.url)) return false;
    seen.add(row.url);
    return true;
  });
}
