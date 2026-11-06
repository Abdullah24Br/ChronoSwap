import type { LedgerEntryType } from "@/generated/prisma/enums";

// FR-2.1: Human-readable presentation for ledger entry types.
// Follows IEEE Std 830-1998 requirements for ChronoSwap v4.0.

export interface LedgerTypeMeta {
  title: string;
  description: string;
  tone: "amber" | "cyan" | "success" | "danger" | "neutral";
  direction: "credit" | "debit" | "freeze" | "refund" | "neutral";
}

export const LEDGER_ENTRY_META: Record<LedgerEntryType, LedgerTypeMeta> = {
  WELCOME_BONUS: {
    title: "مكافأة ترحيبية",
    description: "هدية انضمام فورية لإتاحة بدء التعلم مباشرة (FR-1.2)",
    tone: "success",
    direction: "credit",
  },
  SESSION_FREEZE: {
    title: "تجميد رصيد لجلسة",
    description: "حجز رصيد الضمان للجلسة حتى انعقادها وتأكيد إتمامها (FR-2.2)",
    tone: "cyan",
    direction: "freeze",
  },
  SESSION_REFUND: {
    title: "استرجاع رصيد مجمّد",
    description: "إعادة الساعات المحجوزة للمتعلم لرفض الطلب أو الإلغاء ضمن المهلة (FR-2.4)",
    tone: "amber",
    direction: "refund",
  },
  SESSION_RELEASE_DEBIT: {
    title: "تحرير ساعات الجلسة",
    description: "خصم الساعات المجمّدة وإرسالها للمدرّس بعد إتمام الجلسة (FR-2.3)",
    tone: "neutral",
    direction: "debit",
  },
  SESSION_RELEASE_CREDIT: {
    title: "أجر جلسة تعليمية",
    description: "إيداع الساعات المستحقة في رصيدك المتاح نظير تدريس جلسة مكتملة (FR-2.3)",
    tone: "success",
    direction: "credit",
  },
  BARTER_SETTLEMENT_DEBIT: {
    title: "تسوية مقايضة (خصم)",
    description: "تسوية ساعات جلسة من حلقة مقايضة ثلاثية متعثرة (FR-3.4)",
    tone: "danger",
    direction: "debit",
  },
  BARTER_SETTLEMENT_CREDIT: {
    title: "تسوية مقايضة (إيداع)",
    description: "إيداع ساعات مكتسبة من جلسة حلقة مقايضة مكتملة (FR-3.4)",
    tone: "success",
    direction: "credit",
  },
  ADMIN_ADJUSTMENT: {
    title: "تسوية إدارية",
    description: "تعديل تصحيحي موثق بقرار مدير النظام في دفتر الأستاذ (FR-7.2)",
    tone: "neutral",
    direction: "neutral",
  },
};

export function getLedgerEntryMeta(type: LedgerEntryType): LedgerTypeMeta {
  return (
    LEDGER_ENTRY_META[type] ?? {
      title: type,
      description: "حركة زمنية موثقة في دفتر الأستاذ",
      tone: "neutral",
      direction: "neutral",
    }
  );
}

