"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends Omit<ComponentProps<"input">, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  /** Rendered at the inline start (right in RTL). */
  startAdornment?: ReactNode;
  /** Rendered at the inline end (left in RTL). */
  endAdornment?: ReactNode;
}

export function Input({ label, hint, error, startAdornment, endAdornment, className, id, dir, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-fg">
          {label}
        </label>
      )}
      <div
        className={cn(
          "group flex h-11 items-center gap-2 rounded-[0.7rem] border bg-raised px-3 transition-colors",
          "focus-within:border-cyan focus-within:shadow-[0_0_0_3px_var(--cs-cyan-soft)]",
          error ? "border-danger/60" : "border-line-strong hover:border-subtle",
          rest.disabled && "opacity-50",
        )}
      >
        {startAdornment && <span className="flex shrink-0 text-subtle">{startAdornment}</span>}
        <input
          id={inputId}
          dir={dir}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-fg outline-none placeholder:text-subtle focus-visible:outline-none"
          {...rest}
        />
        {endAdornment && <span className="flex shrink-0 text-subtle">{endAdornment}</span>}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
