"use client";

import { formatHoursNumber, signPrefix } from "@/lib/time";
import { gsap } from "./gsap";

/**
 * Counts a TimeAmount's number up from 0 to its value. TimeAmount marks big balances with
 * `data-countup` and carries `data-minutes` / `data-signed`, so any page gets this for free.
 * Values stay integer minutes all the way (display only).
 */
export function countUp(el: HTMLElement, options: { duration?: number; delay?: number } = {}) {
  const minutes = Number(el.dataset.minutes);
  if (!Number.isFinite(minutes) || minutes === 0) return null;
  const signed = el.dataset.signed === "true";
  const state = { v: 0 };
  const render = () => {
    const m = Math.round(state.v);
    el.textContent = `${signPrefix(m, signed)}${formatHoursNumber(m)}`;
  };
  render();
  return gsap.to(state, {
    v: minutes,
    duration: options.duration ?? 1.4,
    delay: options.delay ?? 0,
    ease: "astro",
    onUpdate: render,
    onComplete: () => {
      state.v = minutes;
      render();
    },
  });
}
