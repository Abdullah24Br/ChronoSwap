import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/shell/logo";
import { ThemeToggle } from "@/components/shell/theme";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg">
      <header className="flex h-16 items-center justify-between px-6 border-b border-line">
        <Link href="/" aria-label="ChronoSwap — الرئيسية">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
