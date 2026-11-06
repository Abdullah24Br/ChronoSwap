import type { BarterCycleStatus, BarterDecision } from "@/generated/prisma/enums";
import type { BadgeTone } from "@/components/ui/badge";

// Arabic labels for BarterCycle.status (docs/SESSION_STATE_MACHINE.md, "Barter cycle status").
export const BARTER_CYCLE_STATUS_META: Record<BarterCycleStatus, { label: string; tone: BadgeTone; live?: boolean }> = {
  PROPOSED: { label: "بانتظار موافقة الأطراف", tone: "amber", live: true },
  ACTIVE: { label: "نشطة — احجزوا الجلسات", tone: "cyan", live: true },
  COMPLETED: { label: "اكتملت المقايضة", tone: "success" },
  FAILED: { label: "تعثّرت — سُوّيت كجلسات عادية", tone: "danger" },
  DECLINED: { label: "رفضها أحد الأطراف", tone: "neutral" },
  EXPIRED: { label: "انتهت مهلة الرد", tone: "neutral" },
};

export const BARTER_DECISION_META: Record<BarterDecision, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "لم يردّ بعد", tone: "neutral" },
  ACCEPTED: { label: "وافق", tone: "success" },
  DECLINED: { label: "رفض", tone: "danger" },
};
