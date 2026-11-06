import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getWalletDashboard } from "@/server/services/wallet/wallet-service";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TimeAmount } from "@/components/ui/time-amount";
import { LedgerHistory } from "@/components/wallet/ledger-history";
import { WalletSummary } from "@/components/wallet/wallet-summary";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Compass,
  GraduationCap,
  ShieldCheck,
  Wallet,
} from "lucide-react";

export const metadata = {
  title: "محفظة الوقت وسجل الحركات",
  description: "عرض الرصيد المتاح والمجمّد والدين وسجل قيود دفتر الأستاذ",
};

export const instant = false;

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { wallet, summary, entries } = await getWalletDashboard(db, user.id);

  return (
    <div className="space-y-8 pb-12">
      {/* Wallet Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2.5">
            <Wallet className="size-6 text-amber" />
            <span>محفظة الوقت (FR-2.1)</span>
          </h1>
          <p className="text-sm text-muted mt-1">
            رصيدك من ساعات التعلم والتعليم وسجل كافة الحركات الموثقة بدفتر الأستاذ غير القابل للتعديل (NFR-2).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ButtonLink href="/explore" variant="primary" size="md" icon={<Compass className="size-4" />}>
            استكشاف المهارات
          </ButtonLink>
          <ButtonLink href="/profile" variant="outline" size="md" icon={<GraduationCap className="size-4" />}>
            مهاراتي
          </ButtonLink>
        </div>
      </div>

      {/* Main Wallet Summary Card (FR-2.1) */}
      <WalletSummary
        availableMinutes={wallet.availableMinutes}
        frozenMinutes={wallet.frozenMinutes}
        debtMinutes={wallet.debtMinutes}
      />

      {/* Lifetime Stats & Escrow Guarantee Note */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
              <ArrowDownLeft className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted">إجمالي الساعات المكتسبة</p>
              <TimeAmount minutes={summary.totalEarnedMinutes} size="lg" tone="amber" signed />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
              <ArrowUpRight className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted">إجمالي الساعات المستهلكة</p>
              <TimeAmount minutes={-summary.totalSpentMinutes} size="lg" tone="danger" signed />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-raised text-muted">
              <ShieldCheck className="size-5 text-cyan-ink" />
            </span>
            <div>
              <p className="text-xs text-muted">نظام الضمان Escrow</p>
              <p className="text-xs font-semibold text-fg">محمي بدفتر أستاذ دائم</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Transactions Table (FR-2.1) */}
      <LedgerHistory entries={entries} userTimezone={user.timezone} />
    </div>
  );
}
