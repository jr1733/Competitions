"use client";

import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { addBlocked, removeBlocked, setBlocked, useBlocked } from "@/lib/client/blocklist";
import { DEFAULT_BLOCKED } from "@/lib/feed/risk";

/** Settings → Scam filter: what's hidden automatically, and the viewer's own blocked words. */
export function ScamFilterSettings() {
  const blocked = useBlocked();
  const [phrase, setPhrase] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!phrase.trim()) return;
    addBlocked(phrase.trim());
    setPhrase("");
  }

  const isDefault = blocked.length === DEFAULT_BLOCKED.length && DEFAULT_BLOCKED.every((p) => blocked.includes(p));

  return (
    <div className="card flex flex-col gap-3 p-4 text-sm">
      <p className="text-zinc-600 dark:text-zinc-300">
        The Feed hides competitions that look like scams or data-grabs: gambling offers, &ldquo;claim&rdquo; and survey bait, cash or
        supermarket-voucher prizes with no named brand, big-ticket gadgets with no named promoter, WhatsApp-group and sign-up offers, and
        listings repeated three or more times. Tap <strong>Show</strong> on the Feed to see them, with the reason. The flag on a card hides
        it and anything listed the same way.
      </p>

      <div>
        <h3 className="font-semibold">Blocked words and promoters</h3>
        <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">Competitions mentioning any of these are hidden too.</p>
        {blocked.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Blocked words">
            {blocked.map((p) => (
              <li key={p} className="flex items-center gap-1 rounded-full bg-zinc-100 py-1 pr-1 pl-3 dark:bg-zinc-800">
                <span>{p}</span>
                <button
                  type="button"
                  onClick={() => removeBlocked(p)}
                  className="rounded-full p-1 text-zinc-500 hover:text-red-600"
                  aria-label={`Stop blocking ${p}`}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-zinc-500">Nothing blocked.</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Word or promoter to block</span>
          <input className="input" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="e.g. a promoter's name" maxLength={80} />
        </label>
        <button type="submit" className="btn btn-secondary shrink-0" disabled={!phrase.trim()}>
          <Plus className="size-5" aria-hidden /> Block
        </button>
      </form>

      {!isDefault && (
        <button type="button" className="self-start text-sm font-medium text-violet-700 dark:text-violet-300" onClick={() => setBlocked([...DEFAULT_BLOCKED])}>
          Reset to the starting list
        </button>
      )}
    </div>
  );
}
