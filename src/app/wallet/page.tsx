import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getWalletDashboard } from "@/server/services/wallet/wallet-service";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TimeAmount } from "@/components/ui/time-amount";
import { TimeGauge } from "@/components/wallet/time-gauge";
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
          {/* FR-2.1 wallet dashboard */}
          <h1 className="flex items-center gap-2.5 text-3xl text-fg md:text-4xl">
            <Wallet className="size-7 text-amber" />
            <span>محفظتك</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            ساعاتك المتاحة والمجمّدة، وكل حركة عليها مسجّلة في دفتر لا يُعدَّل.
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

      {/* FR-2.1: the gauge (available vs frozen) next to the exact balances */}
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,17rem)_1fr]">
        <div data-reveal className="mx-auto aspect-square w-full max-w-[17rem]">
          <TimeGauge availableMinutes={wallet.availableMinutes} frozenMinutes={wallet.frozenMinutes} />
        </div>
        <WalletSummary
          availableMinutes={wallet.availableMinutes}
          frozenMinutes={wallet.frozenMinutes}
          debtMinutes={wallet.debtMinutes}
        />
      </div>

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
