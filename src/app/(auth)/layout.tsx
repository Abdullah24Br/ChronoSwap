import type { ReactNode } from "react";
import { AstrolabeFallback } from "@/components/landing/astrolabe-fallback";
import { TimeAmount } from "@/components/ui/time-amount";
import { WELCOME_BONUS_MINUTES } from "@/lib/rules";

// Login / register / verify. The site header (logo, theme, nav) comes from the app shell, so this
// layout only splits the page: the form on the start side, the instrument on the end side.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[calc(100svh-9rem)] items-center gap-10 py-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
      <div className="w-full">{children}</div>

      <aside
        aria-hidden
        className="relative hidden aspect-square w-full max-w-[36rem] justify-self-center overflow-hidden rounded-[2.25rem] border border-line bg-surface/60 lg:grid lg:place-items-center"
      >
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,var(--cs-glow-amber),transparent_70%)]" />
        <AstrolabeFallback className="relative size-[78%] animate-[spin_160s_linear_infinite] motion-reduce:animate-none" />
        <p className="absolute inset-x-8 bottom-8 text-center text-sm leading-7 text-muted">
          كل ساعة تعلّمها تعود إليك ساعةً تتعلّم بها. وأول{" "}
          <TimeAmount minutes={WELCOME_BONUS_MINUTES} size="sm" tone="amber" /> علينا.
        </p>
      </aside>
    </div>
  );
}
