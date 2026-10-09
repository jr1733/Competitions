import { describe, expect, it } from "vitest";
import { competitionRisks, DEFAULT_BLOCKED, groupRepeats, normaliseText, repeatRisk, reportPhrase } from "@/lib/feed/risk";

const comp = (title: string, extra: { summary?: string; url?: string; source?: string } = {}) => ({
  title,
  prize: title.replace(/^win\s+/i, ""),
  summary: extra.summary ?? null,
  url: extra.url ?? "https://www.theprizefinder.com/competitions/x",
  source: extra.source ?? "ThePrizeFinder: New competitions",
});
const kinds = (title: string, extra?: Parameters<typeof comp>[1], blocked?: string[]) =>
  competitionRisks(comp(title, extra), blocked).map((r) => r.kind);

describe("competitionRisks", () => {
  it("leaves ordinary brand competitions alone (real ThePrizeFinder titles)", () => {
    for (const title of [
      "Win a £250 Spa Day with Polytar",
      "Win a boo basket",
      "Win £500 To Spend At Nobody's Child",
      "Win £250 To Spend On Levi’s at Standout",
      "Win 1 of 3 £100 eGift cards from Lounge",
      "Win a Bucket List Ski Trip to Golden, BC this Winter",
      "Win a seven-night Adriatic Adventure for two people, plus £500 spending money",
      "Win 4 x a paint bundle + £50 gift card",
      "Win Disney and Pixar's Toy Story 5 on Blu-ray",
      "Win £250 towards your ultimate festive feast at Zizzi",
      "Win £100 in shopping vouchers as Aldi is crowned UK’s cheapest supermarket",
    ]) {
      expect(kinds(title), title).toEqual([]);
    }
  });

  it("flags cash and voucher prizes with no named brand", () => {
    expect(kinds("Win £500 Cash this September!")).toEqual(["cash"]);
    expect(kinds("Win £3,000 to spend")).toEqual(["cash"]);
    expect(kinds("Win a £1,000 Tesco voucher")).toEqual(["cash"]);
    expect(kinds("WIN £250 in Amazon vouchers")).toEqual(["cash"]);
  });

  it("flags big-ticket gadgets with no named promoter", () => {
    expect(kinds("Win an Apple iPad")).toEqual(["gadget"]);
    expect(kinds("Win an LG Washing Machine")).toEqual(["gadget"]);
    expect(kinds("Win the new iPhone 17 Pro")).toEqual(["gadget"]);
    expect(kinds("Win a Ninja air fryer from Currys")).toEqual([]);
  });

  it("flags gambling, claim/survey bait and sign-up offers", () => {
    expect(kinds("Claim up to 150 Free Spins and More Top Deals")).toEqual(["gambling", "claim"]);
    expect(kinds("Earn £50 a month doing paid surveys")).toEqual(["claim"]);
    expect(kinds("Free Paco Rabanne Perfume Bottle", { summary: "Join our WhatsApp group, and you could get a FREE perfume bottle" })).toEqual(["signup"]);
    expect(kinds("Join ThePrizeFinder today and be entered into our £500 prize draw")).toEqual(["signup"]);
    expect(kinds("Free £5 Asda Gift Card", { summary: "Enter your date of birth, then enter your details" })).toEqual(["signup"]);
  });

  it("hides blocked promoters and words, as whole words", () => {
    expect(kinds("Win a car with Lions Prizes")).toEqual(["blocked"]);
    expect(kinds("Win a hamper", { url: "https://goodfanz.example/x" })).toEqual([]);
    expect(kinds("Win a hamper", { summary: "Run by Good Fanz Ltd" })).toEqual(["blocked"]);
    expect(kinds("Win 1 of 3 pairs of Tickets to MAMMA MIA", {}, [...DEFAULT_BLOCKED, "pairs of Tickets to Mamma Mia"])).toEqual(["blocked"]);
    expect(kinds("Win a mammal book", {}, ["mamma"])).toEqual([]);
  });
});

describe("repeats", () => {
  it("collapses the same prize from the same source and flags three or more", () => {
    const list = [
      comp("Win 1 of 3 pairs of Tickets to MAMMA MIA"),
      comp("Win a boo basket"),
      comp("Win 1 of 3 pairs of Tickets to MAMMA MIA!"),
      comp("Win 1 of 3 pairs of tickets to Mamma Mia"),
      comp("Win a boo basket", { source: "Mirror: Competitions" }),
    ];
    const groups = groupRepeats(list);
    expect(groups.map((g) => [g.item.prize, g.repeats.length])).toEqual([
      ["1 of 3 pairs of Tickets to MAMMA MIA", 2],
      ["a boo basket", 0],
      ["a boo basket", 0],
    ]);
    expect(repeatRisk(2)?.label).toBe("Listed 3 times: usually a paid listing");
    expect(repeatRisk(1)).toBeNull();
  });
});

describe("reportPhrase / normaliseText", () => {
  it("blocks the prize as listed", () => {
    expect(reportPhrase({ title: "Win a £3,000 Flightgift travel voucher", prize: "£3,000 Flightgift travel voucher" })).toBe("£3,000 Flightgift travel voucher");
    expect(normaliseText("Levi’s at Standout!")).toBe("levis at standout");
  });
});
