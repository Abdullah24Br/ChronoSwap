import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { UserLogoutButton } from "./user-logout-button";
import { ShieldCheck } from "lucide-react";

export async function AuthNav() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <ButtonLink href="/login" variant="outline" size="md" className="hidden sm:inline-flex">
          تسجيل الدخول
        </ButtonLink>
        <ButtonLink href="/register" size="md">
          ابدأ مجاناً
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {user.role === "ADMIN" && (
        <ButtonLink href="/admin" variant="outline" size="sm" className="hidden sm:inline-flex text-xs">
          <ShieldCheck className="size-3.5 me-1 text-amber" />
          <span>لوحة الإدارة</span>
        </ButtonLink>
      )}
      <Link
        href="/profile"
        aria-label={`الملف الشخصي: ${user.displayName}`}
        className="flex items-center gap-2 rounded-lg border border-line bg-surface p-1.5 text-sm transition-colors hover:border-line-strong hover:bg-raised sm:px-3"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-amber-soft text-amber-ink font-semibold text-xs">
          {user.displayName.slice(0, 1)}
        </span>
        {/* NFR-4: on phones the avatar alone keeps the top bar inside 390px */}
        <span className="hidden max-w-[120px] truncate font-medium text-fg sm:inline">{user.displayName}</span>
        {user.role === "ADMIN" && (
          <Badge tone="amber" className="gap-1 px-1.5 py-0 text-xs">
            <ShieldCheck className="size-3" />
            <span>مدير</span>
          </Badge>
        )}
      </Link>
      <UserLogoutButton />
    </div>
  );
}

export function AuthNavSkeleton() {
  return (
    // NFR-4: same footprint as the signed-in bar on phones, so nothing overflows while loading.
    <div className="flex items-center gap-2">
      <div className="size-10 animate-pulse rounded-lg bg-surface sm:h-10 sm:w-24" />
      <div className="size-10 animate-pulse rounded-lg bg-surface sm:h-10 sm:w-24" />
    </div>
  );
}
