import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AuthNav, AuthNavSkeleton } from "./auth-nav";
import { MotionLayer } from "@/components/motion/motion-layer";
import { Logo } from "./logo";
import { DesktopNav, MobileNav } from "./navigation";
import { ThemeToggle } from "./theme";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="cs-backdrop" aria-hidden />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-amber focus:px-4 focus:py-2 focus:text-on-amber"
      >
        تخطَّ إلى المحتوى
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-8">
            <Link href="/" aria-label="ChronoSwap — الرئيسية">
              <Logo />
            </Link>
            <DesktopNav />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Suspense fallback={<AuthNavSkeleton />}>
              <AuthNav />
            </Suspense>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 md:px-6 md:pb-16">
        <MotionLayer>{children}</MotionLayer>
      </main>
      <MobileNav />
    </>
  );
}
