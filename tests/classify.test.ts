import { describe, expect, it } from "vitest";
import { classifyCategory, classifyEntryType, detectReentry, extractPrize } from "@/lib/feed/classify";

const entry = (title: string, text = "", categories: string[] = []) => classifyEntryType({ title, text, categories });

describe("classifyEntryType", () => {
  it("defaults to online form", () => {
    expect(entry("Win a TV")).toBe("online");
    expect(entry("Win a TV", "Enter your email address in the form below")).toBe("online");
  });
  it("spots social, email and postal entries", () => {
    expect(entry("Win a holiday", "Follow us on Instagram and tag a friend")).toBe("social");
    expect(entry("Win cash", "Email your answer to comps@example.com")).toBe("email");
    expect(entry("Win a hamper", "Send a postcard to PO Box 123")).toBe("postal");
  });
  it("trusts feed category tags", () => {
    expect(entry("Win a TV", "", ["Facebook"])).toBe("social");
    expect(entry("Win a TV", "", ["Postal"])).toBe("postal");
  });
});

describe("classifyCategory", () => {
  const cat = (prize: string, text = "", categories: string[] = []) => classifyCategory({ prize, text, categories });
  it("classifies common UK prizes", () => {
    expect(cat("£1,000 cash")).toBe("cash");
    expect(cat("£500 Argos gift card")).toBe("vouchers");
    expect(cat("Family holiday to Florida")).toBe("travel");
    expect(cat("Nintendo Switch 2")).toBe("tech");
    expect(cat("Apple Watch Series 11")).toBe("tech");
    expect(cat("Luxury watch from Rotary")).toBe("fashion");
    expect(cat("Hamper of cheese and wine")).toBe("food");
    expect(cat("Tickets to a West End show")).toBe("experiences");
    expect(cat("Dyson cordless vacuum")).toBe("home");
    expect(cat("LEGO Star Wars set")).toBe("family");
    expect(cat("Brand new Kia car")).toBe("motoring");
    expect(cat("Mystery prize")).toBe("other");
  });
});

describe("detectReentry", () => {
  const re = (title: string, text = "") => detectReentry({ title, text, categories: [] });
  it("finds daily and weekly re-entry", () => {
    expect(re("Win a Switch – enter daily")).toBe("daily");
    expect(re("Win a TV", "You can enter once a day")).toBe("daily");
    expect(re("Win cash", "Weekly draw")).toBe("weekly");
    expect(re("Win a car")).toBe("none");
  });
  it("ignores newspaper and magazine names", () => {
    expect(re("Daily Mail reader offer: win a cruise")).toBe("none");
    expect(re("Win with Woman's Weekly")).toBe("none");
  });
});

describe("extractPrize", () => {
  it("strips 'Win a', site suffixes and prefixes", () => {
    expect(extractPrize("WIN a £500 Argos gift card! | Example Comps", "")).toBe("£500 Argos gift card");
    expect(extractPrize("Competition: Win tickets to a West End show", "")).toBe("Tickets to a West End show");
    expect(extractPrize("Win 1 of 5 Kindles", "")).toBe("1 of 5 Kindles");
    expect(extractPrize("[CLOSED] Giveaway - win an iPad", "")).toBe("iPad");
  });
  it("falls back to the title", () => {
    expect(extractPrize("Summer Giveaway Bonanza", "")).toBe("Summer Giveaway Bonanza");
  });
});
