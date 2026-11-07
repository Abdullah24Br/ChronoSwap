"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { gsap } from "./gsap";

/**
 * "The aperture" page transition (NFR-4).
 *
 * Cover: when a visitor follows an internal link, a disc of night sky opens from the link itself
 * and fills the screen. Inside it the rings of an astrolabe turn against each other, a brass needle
 * sweeps, and the destination's name rises in Kufic.
 * Reveal: once the new page has rendered, a hole opens from the centre like a camera iris, the
 * rings fly outward with its edge, and the new page settles in from behind.
 *
 * Navigation starts at the same moment as the cover, so the transition hides loading time instead
 * of adding to it. Skipped entirely for reduced motion, modified clicks, new tabs, downloads,
 * same-page links and anything marked [data-no-transition].
 */

const DESTINATIONS: [prefix: string, label: string][] = [
  ["/sessions/new", "حجز جلسة"],
  ["/sessions/", "غرفة الجلسة"],
  ["/sessions", "جلساتي"],
  ["/explore", "استكشاف"],
  ["/barter", "المقايضة"],
  ["/wallet", "المحفظة"],
  ["/archive", "أرشيف التعلّم"],
  ["/profile", "ملفك"],
  ["/admin", "لوحة الإدارة"],
  ["/login", "تسجيل الدخول"],
  ["/register", "حساب جديد"],
  ["/design", "نظام التصميم"],
];

function labelFor(pathname: string) {
  if (pathname === "/") return "الرئيسية";
  return DESTINATIONS.find(([p]) => pathname === p || pathname.startsWith(p))?.[1] ?? "ChronoSwap";
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const TICKS = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  const long = i % 6 === 0;
  const r1 = 92;
  const r2in = long ? 82 : 87;
  return { x1: r2(Math.cos(a) * r1), y1: r2(Math.sin(a) * r1), x2: r2(Math.cos(a) * r2in), y2: r2(Math.sin(a) * r2in), long };
});
const NODES = [-90, 30, 150].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: r2(Math.cos(a) * 40), y: r2(Math.sin(a) * 40) };
});

