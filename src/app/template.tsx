"use client";

import { useRef, type ReactNode } from "react";
import { FULL_MOTION, gsap, useGSAP } from "@/components/motion/gsap";

// Re-mounted by Next.js on every navigation. Two panels sweep across in the reading direction,
// brass then turquoise: one hour handed over, one hour received. Skipped on the very first load
// (the page has its own entrance) and for visitors who prefer reduced motion.
let firstMount = true;

export default function Template({ children }: { children: ReactNode }) {
  const curtain = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const isFirst = firstMount;
    firstMount = false;
    const el = curtain.current;
    if (!el || isFirst) return;

    const mm = gsap.matchMedia();
    mm.add(FULL_MOTION, () => {
      const rtl = document.documentElement.dir === "rtl";
      const away = rtl ? "-101%" : "101%";
      gsap
        .timeline({ defaults: { ease: "swap" } })
        .set(el, { display: "block" })
        .set("[data-curtain]", { xPercent: 0 })
        .to("[data-curtain='brass']", { x: away, duration: 0.62 }, 0.04)
        .to("[data-curtain='turquoise']", { x: away, duration: 0.62 }, 0)
        .set(el, { display: "none" });
    });
    return () => mm.revert();
  });

  return (
    <>
      <div ref={curtain} aria-hidden className="pointer-events-none fixed inset-0 z-[60] hidden overflow-hidden">
        <div data-curtain="turquoise" className="absolute inset-0 bg-cyan" />
        <div data-curtain="brass" className="absolute inset-0 bg-amber" />
      </div>
      {children}
    </>
  );
}
