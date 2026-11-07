"use client";

import { useRef } from "react";
import { FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";

// FR-5.4: the session timer as a ring that empties smoothly from the booked duration to zero
// (Q-28: it runs from startAt to endAt). Brass while there is time, danger in the last 5 minutes,
// and a heartbeat in the final minute.
interface CountdownRingProps {
  timeLeftMs: number;
  durationMinutes: number;
  label: string;
}

const R = 26;
const C = 2 * Math.PI * R;

export function CountdownRing({ timeLeftMs, durationMinutes, label }: CountdownRingProps) {
  const root = useRef<HTMLDivElement>(null);
  const totalMs = durationMinutes * 60_000;
  const fraction = totalMs > 0 ? Math.min(Math.max(timeLeftMs / totalMs, 0), 1) : 0;
  const urgent = timeLeftMs > 0 && timeLeftMs <= 5 * 60_000;
  const final = timeLeftMs > 0 && timeLeftMs <= 60_000;

  // Each second the ring eases to its new length instead of jumping.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        gsap.to("[data-ring]", { strokeDashoffset: C * (1 - fraction), duration: 0.95, ease: "none", overwrite: true });
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set("[data-ring]", { strokeDashoffset: C * (1 - fraction) });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [fraction] },
  );

  useGSAP(
    () => {
      if (!final) return;
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        gsap.to(root.current, { scale: 1.06, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [final] },
  );

  const minutes = Math.floor(timeLeftMs / 60_000);
  const seconds = Math.floor((timeLeftMs % 60_000) / 1000);
  const text = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div ref={root} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2">
      <svg viewBox="0 0 64 64" className="size-14 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={R} fill="none" stroke="var(--cs-line)" strokeWidth="5" />
        <circle
          data-ring
          cx="32"
          cy="32"
          r={R}
          fill="none"
          stroke={urgent ? "var(--cs-danger)" : "var(--cs-amber)"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - fraction)}
          className="transition-[stroke] duration-500"
        />
      </svg>
      <div className="text-xs">
        <span className="block text-[0.7rem] text-muted">{label}</span>
        <bdi dir="ltr" className={`cs-num text-lg font-semibold ${urgent ? "text-danger" : "text-fg"}`}>
          {text}
        </bdi>
      </div>
    </div>
  );
}
