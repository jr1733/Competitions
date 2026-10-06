import { describe, expect, it } from "vitest";
import { formatRate, winStats } from "@/lib/stats";
import type { Competition, EntryWithCompetition, Win } from "@/lib/types";

const comp = (id: string, entry_type: Competition["entry_type"]): Competition => ({
  id,
  url: `https://x.example/${id}`,
  title: id,
  prize: id,
  summary: null,
  closes_at: null,
  entry_type,
  category: "other",
  reentry: "none",
  source: "Test",
  feed_id: null,
  added_by: null,
  published_at: null,
  created_at: "2026-01-01T00:00:00Z",
});

const entry = (id: string, type: Competition["entry_type"]): EntryWithCompetition => ({
  user_id: "u",
  competition_id: id,
  status: "entered",
  reentry: "none",
  entry_count: 1,
  last_entered_at: "2026-10-01T10:00:00Z",
  next_due_at: null,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  competition: comp(id, type),
});

const win = (over: Partial<Win>): Win => ({
  id: crypto.randomUUID(),
  user_id: "u",
  competition_id: null,
  prize: "Prize",
  value_gbp: null,
  won_on: "2026-09-01",
  url: null,
  entry_type: null,
  notes: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

describe("winStats", () => {
  const entries = [entry("a", "online"), entry("b", "online"), entry("c", "social"), entry("d", "postal")];
  const wins = [
    win({ competition_id: "a", value_gbp: 250, entry_type: "social" }), // linked competition's type wins
    win({ entry_type: "postal", value_gbp: 20.5, won_on: "2025-12-24" }),
  ];
  const stats = winStats(entries, wins, new Date("2026-10-06T12:00:00Z"));

  it("totals wins and value, overall and this year", () => {
    expect(stats).toMatchObject({ wins: 2, value: 270.5, yearWins: 1, yearValue: 250, entered: 4, rate: 0.5 });
  });

  it("breaks down by entry type", () => {
    const online = stats.byType.find((t) => t.type === "online");
    const postal = stats.byType.find((t) => t.type === "postal");
    const email = stats.byType.find((t) => t.type === "email");
    expect(online).toMatchObject({ entered: 2, wins: 1, value: 250, rate: 0.5 });
    expect(postal).toMatchObject({ entered: 1, wins: 1, value: 20.5, rate: 1 });
    expect(email).toMatchObject({ entered: 0, wins: 0, rate: null });
  });

  it("formats rates comper-style", () => {
    expect(formatRate(1 / 45)).toBe("1 in 45");
    expect(formatRate(null)).toBe("–");
    expect(formatRate(0)).toBe("–");
  });
});
