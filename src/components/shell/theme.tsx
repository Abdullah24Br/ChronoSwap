"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

// Dark-first. The choice is stored in localStorage and applied before paint by
// THEME_INIT_SCRIPT (see app/layout.tsx), so there is no flash.

export const THEME_STORAGE_KEY = "cs-theme";
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

type Theme = "dark" | "light";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.setAttribute("data-theme", next);
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {}
      }}
      aria-label={next === "light" ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"}
      className={cn(
        "grid size-10 place-items-center rounded-[0.7rem] border border-line text-muted transition-colors hover:border-line-strong hover:text-fg",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="size-[1.1rem]" /> : <Moon className="size-[1.1rem]" />}
    </button>
  );
}
