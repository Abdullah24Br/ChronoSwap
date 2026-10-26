"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ToastTone = "info" | "success" | "danger";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  toast: (t: Omit<ToastItem, "id"> & { durationMs?: number }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons = { info: Info, success: CircleCheck, danger: CircleAlert };
const toneClasses = {
  info: "text-cyan-ink",
  success: "text-success",
  danger: "text-danger",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const api = useMemo<ToastApi>(
    () => ({
      toast: ({ durationMs = 4500, ...t }) => {
        const id = nextId.current++;
        setItems((all) => [...all.slice(-3), { id, ...t }]);
        setTimeout(() => dismiss(id), durationMs);
      },
    }),
    [dismiss],
  );

  return (
    <ToastContext value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:end-6 md:items-end"
      >
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "danger" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border border-line-strong bg-overlay p-3.5 shadow-card"
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", toneClasses[t.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-muted">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="إغلاق"
                className="grid size-6 shrink-0 place-items-center rounded-md text-subtle hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const ctx = use(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
