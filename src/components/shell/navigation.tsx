"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Desktop: inline links in the top bar. */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-1 md:flex">
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
            {active && <span className="absolute inset-x-3 -bottom-[13px] h-px bg-amber" />}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile: fixed bottom tab bar (thumb-reachable), hidden from md up. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
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
