/** The app icon: a gift on a violet tile. Matches public/icons/*. */
export function Logo({ className = "size-10 rounded-xl" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="comper-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#comper-logo-bg)" />
      <g fill="#fff">
        <rect x="120" y="206" width="272" height="64" rx="16" />
        <rect x="140" y="270" width="232" height="132" rx="18" />
        <path d="M256 206c-22-58-82-86-108-58-24 26 4 58 60 58zm0 0c22-58 82-86 108-58 24 26-4 58-60 58z" />
      </g>
      <rect x="236" y="206" width="40" height="196" fill="#7c3aed" />
    </svg>
  );
}
