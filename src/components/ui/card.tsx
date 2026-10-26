import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends ComponentProps<"div"> {
  /** Thin accent line along the top edge. */
  accent?: "amber" | "cyan" | "split";
  interactive?: boolean;
}

const accentLine = {
  amber: "before:bg-amber",
  cyan: "before:bg-cyan",
  split: "before:bg-[linear-gradient(to_left,var(--cs-amber)_0_50%,var(--cs-cyan)_50%_100%)]",
};

export function Card({ accent, interactive, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card border border-line bg-surface shadow-card",
        accent && ["before:absolute before:inset-x-0 before:top-0 before:h-px before:opacity-80", accentLine[accent]],
        interactive && "transition-colors hover:border-line-strong hover:bg-raised",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: ComponentProps<"h3">) {
  return <h3 className={cn("text-lg font-semibold text-fg", className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted", className)} {...rest} />;
}

export function CardContent({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-3 border-t border-line px-5 py-4", className)} {...rest} />;
}
