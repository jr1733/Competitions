import { describe, expect, it } from "vitest";
import { duePushes, listPrizes, plural } from "@/lib/notify/plan";
import type { UserSettings } from "@/lib/types";

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  user_id: "u",
  digest_enabled: true,
  digest_time: "08:00:00",
  reentry_enabled: true,
  reentry_time: "09:00:00",
  closing_enabled: true,
  quiet_start: "22:00:00",
  quiet_end: "07:00:00",
  last_digest_on: null,
  last_digest_at: null,
  last_reentry_on: null,
  updated_at: "2026-10-01T00:00:00Z",
  ...over,
});

// 6 Oct 2026 is BST (UTC+1).
const at = (ukTime: string) => new Date(`2026-10-06T${ukTime}:00+01:00`);

describe("duePushes", () => {
  it("waits until the chosen time, UK time", () => {
    expect(duePushes(settings(), at("07:45"))).toEqual({ digest: false, reentry: false, closing: true });
    expect(duePushes(settings(), at("08:00"))).toMatchObject({ digest: true, reentry: false });
    expect(duePushes(settings(), at("09:10"))).toMatchObject({ digest: true, reentry: true });
  });

  it("sends each daily push once per UK day", () => {
    const sent = settings({ last_digest_on: "2026-10-06", last_reentry_on: "2026-10-06" });
    expect(duePushes(sent, at("12:00"))).toMatchObject({ digest: false, reentry: false });
    expect(duePushes(settings({ last_digest_on: "2026-10-05" }), at("12:00")).digest).toBe(true);
  });

  it("respects switches and quiet hours", () => {
    expect(duePushes(settings({ digest_enabled: false, reentry_enabled: false }), at("12:00"))).toEqual({
      digest: false,
      reentry: false,
      closing: true,
    });
    expect(duePushes(settings(), at("23:30")).closing).toBe(false);
    expect(duePushes(settings(), at("06:59")).closing).toBe(false);
    expect(duePushes(settings({ closing_enabled: false }), at("12:00")).closing).toBe(false);
  });
});

describe("copy helpers", () => {
  it("pluralises and lists prizes", () => {
    expect(plural(1, "re-entry", "re-entries")).toBe("1 re-entry");
    expect(plural(3, "new competition")).toBe("3 new competitions");
    expect(listPrizes(["A", "B", "C", "D", "E"])).toBe("A · B · C and 2 more");
  });
});
