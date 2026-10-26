"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons row; rendered at the bottom, aligned to the inline end. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

// Native <dialog>: focus trap, Esc to close and inert background come for free.
export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        "cs-dialog m-auto w-[calc(100%-2rem)] rounded-card border border-line-strong bg-overlay p-0 text-fg shadow-card",
        "open:animate-dialog-in",
        widths[size],
      )}
    >
      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descId} className="text-sm text-muted">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="-me-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
      {children && <div className="p-5">{children}</div>}
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
    </dialog>
  );
}
