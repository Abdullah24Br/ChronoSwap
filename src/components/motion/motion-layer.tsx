"use client";

import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { countUp } from "./count-up";
import { FULL_MOTION, ScrollTrigger, SplitText, gsap, useGSAP } from "./gsap";

/**
 * App-wide choreography, re-run on every route (NFR-4, motion respects reduced-motion):
 * - page titles (h1, h2) rise word by word from behind a mask (Arabic is split by WORDS only;
 *   splitting letters would break the joined script);
 * - cards and anything marked [data-reveal] arrive in batches as they scroll into view, tipping
 *   forward like plates of an astrolabe settling into the mater;
 * - big balances (TimeAmount size lg/xl) and [data-count] statistics count up when first seen.
 * Pages opt out per element with [data-motion="off"]; the home hero runs its own timeline.
 *
 * Every effect touches the DOM, so each element is only animated once React has hydrated it
 * (React tags hydrated nodes with a "__reactFiber$" key). Streamed parts of a page hydrate later;
 * they are retried every 100 ms for ~3 s, and anything still not hydrated is simply left static.
 */
const isHydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));

function takeReady(pending: Set<HTMLElement>): HTMLElement[] {
  const ready: HTMLElement[] = [];
  for (const el of pending) {
    if (!el.isConnected) pending.delete(el);
    else if (isHydrated(el)) {
      pending.delete(el);
      ready.push(el);
    }
  }
  return ready;
}

export function MotionLayer({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      let timer = 0;

      mm.add(FULL_MOTION, (ctx) => {
        const skip = (el: Element) => el.closest("[data-motion='off'], [data-hero-instrument], [data-hero-line]") !== null;
        const collect = (selector: string, filter: (el: HTMLElement) => boolean = () => true) =>
          new Set(gsap.utils.toArray<HTMLElement>(selector, root).filter((el) => !skip(el) && filter(el)));

        const titles = collect("h1, h2");
        const blocks = collect(".rounded-card, [data-reveal]", (el) => !el.parentElement?.closest(".rounded-card, [data-reveal]"));
        const balances = collect("[data-countup]");
        const stats = collect("[data-count]");
        let firstTitle = true;
        let attempts = 0;

        const run = () => {
          // 1. Titles, word by word.
          for (const title of takeReady(titles)) {
            const lead = firstTitle;
            firstTitle = false;
            SplitText.create(title, {
              type: "words",
              mask: "words",
              autoSplit: true,
              onSplit: (self) =>
                gsap.from(self.words, {
                  yPercent: 115,
                  rotate: 4,
                  duration: 0.9,
                  ease: "astro",
                  stagger: 0.06,
                  delay: lead ? 0.05 : 0,
                  scrollTrigger: lead ? undefined : { trigger: title, start: "top 88%", once: true },
                }),
            });
          }

          // 2. Cards, in batches as they enter. Hidden only at the moment they enter (never up
          // front): a card inside a closed tab or a collapsed panel must never be left invisible.
          const readyBlocks = takeReady(blocks);
          if (readyBlocks.length > 0) {
            ScrollTrigger.batch(readyBlocks, {
              start: "top 92%",
              once: true,
              onEnter: (batch) =>
                gsap.fromTo(
                  batch,
                  { autoAlpha: 0, y: 46, rotateX: -10, transformPerspective: 900, transformOrigin: "50% 0%" },
                  {
                    autoAlpha: 1,
                    y: 0,
                    rotateX: 0,
                    duration: 0.95,
                    ease: "astro",
                    stagger: { each: 0.09, from: "start" },
                    clearProps: "transform,transformPerspective,opacity,visibility",
                  },
                ),
            });
          }

          // 3. Balances count up once visible.
          for (const el of takeReady(balances)) {
            ScrollTrigger.create({ trigger: el, start: "top 95%", once: true, onEnter: () => countUp(el, { delay: 0.25 }) });
          }

          // 4. Plain statistics (admin dashboard): <span data-count>42</span>.
          for (const el of takeReady(stats)) {
            const target = Number(el.textContent);
            if (!Number.isFinite(target) || target === 0) continue;
            const decimals = String(el.textContent).includes(".") ? 1 : 0;
            const state = { v: 0 };
            ScrollTrigger.create({
              trigger: el,
              start: "top 95%",
              once: true,
              onEnter: () =>
                gsap.to(state, {
                  v: target,
                  duration: 1.6,
                  ease: "astro",
                  onUpdate: () => {
                    el.textContent = state.v.toFixed(decimals);
                  },
                }),
            });
          }

          const waiting = titles.size + blocks.size + balances.size + stats.size;
          if (waiting > 0 && attempts++ < 30) timer = window.setTimeout(() => ctx.add(run), 100);
        };

        timer = window.setTimeout(() => ctx.add(run), 0);
        // Pinned sections (home) change page height; recalc once fonts settle.
        document.fonts?.ready.then(() => ScrollTrigger.refresh());
      });

      return () => {
        window.clearTimeout(timer);
        mm.revert();
      };
    },
    { scope, dependencies: [pathname], revertOnUpdate: true },
  );

  return (
    <div ref={scope} className="contents">
      {children}
    </div>
  );
}
