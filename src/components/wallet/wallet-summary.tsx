import { Lock, Sparkles, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TimeAmount } from "@/components/ui/time-amount";

interface WalletSummaryProps {
  availableMinutes: number;
  frozenMinutes: number;
  debtMinutes: number;
}

// FR-2.1 wallet header: available (amber, spendable) · frozen (cyan, in escrow) · debt (FR-3.4).
// Presentational only; data comes from the wallet service in Phase 1.
export function WalletSummary({ availableMinutes, frozenMinutes, debtMinutes }: WalletSummaryProps) {
  return (
    <Card accent="split" className="p-0">
      <div className="grid gap-px bg-line sm:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-3 bg-surface p-6">
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <Sparkles className="size-4 text-amber-ink" />
            الرصيد المتاح
          </span>
          <TimeAmount minutes={availableMinutes} size="xl" tone="amber" />
          <span className="text-xs text-subtle">يمكنك استخدامه لحجز جلسات جديدة</span>
        </div>
        <div className="flex flex-col gap-4 bg-surface p-6">
          <div className="flex flex-col gap-2">
            <span className="inline-flex items-center gap-2 text-sm text-muted">
              <Lock className="size-4 text-cyan-ink" />
              الرصيد المجمّد
            </span>
            <TimeAmount minutes={frozenMinutes} size="lg" tone="cyan" />
          </div>
          {debtMinutes > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2">
              <span className="inline-flex items-center gap-2 text-sm text-danger">
                <TriangleAlert className="size-4" />
                دين مستحق
              </span>
              <TimeAmount minutes={debtMinutes} size="sm" tone="danger" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
