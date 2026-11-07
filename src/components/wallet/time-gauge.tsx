"use client";

import { useRef } from "react";
import { FULL_MOTION, REDUCED_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { formatHoursNumber } from "@/lib/time";

// FR-2.1 at a glance: the wallet drawn as an astrolabe limb. The brass arc is available time,
// the turquoise arc is time frozen in escrow; together they make the whole circle of your hours.
interface TimeGaugeProps {
  availableMinutes: number;
  frozenMinutes: number;
}

const R = 84;
const C = 2 * Math.PI * R;

export function TimeGauge({ availableMinutes, frozenMinutes }: TimeGaugeProps) {
  const root = useRef<SVGSVGElement>(null);
  const total = Math.max(availableMinutes + frozenMinutes, 0);
  const availableShare = total > 0 ? availableMinutes / total : 0;
  const frozenShare = total > 0 ? frozenMinutes / total : 0;
  const gap = total > 0 && availableShare > 0 && frozenShare > 0 ? 6 : 0; // px between arcs

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        gsap
          .timeline({ defaults: { ease: "astro" } })
          .from("[data-tick]", { scale: 0, transformOrigin: "100px 100px", duration: 0.6, stagger: { each: 0.008, from: "random" } })
          .from("[data-arc='available']", { drawSVG: "0%", duration: 1.4 }, 0.15)
          .from("[data-arc='frozen']", { drawSVG: "0%", duration: 1.1 }, 0.55)
          .from("[data-needle]", { rotate: -200, transformOrigin: "100px 100px", duration: 1.8, ease: "elastic.out(1, 0.45)" }, 0.1);
      });
      mm.add(REDUCED_MOTION, () => {});
      return () => mm.revert();
    },
    { scope: root },
  );

  const availableLen = Math.max(availableShare * C - gap, 0);
  const frozenLen = Math.max(frozenShare * C - gap, 0);
  const needleDeg = availableShare * 360 - 90;

  return (
    <svg ref={root} viewBox="0 0 200 200" className="size-full" role="img" aria-label={`متاح ${formatHoursNumber(availableMinutes)} ساعة، مجمّد ${formatHoursNumber(frozenMinutes)} ساعة`}>
      <circle cx="100" cy="100" r="97" fill="none" stroke="var(--cs-amber)" strokeOpacity="0.35" />
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i / 60) * Math.PI * 2;
        const long = i % 5 === 0;
        const r1 = 95;
        const r2 = long ? 88 : 91.5;
        const f = (n: number) => Math.round(n * 100) / 100;
        return (
          <line
            key={i}
            data-tick
            x1={f(100 + Math.cos(a) * r1)}
            y1={f(100 + Math.sin(a) * r1)}
            x2={f(100 + Math.cos(a) * r2)}
            y2={f(100 + Math.sin(a) * r2)}
            stroke="var(--cs-amber)"
            strokeOpacity={long ? 0.8 : 0.35}
            strokeWidth={long ? 1.2 : 0.7}
          />
        );
      })}
      <circle cx="100" cy="100" r={R} fill="none" stroke="var(--cs-line)" strokeWidth="10" />
      {/* Start at 12 o'clock and run clockwise. */}
      <g transform="rotate(-90 100 100)">
        {availableLen > 0 && (
          <circle
            data-arc="available"
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="var(--cs-amber)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${availableLen} ${C}`}
          />
        )}
        {frozenLen > 0 && (
          <circle
            data-arc="frozen"
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="var(--cs-cyan)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${frozenLen} ${C}`}
            strokeDashoffset={-(availableShare * C)}
          />
        )}
      </g>
      <g data-needle transform={`rotate(${needleDeg} 100 100)`}>
        <line x1="100" y1="100" x2="168" y2="100" stroke="var(--cs-fg)" strokeOpacity="0.6" strokeWidth="1.2" />
      </g>
      <circle cx="100" cy="100" r="3.5" fill="var(--cs-amber)" />
      <text x="100" y="94" textAnchor="middle" className="fill-[var(--cs-fg)] font-mono" fontSize="26" direction="ltr">
        {formatHoursNumber(total)}
      </text>
      <text x="100" y="118" textAnchor="middle" className="fill-[var(--cs-muted)]" fontSize="11">
        ساعة في محفظتك
      </text>
    </svg>
  );
}
