import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/session";
import { getPlatformStats } from "@/server/services/admin/stats-service";
import {
  ArrowRight,
  Calendar,
  Clock,
  Repeat,
  Scale,
  TrendingUp,
  Users,
} from "lucide-react";

export const instant = false;

export default async function AdminStatsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;

  const stats = await getPlatformStats(user.id);

  return (
    <div className="space-y-6">
      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <Card className="border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">إجمالي المستخدمين</span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-soft text-amber-ink">
              <Users className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="font-mono text-2xl font-bold text-fg"><span data-count>{stats.totalUsers}</span></h3>
            <p className="text-[0.7rem] text-muted mt-0.5">مستخدم مسجل في المنصة</p>
          </div>
        </Card>

        {/* Exchanged Hours */}
        <Card className="border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">الساعات المتبادلة</span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-success/10 text-success">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="font-mono text-2xl font-bold text-fg">
              <span data-count>{stats.totalExchangedHours}</span>{" "}
              <span className="text-sm font-sans font-normal text-muted">ساعة</span>
            </h3>
            <p className="text-[0.7rem] text-muted mt-0.5">
              ({stats.totalExchangedMinutes} دقيقة مكتملة ومحررة)
            </p>
          </div>
        </Card>

        {/* Sessions Summary */}
        <Card className="border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">الجلسات المكتملة</span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-soft text-cyan-ink">
              <Calendar className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="font-mono text-2xl font-bold text-fg">
              <span data-count>{stats.completedSessionsCount}</span>{" "}
              <span className="text-xs font-sans font-normal text-muted">
                / {stats.totalSessions} إجمالي
              </span>
            </h3>
            <p className="text-[0.7rem] text-muted mt-0.5">
              {stats.activeSessionsCount} جلسة نشطة حالياً
            </p>
          </div>
        </Card>

        {/* Open Disputes */}
        <Card
          className={`border-line p-4 ${
            stats.openDisputesCount > 0 ? "border-danger/40 bg-danger/5" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">قضايا النزاع المعلقة</span>
            <div
              className={`flex size-8 items-center justify-center rounded-lg ${
                stats.openDisputesCount > 0
                  ? "bg-danger/20 text-danger"
                  : "bg-surface text-muted"
              }`}
            >
              <Scale className="size-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <h3
                className={`font-mono text-2xl font-bold ${
                  stats.openDisputesCount > 0 ? "text-danger" : "text-fg"
                }`}
              >
                <span data-count>{stats.openDisputesCount}</span>
              </h3>
              <p className="text-[0.7rem] text-muted mt-0.5">
                {stats.resolvedDisputesCount} نزاع تم الفصل فيه
              </p>
            </div>
            {stats.openDisputesCount > 0 && (
              <Link
                href="/admin/disputes"
                className="inline-flex items-center gap-1 text-[0.7rem] font-bold text-danger hover:underline"
              >
                <span>مراجعة النزاعات</span>
                <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
        </Card>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Most Requested Skills (FR-7.3) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-line">
            <CardHeader className="border-b border-line px-5 py-3.5 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-fg">
                <TrendingUp className="size-4 text-amber" />
                <span>أكثر المهارات طلباً</span>
              </CardTitle>
              <Link
                href="/admin/skills"
                className="text-[0.7rem] text-muted hover:text-fg hover:underline"
              >
                إدارة المهارات
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {stats.topWantedSkills.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted">
                  لا توجد رغبات مهارات مسجلة حتى الآن.
                </div>
              ) : (
                stats.topWantedSkills.map((skill, idx) => (
                  <div
                    key={skill.skillId}
                    className="flex items-center justify-between p-3 rounded-xl border border-line bg-surface/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-6 items-center justify-center rounded-lg bg-raised text-[0.7rem] font-bold font-mono text-muted">
                        {idx + 1}
                      </span>
                      <div>
                        <h5 className="text-xs font-bold text-fg">{skill.nameAr}</h5>
                        <span className="text-[0.65rem] text-muted">{skill.categoryNameAr}</span>
                      </div>
                    </div>
                    <div className="text-end">
                      <span className="font-mono text-xs font-bold text-amber">
                        {skill.wantedCount}
                      </span>
                      <span className="text-[0.65rem] text-muted block">راغب بالتعلم</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Barter Cycles summary */}
          <Card className="border-line p-4 space-y-3 bg-raised/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="size-4 text-cyan-ink" />
                <h5 className="font-bold text-xs text-fg">محرك المقايضة الحلقية</h5>
              </div>
              <span className="font-mono text-xs font-bold text-fg">
                {stats.barterCyclesCount} حلقة
              </span>
            </div>
            <p className="text-[0.7rem] text-muted leading-relaxed">
              يقوم محرك المقايضة الذكي بالبحث عن الحلقات المغلقة (A &larr; B &larr; C &larr; A) وتسويتها دون حاجة لرصيد مسبق.
            </p>
          </Card>
        </div>

        {/* Recent Sessions Activity */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border-line">
            <CardHeader className="border-b border-line px-5 py-3.5">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-fg">
                <Calendar className="size-4 text-muted" />
                <span>أحدث الجلسات التعليمية على المنصة</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {stats.recentSessions.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted">
                  لا توجد جلسات مسجلة حتى الآن.
                </div>
              ) : (
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="border-b border-line bg-raised/30 text-muted text-[0.7rem]">
                      <th className="p-3 text-start font-medium">المهارة</th>
                      <th className="p-3 text-start font-medium">المتعلم</th>
                      <th className="p-3 text-start font-medium">المدرّس</th>
                      <th className="p-3 text-start font-medium">المدة</th>
                      <th className="p-3 text-start font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {stats.recentSessions.map((s) => (
                      <tr key={s.id} className="hover:bg-raised/20 transition-colors">
                        <td className="p-3 font-semibold text-fg">{s.skillName}</td>
                        <td className="p-3 text-muted">{s.learnerName}</td>
                        <td className="p-3 text-muted">{s.teacherName}</td>
                        <td className="p-3 font-mono text-muted">{s.durationMinutes} دقيقة</td>
                        <td className="p-3">
                          <span className="font-mono text-[0.65rem] px-2 py-0.5 rounded-full bg-surface border border-line text-muted">
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
