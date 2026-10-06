export const APP_NAME = "Comper";

/** All dates and notification times are UK local time. */
export const TIME_ZONE = "Europe/London";

export const ENTRY_TYPES = ["online", "social", "email", "postal"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  online: "Online form",
  social: "Social",
  email: "Email",
  postal: "Postal",
};

export const CATEGORIES = [
  "cash",
  "tech",
  "travel",
  "food",
  "home",
  "fashion",
  "motoring",
  "experiences",
  "family",
  "vouchers",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  cash: "Cash",
  tech: "Tech",
  travel: "Holidays & travel",
  food: "Food & drink",
  home: "Home & garden",
  fashion: "Fashion & beauty",
  motoring: "Cars & motoring",
  experiences: "Experiences & tickets",
  family: "Kids & family",
  vouchers: "Vouchers & gift cards",
  other: "Other",
};

export const REENTRY_FREQUENCIES = ["none", "daily", "weekly"] as const;
export type Reentry = (typeof REENTRY_FREQUENCIES)[number];

export const REENTRY_LABELS: Record<Reentry, string> = {
  none: "One entry",
  daily: "Daily",
  weekly: "Weekly",
};

export function isEntryType(value: unknown): value is EntryType {
  return typeof value === "string" && (ENTRY_TYPES as readonly string[]).includes(value);
}

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

export function isReentry(value: unknown): value is Reentry {
  return typeof value === "string" && (REENTRY_FREQUENCIES as readonly string[]).includes(value);
}
