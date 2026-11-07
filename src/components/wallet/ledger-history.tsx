"use client";

import { useMemo, useState } from "react";
import type { LedgerEntryType } from "@/generated/prisma/enums";
import { getLedgerEntryMeta } from "@/lib/ledger-presentation";
import { formatDateTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TimeAmount } from "@/components/ui/time-amount";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  History,
  Lock,
  RotateCcw,
  Sparkles,
  Wallet,
} from "lucide-react";

export interface LedgerEntryItem {
  id: string;
  type: LedgerEntryType;
  availableDelta: number;
  frozenDelta: number;
  debtDelta: number;
  availableAfter: number;
  frozenAfter: number;
  debtAfter: number;
  walletVersion: number;
  memo: string | null;
  createdAt: Date | string;
}

interface LedgerHistoryProps {
  entries: LedgerEntryItem[];
  userTimezone: string;
}

export function LedgerHistory({ entries, userTimezone }: LedgerHistoryProps) {
  const [filter, setFilter] = useState<"ALL" | "CREDITS" | "FREEZES" | "REFUNDS">("ALL");

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filter === "CREDITS") return e.availableDelta > 0;
      if (filter === "FREEZES") return e.frozenDelta > 0;
      if (filter === "REFUNDS") return e.type === "SESSION_REFUND";
      return true;
    });
  }, [entries, filter]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <History className="size-5 text-amber" />
          <div>
            <CardTitle className="text-lg">سجل الحركات الزمنية</CardTitle>
            <p className="text-xs text-muted">
              سجل مالي غير قابل للتعديل يوثق كل إضافة أو حجز أو تحرير للوقت بدقة الدقيقة
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              filter === "ALL"
                ? "bg-amber text-on-amber shadow-sm"
                : "bg-surface text-muted hover:text-fg hover:bg-raised"
            }`}
          >
            الكل ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("CREDITS")}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              filter === "CREDITS"
                ? "bg-amber text-on-amber shadow-sm"
                : "bg-surface text-muted hover:text-fg hover:bg-raised"
            }`}
          >
            إيداعات ومكافآت
          </button>
          <button
            type="button"
            onClick={() => setFilter("FREEZES")}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              filter === "FREEZES"
                ? "bg-amber text-on-amber shadow-sm"
                : "bg-surface text-muted hover:text-fg hover:bg-raised"
            }`}
          >
            تجميد وضمان
          </button>
          <button
            type="button"
            onClick={() => setFilter("REFUNDS")}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              filter === "REFUNDS"
                ? "bg-amber text-on-amber shadow-sm"
                : "bg-surface text-muted hover:text-fg hover:bg-raised"
            }`}
          >
            استرجاعات
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {filteredEntries.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Wallet />}
              title="لا توجد حركات في هذا التصنيف"
              description="كل حركة إيداع أو حجز جلسة أو استرجاع ستظهر هنا كقيد رسمي دائم."
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filteredEntries.map((entry) => {
              const meta = getLedgerEntryMeta(entry.type);
              const createdAtDate =
                typeof entry.createdAt === "string" ? new Date(entry.createdAt) : entry.createdAt;

              return (
                <div
                  key={entry.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 transition-colors hover:bg-raised/40"
                >
                  {/* Left: Icon & Title & Description */}
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border ${
                        meta.tone === "success"
                          ? "border-success/30 bg-success-soft text-success"
                          : meta.tone === "cyan"
                            ? "border-cyan/30 bg-cyan-soft text-cyan-ink"
                            : meta.tone === "amber"
                              ? "border-amber/30 bg-amber-soft text-amber-ink"
                              : "border-line bg-raised text-muted"
                      }`}
                    >
                      {entry.type === "WELCOME_BONUS" && <Sparkles className="size-5" />}
                      {entry.type === "SESSION_FREEZE" && <Lock className="size-5" />}
                      {entry.type === "SESSION_REFUND" && <RotateCcw className="size-5" />}
                      {entry.type === "SESSION_RELEASE_CREDIT" && <ArrowDownLeft className="size-5" />}
                      {entry.type === "SESSION_RELEASE_DEBIT" && <ArrowUpRight className="size-5" />}
                      {entry.type === "ADMIN_ADJUSTMENT" && <History className="size-5" />}
                      {![
                        "WELCOME_BONUS",
                        "SESSION_FREEZE",
                        "SESSION_REFUND",
                        "SESSION_RELEASE_CREDIT",
                        "SESSION_RELEASE_DEBIT",
                        "ADMIN_ADJUSTMENT",
                      ].includes(entry.type) && <Clock className="size-5" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-fg">{meta.title}</span>
                        <Badge tone={meta.tone} className="text-[0.65rem] py-0 px-2">
                          إصدار #{entry.walletVersion}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted">{meta.description}</p>

                      {entry.memo && (
                        <p className="text-xs text-subtle font-mono" dir="ltr">
                          memo: {entry.memo}
                        </p>
                      )}

                      <span className="inline-block text-[0.7rem] text-subtle">
                        {formatDateTime(createdAtDate, userTimezone, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Right: Amounts & Post-Balance */}
                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-line/60 shrink-0 gap-1">
                    {/* Available Delta */}
                    {entry.availableDelta !== 0 && (
                      <TimeAmount
                        minutes={entry.availableDelta}
                        signed
                        size="md"
                        tone={entry.availableDelta > 0 ? "amber" : "danger"}
                      />
                    )}

                    {/* Frozen Delta */}
                    {entry.frozenDelta !== 0 && (
                      <div className="flex items-center gap-1 text-xs text-cyan-ink">
                        <Lock className="size-3" />
                        <span>مجمّد:</span>
                        <TimeAmount minutes={entry.frozenDelta} signed size="sm" tone="cyan" />
                      </div>
                    )}

                    {/* Post-Balance */}
                    <span className="text-[0.7rem] text-subtle">
                      الرصيد بعد الحركة:{" "}
                      <strong className="text-fg font-mono">
                        {(entry.availableAfter / 60).toFixed(1)} س
                      </strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

