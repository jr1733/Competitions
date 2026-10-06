import { describe, expect, it } from "vitest";
import { extractClosingDate } from "@/lib/feed/closing-date";

const now = new Date("2026-10-06T12:00:00Z");
const close = (text: string, title = "", dateHints: string[] = []) =>
  extractClosingDate({ title, text, dateHints }, now)?.toISOString() ?? null;

describe("extractClosingDate", () => {
  it("parses '9th October 2026' as 23:59:59 UK time (BST)", () => {
    expect(close("Closes 9th October 2026.")).toBe("2026-10-09T22:59:59.000Z");
  });

  it("parses UK numeric dates day-first, with a time", () => {
    expect(close("Competition ends 31/12/2026 at 5pm.")).toBe("2026-12-31T17:00:00.000Z");
    expect(close("Closing date: 02/11/26")).toBe("2026-11-02T23:59:59.000Z");
  });

  it("handles weekday names and a missing year", () => {
    expect(close("Deadline: Friday 16 October.")).toBe("2026-10-16T22:59:59.000Z");
  });

  it("rolls a yearless date in the past into next year", () => {
    expect(close("Closes 2nd January")).toBe("2027-01-02T23:59:59.000Z");
  });

  it("understands 'midnight on' and 'Month day, year'", () => {
    expect(close("Closes at midnight on 20th November.")).toBe("2026-11-20T23:59:00.000Z");
    expect(close("Entries must be received by November 3, 2026")).toBe("2026-11-03T23:59:59.000Z");
  });

  it("prefers explicit feed fields", () => {
    expect(close("Closes 9th October 2026.", "", ["2026-11-30"])).toBe("2026-11-30T23:59:59.000Z");
    expect(close("", "", ["Fri, 09 Oct 2026 20:00:00 +0100"])).toBe("2026-10-09T19:00:00.000Z");
  });

  it("returns null when there's no closing phrase or the date is impossible", () => {
    expect(close("Published 9th October 2026. Draw on 10 October.")).toBeNull();
    expect(close("Closes 31 February 2027")).toBeNull();
    expect(close("Win a car!")).toBeNull();
  });

  it("returns past dates so the caller can drop closed competitions", () => {
    expect(close("Closing date 1 October 2026.")).toBe("2026-10-01T22:59:59.000Z");
  });
});
