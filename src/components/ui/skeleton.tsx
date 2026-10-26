import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--cs-raised)_0%,var(--cs-overlay)_50%,var(--cs-raised)_100%)] bg-[length:200%_100%]",
        className,
      )}
      {...rest}
    />
  );
}
