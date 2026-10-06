import { CATEGORIES, ENTRY_TYPES, type Category, type EntryType, type Reentry } from "../constants";
import { truncate } from "./text";

function count(pattern: RegExp, text: string): number {
  return text.match(pattern)?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Entry type
// ---------------------------------------------------------------------------

const ENTRY_PATTERNS: Record<EntryType, RegExp> = {
  online:
    /\b(?:online\s+(?:form|entry)|entry\s+form|enter\s+online|fill\s+(?:in|out)\s+the\s+form|complete\s+the\s+form|enter\s+(?:on|via)\s+(?:the|our)\s+(?:website|site)|click\s+(?:here\s+)?to\s+enter|website|web\s*form)\b/gi,
  social:
    /\b(?:instagram|insta|facebook|twitter|tweet|retweet|tiktok|threads|bluesky|youtube|social\s+media|social|follow\s+(?:us|@\w+|the\s+page)|like\s+(?:&|and)\s+(?:share|follow|comment)|like\s+(?:our|the)\s+(?:page|post)|tag\s+(?:a|your|two|2|three|3)\s+friends?|comment\s+(?:below|on\s+(?:the|this|our)\s+post)|share\s+(?:this|the)\s+post)\b|\bx\.com\b|\bRT\b/gi,
  email:
    /\b(?:e-?mail\s+(?:your\s+(?:answer|entry|name|details)|us|entries|the\s+answer)|send\s+(?:an?\s+|your\s+(?:answer|entry)\s+(?:by|via)\s+)?e-?mail|(?:by|via)\s+e-?mail|e-?mail\s+entry|enter\s+by\s+e-?mail|e-?mail\s+to\s+enter|email\s+comp(?:etition)?)\b/gi,
  postal:
    /\b(?:postal|post\s*cards?|by\s+post|freepost|p\.?\s*o\.?\s+box|send\s+(?:your\s+entry|a\s+postcard|a\s+letter)|stamped\s+addressed|sae)\b/gi,
};

const ENTRY_TAG_PATTERNS: Record<EntryType, RegExp> = {
  online: /\b(?:online|form|website|web)\b/i,
  social: /\b(?:instagram|facebook|twitter|tiktok|social|threads|bluesky|youtube|x)\b/i,
  email: /\be-?mail\b/i,
  postal: /\b(?:postal|post|postcard)\b/i,
};

/**
 * Best guess at how a competition is entered. Feed category tags count most,
 * then wording in the title, then the description. Defaults to online form.
 */
export function classifyEntryType(input: { title: string; text: string; categories: string[] }): EntryType {
  const scores = Object.fromEntries(ENTRY_TYPES.map((t) => [t, 0])) as Record<EntryType, number>;
  for (const type of ENTRY_TYPES) {
    scores[type] += 2 * count(ENTRY_PATTERNS[type], input.title);
    scores[type] += count(ENTRY_PATTERNS[type], input.text);
    for (const tag of input.categories) if (ENTRY_TAG_PATTERNS[type].test(tag)) scores[type] += 3;
  }
  // Ties go to the easier route: online, then social, email, postal.
  let best: EntryType = "online";
  for (const type of ENTRY_TYPES) if (scores[type] > scores[best]) best = type;
  return best;
}

// ---------------------------------------------------------------------------
// Prize category
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Record<Exclude<Category, "other">, RegExp> = {
  cash: /\b(?:cash|money|tax[- ]free|paypal|bank\s+transfer|cash\s+prize)\b|£\s?\d[\d,]*(?:k)?\s+cash/gi,
  vouchers: /\b(?:vouchers?|gift\s*cards?|e-?gift|gift\s+certificates?|shopping\s+spree|store\s+credit|credit\s+to\s+spend)\b/gi,
  travel:
    /\b(?:holidays?|trip\s+to|city\s+break|short\s+break|getaway|cruise|flights?|hotel|nights?\s+(?:in|at|away|stay)|weekend\s+away|vacation|travel|resort|glamping|staycation|lodge|cottage\s+break|spa\s+break)\b/gi,
  motoring: /\b(?:car|cars|vehicle|motor(?:ing|bike)?|e-?bikes?|bicycles?|bikes?|scooters?|electric\s+car|tyres|campervan|van)\b/gi,
  tech:
    /\b(?:iphone|ipad|macbook|laptop|tablet|smartphone|phone|tvs?|television|oled|playstation|ps5|xbox|nintendo|console|headphones|earbuds|airpods|speakers?|camera|smartwatch|apple\s+watch|kindle|drone|gaming|monitor|soundbar|alexa|echo\s+dot|gadgets?|tech|smart\s+home|projector|e-?reader)\b/gi,
  experiences:
    /\b(?:tickets?|concert|festival|gig|theatre|experiences?|day\s+out|vip|meet\s+(?:and|&)\s+greet|premiere|stadium|spa\s+day|cinema|adventure|driving\s+experience|masterclass|afternoon\s+tea|family\s+pass)\b/gi,
  food:
    /\b(?:hampers?|chocolates?|wine|gin|whisky|whiskey|beer|prosecco|champagne|food|recipe|meals?|restaurant|dinner|coffee|tea|snacks?|cheese|groceries|supermarket|takeaway|drinks?|cocktails?)\b/gi,
  home:
    /\b(?:sofa|bed|mattress|furniture|garden|kitchen|appliances?|vacuum|dyson|hoover|air\s+fryer|bedding|homeware|home|decor|lighting|bbq|barbecue|hot\s+tub|mower|diy|tools|cookware|kettle|towels|rug|blinds|makeover)\b/gi,
  fashion:
    /\b(?:fashion|clothing|clothes|dress|shoes|trainers|handbags?|jewellery|jewelry|(?<!apple\s|smart)watch(?:es)?|beauty|skincare|make-?up|perfume|fragrance|haircare|cosmetics?|wardrobe|sunglasses|outfits?)\b/gi,
  family:
    /\b(?:kids|children|child|baby|toddlers?|toys?|lego|family|pram|pushchair|nursery|playset|board\s+games?)\b/gi,
};

// Ties are broken by this order: more specific prizes first.
const CATEGORY_PRIORITY: Exclude<Category, "other">[] = [
  "cash",
  "vouchers",
  "travel",
  "motoring",
  "tech",
  "experiences",
  "food",
  "home",
  "fashion",
  "family",
];

export function classifyCategory(input: { prize: string; text: string; categories: string[] }): Category {
  const tags = input.categories.join(" \n ");
  let best: Category = "other";
  let bestScore = 0;
  for (const category of CATEGORY_PRIORITY) {
    const pattern = CATEGORY_PATTERNS[category];
    const score = 3 * count(pattern, input.prize) + 2 * count(pattern, tags) + count(pattern, input.text);
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return CATEGORIES.includes(best) ? best : "other";
}

// ---------------------------------------------------------------------------
// Re-entry frequency
// ---------------------------------------------------------------------------

// Publication names that would otherwise look like "daily" / "weekly" entry rules.
const PUBLICATIONS =
  /\b(?:daily\s+(?:mail|express|star|record|mirror|telegraph|echo|post)|mail\s+on\s+sunday|woman'?s\s+weekly|people'?s\s+friend|my\s+weekly|the\s+weekly\s+\w+|weekly\s+news|amateur\s+gardening\s+weekly)\b/gi;
const DAILY = /\b(?:daily|(?:every|each|once\s+(?:a|per))\s+day|per\s+day)\b/i;
const WEEKLY = /\b(?:weekly|(?:every|each|once\s+(?:a|per))\s+week|per\s+week)\b/i;

export function detectReentry(input: { title: string; text: string; categories: string[] }): Reentry {
  const haystack = [input.title, input.text, ...input.categories].join(" \n ").replace(PUBLICATIONS, " ");
  if (DAILY.test(haystack)) return "daily";
  if (WEEKLY.test(haystack)) return "weekly";
  return "none";
}

// ---------------------------------------------------------------------------
// Prize description
// ---------------------------------------------------------------------------

const TITLE_PREFIX =
  /^(?:\s*(?:\[[^\]]*\]|\([^)]*\))\s*)*(?:(?:free\s+)?(?:comp(?:etition)?|giveaway|contest|prize\s+draw|sweepstakes?)\s*[:\-–—|]\s*)?/i;
