"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { FULL_MOTION, REDUCED_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, isActive } from "./nav-items";

/**
 * Moves a single indicator to the active link with GSAP (measured in pixels, so it works in RTL
 * and LTR alike). The indicator glides between links instead of jumping.
 */
function useSlidingIndicator(container: React.RefObject<HTMLElement | null>, indicator: React.RefObject<HTMLElement | null>, pathname: string) {
  useGSAP(
    () => {
      const box = container.current;
      const bar = indicator.current;
      if (!box || !bar) return;

      const place = (animate: boolean) => {
        const active = box.querySelector<HTMLElement>("[aria-current='page']");
        if (!active) {
          gsap.to(bar, { autoAlpha: 0, duration: 0.2 });
          return;
        }
        const b = box.getBoundingClientRect();
        const a = active.getBoundingClientRect();
        const vars = { x: a.left - b.left, width: a.width, autoAlpha: 1 };
        if (animate) gsap.to(bar, { ...vars, duration: 0.7, ease: "astro" });
        else gsap.set(bar, vars);
      };

      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => place(true));
      mm.add(REDUCED_MOTION, () => place(false));
      const onResize = () => place(false);
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        mm.revert();
      };
    },
    { dependencies: [pathname], scope: container },
  );
}

/** Desktop: inline links in the top bar with a brass bar that glides under the active one. */
export function DesktopNav() {
  const pathname = usePathname();
  const box = useRef<HTMLElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(box, bar, pathname);

  return (
    <nav ref={box} aria-label="التنقل الرئيسي" className="relative hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-lg px-3 py-1.5 text-sm transition-colors",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <span
        ref={bar}
        aria-hidden
        className="invisible absolute -bottom-[13px] h-px bg-amber shadow-[0_0_12px_var(--cs-amber)]"
        // Physical left: 0 on purpose: GSAP sets x from measured pixel offsets (same in RTL and LTR).
        style={{ left: 0 }}
      />
    </nav>
  );
}

/** Mobile: fixed bottom tab bar (thumb-reachable) with a glowing pill that slides to the active tab. */
export function MobileNav() {
  const pathname = usePathname();
  const box = useRef<HTMLUListElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(box, pill, pathname);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        gsap.fromTo(
          "[aria-current='page'] svg",
          { scale: 0.6, rotate: -25 },
          { scale: 1, rotate: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" },
        );
      });
      return () => mm.revert();
    },
    { dependencies: [pathname], scope: box },
  );

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul ref={box} className="relative mx-auto grid max-w-md grid-cols-5">
        <span
          ref={pill}
          aria-hidden
          className="invisible absolute top-2 h-12 rounded-2xl bg-amber-soft ring-1 ring-amber/25"
          style={{ left: 0 }}
        />
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="relative">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] transition-colors",
                  active ? "text-amber-ink" : "text-subtle hover:text-fg",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
