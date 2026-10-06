import { describe, expect, it } from "vitest";
import { describeClosing, describeDue, formatDayHeading, isQuietTime, londonDateKey, nextDueAt } from "@/lib/dates";

describe("nextDueAt", () => {
  it("daily re-entry reopens at UK midnight", () => {
    // 23:30 BST on 6 Oct = 22:30Z → due 00:00 BST 7 Oct = 23:00Z 6 Oct.
    expect(nextDueAt("daily", new Date("2026-10-06T22:30:00Z"))?.toISOString()).toBe("2026-10-06T23:00:00.000Z");
  });
  it("weekly re-entry is due a week later, across the clocks going back", () => {
    // Clocks go back on 25 Oct 2026. Midnight GMT on 27 Oct = 00:00Z.
    expect(nextDueAt("weekly", new Date("2026-10-20T10:00:00Z"))?.toISOString()).toBe("2026-10-27T00:00:00.000Z");
  });
  it("one-off competitions are never due", () => {
    expect(nextDueAt("none", new Date())).toBeNull();
  });
});

describe("display helpers", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  it("describes closing dates", () => {
    expect(describeClosing(null, now).text).toBe("No closing date");
    expect(describeClosing("2026-10-06T22:59:00Z", now)).toEqual({ text: "Closes today 23:59", urgency: "today" });
    expect(describeClosing("2026-10-07T22:59:00Z", now).urgency).toBe("soon");
    expect(describeClosing("2026-10-01T22:59:00Z", now).urgency).toBe("closed");
    expect(describeClosing("2026-11-20T23:59:00Z", now).text).toBe("Closes Fri 20 Nov");
  });
  it("describes re-entry due times", () => {
    expect(describeDue("2026-10-06T00:00:00Z", now)).toBe("Due now");
    expect(describeDue("2026-10-06T23:00:00Z", now)).toBe("Due tomorrow");
  });
  it("labels day groups", () => {
    expect(formatDayHeading(londonDateKey(now), now)).toBe("Today");
    expect(formatDayHeading("2026-10-05", now)).toBe("Yesterday");
    expect(formatDayHeading("2026-10-01", now)).toBe("Thu 1 Oct");
  });
  it("handles quiet hours across midnight", () => {
    expect(isQuietTime(23 * 60, "22:00", "07:00")).toBe(true);
    expect(isQuietTime(6 * 60, "22:00:00", "07:00:00")).toBe(true);
    expect(isQuietTime(12 * 60, "22:00", "07:00")).toBe(false);
    expect(isQuietTime(12 * 60, "09:00", "17:00")).toBe(true);
  });
});
