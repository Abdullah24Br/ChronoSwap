"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { resendVerificationAction, verifyEmailAction } from "@/server/actions/auth";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertCircle, Mail, Sparkles, ArrowRight } from "lucide-react";

export function VerifyEmailClient({ initialToken }: { initialToken?: string }) {
  const [status, setStatus] = useState<"loading" | "success" | "error" | "idle">(
    initialToken ? "loading" : "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const [isResending, startResendTransition] = useTransition();

  useEffect(() => {
    if (!initialToken) return;

    let mounted = true;
    (async () => {
      const res = await verifyEmailAction({ token: initialToken });
      if (!mounted) return;
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMessage(res.error.message);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [initialToken]);

  const handleResend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResendStatus(null);

    startResendTransition(async () => {
      const res = await resendVerificationAction({ email: resendEmail });
      if (res.ok) {
        setResendStatus("تم إرسال رابط تفعيل جديد إلى بريدك بنجاح");
      } else {
        setResendStatus(res.error.message);
      }
    });
  };

  if (status === "loading") {
    return (
      <Card accent="amber" className="shadow-lg text-center p-8">
        <CardContent className="space-y-4">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-soft text-amber-ink">
            <span className="size-6 animate-spin rounded-full border-2 border-current border-e-transparent" />
          </div>
          <CardTitle className="text-xl">جارٍ تأكيد بريدك الإلكتروني...</CardTitle>
          <CardDescription>
            نتحقق من صلاحية الرابط ونقوم بإيداع الرصيد الترحيبي في محفظتك.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (status === "success") {
    return (
      <Card accent="split" className="shadow-lg text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-9" />
          </div>
          <CardTitle className="text-2xl">أهلاً بك في ChronoSwap!</CardTitle>
          <CardDescription>
            تم تفعيل حسابك بنجاح وأصبح جاهزاً للاستخدام.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-line bg-raised p-4 text-start">
            <div className="flex items-center gap-2 font-medium text-amber-ink mb-1">
              <Sparkles className="size-5 shrink-0" />
              <span>تمت إضافة الرصيد الترحيبي</span>
            </div>
            <p className="text-sm text-muted">
              حصلت على <strong>ساعتين (120 دقيقة)</strong> في رصيدك المتاح. يمكنك الآن البحث عن المهارات وحجز جلساتك الأولى فوراً!
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <ButtonLink href="/" size="lg" variant="primary" className="w-full">
            <span>انتقل إلى المنصة</span>
            <ArrowRight className="size-4 rotate-180" />
          </ButtonLink>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card accent="amber" className="shadow-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertCircle className="size-7" />
        </div>
        <CardTitle className="text-xl">
          {errorMessage ? "تعذّر تفعيل الحساب" : "تفعيل الحساب"}
        </CardTitle>
        <CardDescription>
          {errorMessage || "يرجى إدخال بريدك الإلكتروني لإرسال رابط تفعيل جديد."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleResend}>
        <CardContent className="space-y-4">
          <Input
            id="resendEmail"
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            placeholder="name@example.com"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            startAdornment={<Mail className="size-4" />}
            required
          />

          {resendStatus && (
            <div className="rounded-lg border border-line bg-raised p-3 text-sm text-amber-ink font-medium">
              {resendStatus}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="w-full"
            loading={isResending}
          >
            إرسال رابط جديد
          </Button>
          <div className="text-center text-sm text-muted">
            العودة إلى{" "}
            <Link href="/login" className="text-amber-ink hover:underline font-medium">
              صفحة تسجيل الدخول
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
