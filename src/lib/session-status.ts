import type { SessionStatus } from "@/generated/prisma/enums";
import type { BadgeTone } from "@/components/ui/badge";

// Arabic labels for docs/SESSION_STATE_MACHINE.md statuses.
export const SESSION_STATUS_META: Record<SessionStatus, { label: string; tone: BadgeTone; live?: boolean }> = {
  PENDING: { label: "بانتظار رد المدرّس", tone: "amber" },
  ACCEPTED: { label: "مؤكَّدة", tone: "cyan" },
  IN_PROGRESS: { label: "جارية الآن", tone: "success", live: true },
  REJECTED: { label: "مرفوضة", tone: "neutral" },
  AUTO_REJECTED: { label: "رُفضت تلقائياً", tone: "neutral" },
  CANCELLED: { label: "ملغاة", tone: "neutral" },
  NO_SHOW_TEACHER: { label: "غياب المدرّس", tone: "danger" },
  NO_SHOW_LEARNER: { label: "غياب المتعلّم", tone: "danger" },
  NO_SHOW_BOTH: { label: "غياب الطرفين", tone: "danger" },
  ENDED: { label: "انتهت — بانتظار التحرير", tone: "cyan" },
  QUIZ_PENDING: { label: "بانتظار الاختبار", tone: "amber" },
  DISPUTED: { label: "قيد مراجعة الإدارة", tone: "danger" },
  RELEASED: { label: "مكتملة", tone: "success" },
  RESOLVED_REFUNDED: { label: "أُعيدت الساعات للمتعلّم", tone: "neutral" },
  RESOLVED_RELEASED: { label: "حُوّلت الساعات للمدرّس", tone: "success" },
  BARTER_COMPLETED: { label: "مكتملة — بانتظار الحلقة", tone: "cyan" },
  BARTER_SETTLED: { label: "تمّت المقايضة", tone: "success" },
};
