import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import { getCurrentUser } from "@/server/auth/session";
import { getAdminDisputesList } from "@/server/services/admin/disputes-admin-service";
import { ArrowRight, Scale } from "lucide-react";

export const instant = false;

export default async function AdminDisputesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;

  const disputes = await getAdminDisputesList(user.id);

  const openDisputes = disputes.filter((d) => d.status === "OPEN");
  const resolvedDisputes = disputes.filter((d) => d.status === "RESOLVED");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-fg">قضايا النزاع والتحكيم الإداري (FR-7.2)</h2>
        <p className="text-xs text-muted">
          مراجعة الجلسات المعترض عليها والجلسات المحالة تلقائياً لقلة الإنجاز، مع استعراض الأدلة والفصل المالي فيها.
        </p>
      </div>

      {/* Disputes Table / List */}
      <Card className="border-line overflow-hidden">
        <CardHeader className="border-b border-line px-5 py-3.5 bg-raised/30 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-fg">
            <Scale className="size-4 text-danger" />
            <span>سجل النزاعات ({disputes.length})</span>
          </CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-danger font-semibold">{openDisputes.length} قيد النظر</span>
            <span>•</span>
            <span className="text-muted">{resolvedDisputes.length} مفصول فيها</span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {disputes.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted">
              لا توجد قضايا نزاع أو اعتراضات مسجلة على المنصة حتى الآن.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {disputes.map((dispute) => {
                const isOpen = dispute.status === "OPEN";
                return (
                  <div
                    key={dispute.id}
                    className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-raised/20 transition-colors"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isOpen ? (
                          <Badge tone="danger" className="text-[0.65rem]">
                            نزاع مفتوح بانتظار القرار
                          </Badge>
                        ) : (
                          <Badge tone="neutral" className="text-[0.65rem]">
                            تم الفصل: {dispute.resolution === "REFUND_LEARNER" ? "إعادة للمتعلم" : "صرف للمدرّس"}
                          </Badge>
                        )}

                        <span className="text-xs font-bold text-fg">
                          جلسة: {dispute.session.skill.nameAr}
                        </span>

                        <span className="text-[0.65rem] font-mono text-muted">
                          ({dispute.session.durationMinutes} دقيقة)
                        </span>

                        {dispute.source === "LOW_COMPLETION" ? (
                          <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-amber/10 text-amber font-semibold">
                            إحالة تلقائية (إنجاز &lt; 50%)
                          </span>
                        ) : (
                          <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-surface border border-line text-muted">
                            اعتراض مستخدم
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span>
                          المتعلم: <strong className="text-fg">{dispute.session.learner.displayName}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          المدرّس: <strong className="text-fg">{dispute.session.teacher.displayName}</strong>
                        </span>
                        <span>•</span>
                        <span>تاريخ الفتح: {formatDateTime(dispute.createdAt, "Asia/Damascus")}</span>
                      </div>

                      {dispute.reason && (
                        <p className="text-xs text-fg bg-canvas p-2.5 rounded-lg border border-line mt-1 line-clamp-2 leading-relaxed">
                          <strong className="text-muted">السبب: </strong>
                          {dispute.reason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <ButtonLink
                        href={`/admin/disputes/${dispute.id}`}
                        variant={isOpen ? "primary" : "outline"}
                        size="sm"
                        className="text-xs"
                      >
                        <span>{isOpen ? "مراجعة الأدلة والفصل" : "عرض تفاصيل القرار"}</span>
                        <ArrowRight className="size-3.5 ms-1" />
                      </ButtonLink>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
