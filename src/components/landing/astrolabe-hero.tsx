"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import dynamic from "next/dynamic";
import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { AstrolabeFallback } from "./astrolabe-fallback";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// three.js (~150 kB gzip) is only downloaded on the home page, after first paint.
const AstrolabeScene = dynamic(() => import("./astrolabe-scene"), {
  ssr: false,
  loading: () => <AstrolabeFallback className="size-full opacity-90" />,
});

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** WebGL scene only for visitors who allow motion and whose browser can draw it. */
function useCanRender3D() {
  return useSyncExternalStore(
    subscribeMotion,
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      try {
        const c = document.createElement("canvas");
        return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
      } catch {
        return false;
      }
    },
    () => false, // server render: the still astrolabe
  );
}

export function AstrolabeHero({ children }: { children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const can3D = useCanRender3D();

  useGSAP(
    () => {
      // The page's one orchestrated moment: the instrument arrives, then the words.
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .from("[data-hero-instrument]", { autoAlpha: 0, scale: 0.92, rotate: -8, duration: 1.6 })
          .from("[data-hero-line]", { autoAlpha: 0, y: 28, duration: 0.9, stagger: 0.12 }, "-=1.1");
      });

      // Scroll progress through the hero drives the scene (instrument straightens and recedes).
      ScrollTrigger.create({
        trigger: section.current,
        start: "top top",
        end: "bottom top",
        onUpdate: (self) => {
          progress.current = self.progress;
        },
      });
      return () => mm.revert();
    },
    { scope: section },
  );

  return (
    <section
      ref={section}
      className="relative -mx-4 grid min-h-[calc(100svh-4rem)] items-center gap-8 overflow-hidden px-4 pb-10 md:-mx-6 md:grid-cols-[1.05fr_1fr] md:px-6"
    >
      <div className="relative z-10 flex flex-col gap-7 pt-6 md:pt-0">{children}</div>
      <div
        data-hero-instrument
        className="relative order-first aspect-square w-full max-w-[34rem] justify-self-center md:order-none md:max-w-none"
      >
        {can3D ? <AstrolabeScene progressRef={progress} /> : <AstrolabeFallback className="size-full" />}
      </div>
    </section>
  );
}
