import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/session";
import {
  BookOpen,
  ChevronLeft,
  LayoutDashboard,
  Scale,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

export const instant = false;

export const metadata: Metadata = {
  title: "لوحة تحكم الإدارة",
  description: "لوحة تحكم مدير النظام لإدارة المهارات والنزاعات وإحصائيات المنصة",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (user.role !== "ADMIN") {
    return (
      <main className="container mx-auto px-4 py-16 max-w-lg">
        <Card className="p-8 text-center border-line">
          <CardContent className="space-y-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-danger/10 text-danger mx-auto">
              <ShieldAlert className="size-7" />
            </div>
            <h2 className="text-xl font-bold text-fg">غير مصرح بالدخول</h2>
            <p className="text-xs text-muted leading-relaxed">
              عذراً، هذه المنطقة مخصصة فقط لمديري نظام ChronoSwap (FR-7.x). لا تملك الصلاحية للوصول إليها.
            </p>
            <div className="pt-2">
              <Link
                href="/explore"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber hover:underline"
              >
                <span>العودة للمنصة الرئيسية</span>
                <ChevronLeft className="size-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Header Navigation Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-fg">لوحة تحكم مدير النظام</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber/15 px-2.5 py-0.5 text-xs font-bold text-amber">
              <ShieldCheck className="size-3.5" />
              <span>إدارة المنصة</span>
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            مرحباً بك {user.displayName} — إدارة التصنيفات والمهارات، الفصل في النزاعات، ومتابعة إحصائيات التبادل.
          </p>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-2">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border border-line bg-surface hover:bg-raised text-fg"
          >
            <LayoutDashboard className="size-3.5 text-amber" />
            <span>المؤشرات العامة (FR-7.3)</span>
          </Link>
          <Link
            href="/admin/skills"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border border-line bg-surface hover:bg-raised text-fg"
          >
            <BookOpen className="size-3.5 text-cyan-ink" />
            <span>المهارات والتصنيفات (FR-7.1)</span>
          </Link>
          <Link
            href="/admin/disputes"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border border-line bg-surface hover:bg-raised text-fg"
          >
            <Scale className="size-3.5 text-danger" />
            <span>قضايا النزاع (FR-7.2)</span>
          </Link>
        </nav>
      </div>

      <div>{children}</div>
    </div>
  );
}
