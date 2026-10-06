"use client";

import { Trophy } from "lucide-react";
import { useState, type FormEvent } from "react";
import { logWin, type WinInput } from "@/lib/client/data";
import { toast } from "@/lib/client/toast";
import { ENTRY_TYPE_LABELS, ENTRY_TYPES, isEntryType, type EntryType } from "@/lib/constants";
import { londonDateKey } from "@/lib/dates";
import type { EntryWithCompetition } from "@/lib/types";

export function LogWinForm({
  entries,
  initialCompetitionId,
  onDone,
  winsLink,
}: {
  entries: EntryWithCompetition[];
  initialCompetitionId: string | null;
  onDone: () => void;
  /** Toast action, e.g. "View wins" when logging from another screen. */
  winsLink?: { label: string; onClick: () => void };
}) {
  const initial = entries.find((e) => e.competition_id === initialCompetitionId)?.competition;
  const [competitionId, setCompetitionId] = useState(initial?.id ?? "");
  const [prize, setPrize] = useState(initial?.prize ?? "");
  const [value, setValue] = useState("");
  const [wonOn, setWonOn] = useState(() => londonDateKey(new Date()));
  const [url, setUrl] = useState(initial?.url ?? "");
  const [entryType, setEntryType] = useState<EntryType | "">(initial?.entry_type ?? "");
  const [notes, setNotes] = useState("");

  function pickCompetition(id: string) {
    setCompetitionId(id);
    const c = entries.find((e) => e.competition_id === id)?.competition;
    if (c) {
      setPrize(c.prize);
      setUrl(c.url);
      setEntryType(c.entry_type);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const amount = value.trim() ? Number.parseFloat(value.replace(/[£,\s]/g, "")) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      toast("Enter the value in pounds, e.g. 49.99", { tone: "error" });
      return;
    }
    const input: WinInput = {
      prize: prize.trim(),
      value_gbp: amount === null ? null : Math.round(amount * 100) / 100,
      won_on: wonOn,
      url: url.trim() || null,
      entry_type: isEntryType(entryType) ? entryType : null,
      competition_id: competitionId || null,
      notes: notes.trim() || null,
    };
    logWin(input);
    toast("Congratulations! Win logged 🎉", { tone: "success", action: winsLink });
    onDone();
  }

  // Most recent first; a long list is fine in a native <select>.
  const options = entries.slice(0, 300);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Competition</span>
        <select className="input" value={competitionId} onChange={(e) => pickCompetition(e.target.value)}>
          <option value="">Not in my entered list</option>
          {options.map((e) => (
            <option key={e.competition_id} value={e.competition_id}>
              {e.competition.prize.slice(0, 70)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Prize</span>
        <input className="input" required maxLength={300} value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="e.g. £50 Amazon voucher" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Value (£)</span>
          <input
            className="input"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0.00"
            pattern="£?\s*[0-9,]*(\.[0-9]{0,2})?"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Date won</span>
          <input className="input" type="date" required value={wonOn} max={londonDateKey(new Date())} onChange={(e) => setWonOn(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Competition link</span>
        <input className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Entry type</span>
        <select className="input" value={entryType} onChange={(e) => setEntryType(e.target.value as EntryType | "")}>
          <option value="">Not sure</option>
          {ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ENTRY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Notes</span>
        <input className="input" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </label>
      <button type="submit" className="btn btn-primary">
        <Trophy className="size-5" aria-hidden /> Save win
      </button>
    </form>
  );
}
