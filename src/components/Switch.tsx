"use client";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? "bg-violet-600 dark:bg-violet-500" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
    >
      <span className={`inline-block size-6 rounded-full bg-white shadow transition ${checked ? "translate-x-7" : "translate-x-1"}`} />
    </button>
  );
}
