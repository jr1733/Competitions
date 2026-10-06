import { Logo } from "./Logo";

export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-label="Loading Comper">
      <Logo className="size-16 animate-pulse rounded-2xl" />
    </div>
  );
}
