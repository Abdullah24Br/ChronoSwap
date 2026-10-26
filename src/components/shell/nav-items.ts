import { ArrowLeftRight, CalendarClock, Compass, House, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Routes are built in later phases; until then they land on the "under construction" page.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "الرئيسية", icon: House },
  { href: "/explore", label: "استكشاف", icon: Compass }, // FR-3.1 / FR-3.2
  { href: "/sessions", label: "جلساتي", icon: CalendarClock }, // FR-4.x
  { href: "/barter", label: "المقايضة", icon: ArrowLeftRight }, // FR-3.3 / FR-3.4
  { href: "/wallet", label: "المحفظة", icon: Wallet }, // FR-2.1
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