const TITLE_SUFFIX = /\s+[|–—]\s+[^|–—]{2,60}$/;
const WIN = /\bwin\s+(?:(?:an?|the|your\s+share\s+of)\s+)?(.{3,})/i;

function tidy(prize: string): string {
  const cleaned = prize
    .replace(/\s+/g, " ")
    .replace(/[\s!.:,;–—-]+$/, "")
    .trim();
  // Capitalise "tickets…" but leave brand names like "iPad" or "eBay" alone.
  const firstWord = cleaned.split(" ")[0];
  if (/[A-Z]/.test(firstWord.slice(1))) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** "WIN a £500 Argos gift card! | Site" → "£500 Argos gift card". */
export function extractPrize(title: string, text: string): string {
  const cleanTitle = title.replace(TITLE_PREFIX, "").replace(TITLE_SUFFIX, "").trim();
  const fromTitle = WIN.exec(cleanTitle);
  if (fromTitle) return truncate(tidy(fromTitle[1]), 140);

  const fromText = /\bwin\s+(?:(?:an?|the)\s+)?([^.!?\n]{3,120})/i.exec(text);
  if (fromText && !cleanTitle) return truncate(tidy(fromText[1]), 140);

  return truncate(tidy(cleanTitle || fromText?.[1] || "Prize"), 140);
}
