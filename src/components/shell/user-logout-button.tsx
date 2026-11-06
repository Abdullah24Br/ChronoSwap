"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { logoutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function UserLogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction({});
      router.push("/");
      router.refresh();
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={isPending}
      onClick={handleLogout}
      title="تسجيل الخروج"
      className="text-muted hover:text-danger"
    >
      <LogOut className="size-4" />
      <span className="hidden sm:inline">خروج</span>
    </Button>
  );
}