export function PageTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const overlay = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLParagraphElement>(null);
  const state = useRef<{
    covering: boolean;
    cover: gsap.core.Timeline | null;
    reveal: gsap.core.Timeline | null;
    fallback: number;
    from: string;
  }>({ covering: false, cover: null, reveal: null, fallback: 0, from: "" });

  // ── Reveal: the iris opens over the new page ────────────────────────────────────────────────
  const reveal = useEffectEvent(() => {
    const el = overlay.current;
    const s = state.current;
    if (!el || !s.covering) return;
    s.covering = false;
    window.clearTimeout(s.fallback);
    const max = Math.hypot(window.innerWidth, window.innerHeight);

    s.reveal = gsap
      .timeline({
        defaults: { ease: "power3.inOut" },
        onComplete: () => {
          gsap.set(el, { display: "none", clipPath: "none", "--hole": "0px" });
          gsap.set("#main", { clearProps: "transform,opacity" });
        },
      })
      .set(el, { clipPath: "none", "--hole": "0px" })
      .to("[data-pt-label]", { yPercent: -60, autoAlpha: 0, duration: 0.35, ease: "power2.in" }, 0)
      .to(el, { "--hole": `${max}px`, duration: 0.85 }, 0.1)
      .to("[data-pt-rings]", { scale: 2.6, rotate: "+=90", autoAlpha: 0, duration: 0.85 }, 0.1)
      .fromTo("#main", { scale: 1.035, autoAlpha: 0.4 }, { scale: 1, autoAlpha: 1, duration: 0.9, ease: "astro" }, 0.25);
  });

  // ── Cover: the disc opens from the link that was followed ───────────────────────────────────
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.closest("[data-no-transition]")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return; // same page (filters, hashes): no curtain
      const el = overlay.current;
      const s = state.current;
      if (!el || s.covering) return;

      e.preventDefault();
      // A quick second click: finish the previous reveal at once (its onComplete clears #main).
      s.reveal?.progress(1);
      s.reveal = null;
      s.covering = true;
      s.from = window.location.pathname;
      const href = url.pathname + url.search + url.hash;
      router.push(href); // start loading now; the cover hides the wait

      const rect = a.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const max = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      if (label.current) label.current.textContent = labelFor(url.pathname);

      s.cover = gsap
        .timeline({ defaults: { ease: "power3.inOut" } })
        .set(el, { display: "block", "--hole": "0px", clipPath: `circle(0px at ${x}px ${y}px)` })
        .set("[data-pt-rings]", { scale: 0.55, rotate: -40, autoAlpha: 1 })
        .set("[data-pt-label]", { yPercent: 70, autoAlpha: 0 })
        .to(el, { clipPath: `circle(${max}px at ${x}px ${y}px)`, duration: 0.55 }, 0)
        .to("[data-pt-rings]", { scale: 1, rotate: 0, duration: 0.7, ease: "astro" }, 0.08)
        .fromTo("[data-pt-ring='outer']", { rotate: 0 }, { rotate: 75, duration: 1.2, ease: "power2.out" }, 0)
        .fromTo("[data-pt-ring='rete']", { rotate: 0 }, { rotate: -140, duration: 1.2, ease: "power2.out" }, 0)
        .fromTo("[data-pt-needle]", { rotate: -120 }, { rotate: 240, duration: 1.1, ease: "power2.inOut" }, 0)
        .to("[data-pt-label]", { yPercent: 0, autoAlpha: 1, duration: 0.45, ease: "astro" }, 0.25);

      // Never leave the curtain down: reveal anyway if the page does not arrive in time.
      s.fallback = window.setTimeout(() => reveal(), 6000);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  // The new route has rendered: open the iris once the cover has finished drawing.
  useEffect(() => {
    const s = state.current;
    if (!s.covering || pathname === s.from) return;
    const cover = s.cover;
    if (cover && cover.isActive()) {
      // Hold the cover a beat so the destination name can be read, then open.
      cover.eventCallback("onComplete", () => window.setTimeout(() => reveal(), 120));
    } else {
      window.setTimeout(() => reveal(), 120);
    }
  }, [pathname]);

  return (
    <>
      {children}
      <div
        ref={overlay}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[70] hidden overflow-hidden bg-canvas [mask-image:radial-gradient(circle_at_50%_50%,transparent_var(--hole),#000_calc(var(--hole)+1px))]"
        style={{ "--hole": "0px" } as React.CSSProperties}
      >
        <div className="absolute inset-0 bg-[radial-gradient(55%_55%_at_50%_50%,var(--cs-glow-amber),transparent_70%)]" />
        <div className="absolute inset-0 grid place-items-center">
          <svg data-pt-rings viewBox="-100 -100 200 200" className="size-[min(78vmin,34rem)] overflow-visible">
            <g data-pt-ring="outer">
              <circle r="96" fill="none" stroke="var(--cs-amber)" strokeWidth="1.6" />
              {TICKS.map((t, i) => (
                <line
                  key={i}
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  stroke="var(--cs-amber)"
                  strokeOpacity={t.long ? 0.9 : 0.45}
                  strokeWidth={t.long ? 1.1 : 0.6}
                />
              ))}
            </g>
            <circle r="74" fill="none" stroke="var(--cs-fg)" strokeOpacity="0.16" strokeDasharray="2 4" />
            <circle r="60" fill="none" stroke="var(--cs-fg)" strokeOpacity="0.1" />
            <g data-pt-ring="rete">
              <circle r="40" fill="none" stroke="var(--cs-amber)" strokeWidth="1.2" />
              <polygon points={NODES.map((n) => `${n.x},${n.y}`).join(" ")} fill="none" stroke="var(--cs-cyan)" strokeOpacity="0.55" />
              {NODES.map((n, i) => (
                <circle key={i} cx={n.x} cy={n.y} r="3.4" fill="var(--cs-amber)" />
              ))}
            </g>
            <g data-pt-needle>
              <line x1="0" y1="0" x2="0" y2="-86" stroke="var(--cs-amber)" strokeWidth="1.4" strokeLinecap="round" />
              <circle r="3" fill="var(--cs-amber)" />
            </g>
          </svg>
        </div>
        <div className="absolute inset-0 grid place-items-center">
          <p
            ref={label}
            data-pt-label
            className="font-display text-4xl text-fg drop-shadow-[0_0_24px_var(--cs-glow-amber)] sm:text-6xl"
          />
        </div>
      </div>
    </>
  );
}
