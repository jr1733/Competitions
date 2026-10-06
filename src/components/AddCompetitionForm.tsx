"use client";

import { ClipboardPaste, LoaderCircle, Plus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { addCompetition } from "@/lib/client/data";
import { errorText } from "@/lib/client/network";
import { toast } from "@/lib/client/toast";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  REENTRY_FREQUENCIES,
  REENTRY_LABELS,
  type Category,
  type EntryType,
  type Reentry,
} from "@/lib/constants";
import { londonDateTime } from "@/lib/dates";
import { extractPrize } from "@/lib/feed/classify";

/** Find the first http(s) link in shared or pasted text. */
export function firstUrl(text: string): string {
  return /https?:\/\/[^\s<>"']+/i.exec(text)?.[0] ?? "";
}

/**
 * Add a competition by pasting its link. Comper doesn't visit the page; you
 * fill in the details you want to see on the card.
 */
export function AddCompetitionForm({ initialUrl = "", initialTitle = "", onAdded }: { initialUrl?: string; initialTitle?: string; onAdded?: () => void }) {
  const [url, setUrl] = useState(initialUrl);
  const [prize, setPrize] = useState(initialTitle ? extractPrize(initialTitle, "") : "");
  const [closesOn, setClosesOn] = useState("");
  const [entryType, setEntryType] = useState<EntryType>("online");
  const [category, setCategory] = useState<Category>("other");
  const [reentry, setReentry] = useState<Reentry>("none");
  const [alreadyEntered, setAlreadyEntered] = useState(false);
  const [busy, setBusy] = useState(false);
  const linkId = useId();

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      const link = firstUrl(text) || text.trim();
      if (link) setUrl(link);
    } catch {
      toast("Couldn't read the clipboard. Long-press the box and choose Paste.");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const [y, m, d] = closesOn ? closesOn.split("-").map(Number) : [];
      const { status } = await addCompetition({
        url: url.trim(),
        title: prize.trim(),
        prize: prize.trim() || "Prize",
        closes_at: closesOn ? londonDateTime(y, m, d, 23, 59, 59).toISOString() : null,
        entry_type: entryType,
        category,
        reentry,
        alreadyEntered,
      });
      toast(
        status === "exists"
          ? alreadyEntered
            ? "Already in Comper: marked as entered"
            : "That competition is already in Comper"
          : alreadyEntered
            ? "Added and marked as entered"
            : "Added to your feed",
        { tone: "success" },
      );
      setUrl("");
      setPrize("");
      setClosesOn("");
      setAlreadyEntered(false);
      onAdded?.();
    } catch (error) {
      toast(`Couldn't add it: ${errorText(error)}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={linkId} className="text-sm font-medium">
          Link
        </label>
        <div className="flex gap-2">
          <input
            id={linkId}
            className="input"
            type="url"
            inputMode="url"
            required
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="button" className="btn btn-secondary shrink-0 px-3" onClick={paste} aria-label="Paste link">
            <ClipboardPaste className="size-5" aria-hidden />
          </button>
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Prize</span>
        <input className="input" required maxLength={140} placeholder="e.g. £250 Currys voucher" value={prize} onChange={(e) => setPrize(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Closes</span>
          <input className="input" type="date" value={closesOn} onChange={(e) => setClosesOn(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Entry type</span>
          <select className="input" value={entryType} onChange={(e) => setEntryType(e.target.value as EntryType)}>
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTRY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Category</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Re-entry</span>
          <select className="input" value={reentry} onChange={(e) => setReentry(e.target.value as Reentry)}>
            {REENTRY_FREQUENCIES.map((r) => (
              <option key={r} value={r}>
                {REENTRY_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" className="size-5 accent-violet-600" checked={alreadyEntered} onChange={(e) => setAlreadyEntered(e.target.checked)} />
        <span>I&apos;ve already entered this one</span>
      </label>
      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Plus className="size-5" aria-hidden />}
        Add competition
      </button>
    </form>
  );
}
