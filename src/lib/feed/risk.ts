/**
 * Spotting likely scams and data-grabs from what a feed tells us: the
 * title, summary, link and source. Aggregator feeds mix genuine brand
 * competitions with paid listings for lead-generation "prize draws",
 * gambling offers and survey sites. None of these checks is proof, so
 * flagged competitions are hidden by default but can be shown, with the
 * reason, and the viewer has the last word (Report scam, blocked words).
 */

export type RiskKind = "blocked" | "gambling" | "claim" | "cash" | "gadget" | "signup" | "repeated";

export interface Risk {
  kind: RiskKind;
  /** Short reason shown on the card. */
  label: string;
}

/** Promoters the MoneySavingExpert forum bans from its competition boards. */
export const DEFAULT_BLOCKED = ["Lions Prizes", "Good Fanz", "Good Life Plus"];

/** Lower case, punctuation as spaces, single spaces: for matching phrases and spotting repeats. */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9£]+/g, " ")
    .trim();
}

const GAMBLING = /\bfree spins?\b|\bcasinos?\b|\bbingo\b|\bslots?\b|\bbetting\b|\bbet £|\bsportsbook\b|\bscratch ?cards?\b/i;

const CLAIM =
  /\bclaim (?:your|a|an|up to|now|free|today)\b|\byou(?:ve| have) (?:been selected|won)\b|\bcongratulations\b|\b(?:paid )?surveys?\b|\bcomplete (?:the |our )?offers?\b|\bcash ?back\b|\bearn (?:£|cash|money|rewards|points)\b|\bmake money\b/i;

/** A named brand or venue right after "at", "from", "with"…: "£250 to spend at Standout", "eGift cards from Lounge". */
const NAMED_PROMOTER = /\b(?:[Aa]t|[Ff]rom|[Ww]ith|[Bb]y|[Cc]ourtesy [Oo]f|[Tt]hanks [Tt]o|[Oo]n|[Aa]s)\s+(?:[Tt]he\s+)?[A-Z0-9][\w'’&.-]*/;

const CASH_PRIZE =
  /^\W*win\s+(?:up to\s+)?(?:a\s+|an\s+)?£\s?[\d,.]+k?\s*(?:cash\b|in cash\b|to spend\b|in vouchers?\b|(?:of\s+|in\s+)?(?:tesco|asda|sainsbury'?s|aldi|lidl|morrisons|iceland|co-?op|amazon|argos|shopping|supermarket|high street|love2shop|travel)\b)/i;

const GADGET_PRIZE =
  /^\W*win\s+(?:an?\s+|the\s+(?:new|latest)\s+|a brand new\s+)?(?:apple\s+)?(?:iphone|ipad|macbook|airpods|apple watch|ps5|playstation|xbox|nintendo switch|samsung galaxy|galaxy s\d+|dyson|thermomix|ninja|air ?fryer|smart tv|\d+(?:"|-inch| inch) tv|(?:lg |samsung )?washing machine|tumble dryer|fridge freezer)\b/i;

const SIGNUP =
  /\bwhatsapp (?:group|community|channel)\b|\bmessenger (?:broadcast|channel|group)\b|\bbroadcast channel\b|\bdate of birth\b|\bspin the wheel\b|\bjoin (?:our|now|for free)\b|\bjoin\b.{0,30}\btoday\b|\bsign up (?:today|now|for free)\b|\bautomatically entered\b/i;

export interface RiskInput {
  title: string;
  prize: string;
  summary: string | null;
  url: string;
  source: string;
}

/** Reasons a competition looks like a scam or data-grab: none means it looks fine. */
export function competitionRisks(c: RiskInput, blocked: readonly string[] = DEFAULT_BLOCKED): Risk[] {
  const risks: Risk[] = [];
  const title = c.title || c.prize;
  const text = `${title} ${c.summary ?? ""}`;

  const haystack = ` ${normaliseText(`${title} ${c.prize} ${c.summary ?? ""} ${c.url} ${c.source}`)} `;
  const phrase = blocked.find((p) => {
    const n = normaliseText(p);
    return n.length > 1 && haystack.includes(` ${n} `);
  });
  if (phrase) risks.push({ kind: "blocked", label: `On your blocked list: “${phrase}”` });

  if (GAMBLING.test(text)) risks.push({ kind: "gambling", label: "Gambling offer" });
  if (CLAIM.test(text)) risks.push({ kind: "claim", label: "Asks you to claim, do surveys or earn" });
  if (!NAMED_PROMOTER.test(title.replace(/^\W*win\s+/i, ""))) {
    if (CASH_PRIZE.test(title)) risks.push({ kind: "cash", label: "Cash or voucher prize with no named brand: often a data-grab" });
    else if (GADGET_PRIZE.test(title)) risks.push({ kind: "gadget", label: "Big-ticket gadget with no named promoter: often a data-grab" });
  }
  if (SIGNUP.test(text)) risks.push({ kind: "signup", label: "Signs you up to a marketing list or group" });
  return risks;
}

/** The phrase "Report scam" blocks: the prize as listed, so re-listings of it are hidden too. */
export function reportPhrase(c: Pick<RiskInput, "prize" | "title">): string {
  return (c.prize || c.title).replace(/^\W*win\s+/i, "").trim().slice(0, 80);
}

export interface Grouped<T> {
  item: T;
  /** The same prize from the same source, listed again (hidden behind `item`). */
  repeats: T[];
}

/**
 * Collapse repeat listings (same prize, same source) into one, keeping the
 * first. Aggregators list paid placements over and over (one theatre offer
 * appeared six times in one feed).
 */
export function groupRepeats<T extends Pick<RiskInput, "prize" | "source">>(items: T[]): Grouped<T>[] {
  const groups = new Map<string, Grouped<T>>();
  for (const item of items) {
    const key = `${item.source}|${normaliseText(item.prize)}`;
    const group = groups.get(key);
    if (group) group.repeats.push(item);
    else groups.set(key, { item, repeats: [] });
  }
  return [...groups.values()];
}

/** Listed three or more times: usually a paid listing. */
export function repeatRisk(repeats: number): Risk | null {
  return repeats >= 2 ? { kind: "repeated", label: `Listed ${repeats + 1} times: usually a paid listing` } : null;
}
