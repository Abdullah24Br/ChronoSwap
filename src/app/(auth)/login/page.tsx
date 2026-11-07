"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { loginAction, resendVerificationAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeNextPath } from "@/lib/safe-redirect";
import { Lock, Mail, AlertCircle, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [isNotVerified, setIsNotVerified] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsNotVerified(false);
    setResendStatus(null);

    startTransition(async () => {
      const res = await loginAction({ email, password });
      if (!res.ok) {
        setFormError(res.error.message);
        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          setIsNotVerified(true);
        }
      } else {
        // Back to the page that asked for login (e.g. /admin), same-site paths only
        router.push(safeNextPath(new URLSearchParams(window.location.search).get("next")));
        router.refresh();
      }
    });
  };

  const handleResend = () => {
    if (!email) return;
    setResendStatus(null);
    startResendTransition(async () => {
      const res = await resendVerificationAction({ email });
      if (res.ok) {
        setResendStatus("تم إرسال رابط تفعيل جديد إلى بريدك بنجاح");
      } else {
        setResendStatus(res.error.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="space-y-2">
        <h1 className="text-4xl leading-tight md:text-5xl">أهلاً بعودتك</h1>
        <p className="text-muted">سجّل الدخول لتتابع جلساتك ورصيدك.</p>
      </header>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="space-y-4">
          {formError && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
              <div className="flex-1">{formError}</div>
            </div>
          )}

          {isNotVerified && (
            <div className="rounded-xl border border-line bg-raised p-4 space-y-3 text-sm">
              <p className="text-muted">
                لم يتم تفعيل حسابك بعد. يرجى مراجعة بريدك الإلكتروني والنقر على رابط التفعيل، أو طلب رابط جديد:
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                loading={isResending}
                onClick={handleResend}
              >
                إرسال رابط تفعيل جديد
              </Button>
              {resendStatus && (
                <div className="flex items-center gap-1.5 text-xs text-amber-ink font-medium">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{resendStatus}</span>
                </div>
              )}
            </div>
          )}

          <Input
            id="email"
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            startAdornment={<Mail className="size-4" />}
            required
            autoComplete="email"
          />

          <Input
            id="password"
            label="كلمة المرور"
            type="password"
            dir="ltr"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            startAdornment={<Lock className="size-4" />}
            required
            autoComplete="current-password"
          />
        </div>
        <div className="flex flex-col gap-4">
          <Button
            type="submit"
            variant="accent"
            size="lg"
            className="w-full"
            loading={isPending}
          >
            دخول
          </Button>
          <p className="text-sm text-muted">
            ليس لديك حساب؟{" "}
            <Link href="/register" className="font-medium text-cyan-ink underline-offset-4 hover:underline">
              أنشئ حساباً
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
