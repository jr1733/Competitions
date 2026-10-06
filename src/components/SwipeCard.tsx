"use client";

import { Check, SkipForward } from "lucide-react";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";

const LOCK_DISTANCE = 10;

/**
 * Swipe right → `onSwipeRight`, swipe left → `onSwipeLeft`. Vertical drags are
 * left to the browser (touch-action: pan-y), so the list still scrolls
 * normally. Buttons inside the card keep working as plain taps.
 */
export function SwipeCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Entered",
  leftLabel = "Skip",
}: {
  children: ReactNode;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  rightLabel?: string;
  leftLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [width, setWidth] = useState(360);
  const threshold = Math.min(120, width * 0.3);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (leaving || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    gesture.current = { x: e.clientX, y: e.clientY, axis: null };
    setWidth(e.currentTarget.offsetWidth);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(mx) > LOCK_DISTANCE && Math.abs(mx) > Math.abs(my) * 1.2) {
        g.axis = "x";
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      } else if (Math.abs(my) > LOCK_DISTANCE) {
        gesture.current = null;
        return;
      }
    }
    if (g.axis === "x") setDx(mx);
  }

  function finish(direction: 1 | -1) {
    setLeaving(true);
    setDx(direction * (width + 48));
    navigator.vibrate?.(12);
    setTimeout(() => (direction === 1 ? onSwipeRight() : onSwipeLeft()), 180);
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (g?.axis !== "x") return;
    if (dx > threshold) finish(1);
    else if (dx < -threshold) finish(-1);
    else setDx(0);
  }

  function onPointerCancel() {
    gesture.current = null;
    setDragging(false);
    setDx(0);
  }

  const progress = Math.min(1, Math.abs(dx) / threshold);

  return (
    <div className="relative">
      <div
        aria-hidden
        className={`absolute inset-0 flex items-center rounded-2xl px-6 font-semibold ${
          dx >= 0
            ? "justify-start bg-emerald-500 text-white dark:bg-emerald-600"
            : "justify-end bg-zinc-400 text-white dark:bg-zinc-700"
        }`}
        style={{ opacity: dx === 0 ? 0 : 0.35 + progress * 0.65 }}
      >
        {dx >= 0 ? (
          <span className="flex items-center gap-2">
            <Check className="size-6" /> {rightLabel}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            {leftLabel} <SkipForward className="size-6" />
          </span>
        )}
      </div>
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="relative touch-pan-y"
        style={{
          transform: dx ? `translateX(${dx}px) rotate(${dx / 60}deg)` : undefined,
          transition: dragging ? "none" : "transform 180ms ease-out, opacity 180ms ease-out",
          opacity: leaving ? 0 : 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
