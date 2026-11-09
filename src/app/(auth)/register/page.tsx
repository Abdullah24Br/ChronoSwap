"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { registerAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Lock, User } from "lucide-react";

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const res = await registerAction({ displayName, email, password });
      if (!res.ok) {
        setFormError(res.error.message);
        if (res.error.fieldErrors) {
          setFieldErrors(res.error.fieldErrors);
        }
      } else {
        // FR-1.1: no session yet; the account is activated from the link in the e-mail.
        setSentTo(res.data.email);
      }
    });
  };

  if (sentTo) {
    return (
      <div className="flex flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-4xl leading-tight md:text-5xl">تحقق من بريدك</h1>
          <p className="text-muted">
            أرسلنا رابط التفعيل إلى <bdi dir="ltr" className="font-medium text-fg">{sentTo}</bdi>. افتح الرسالة واضغط
            على الرابط لتفعيل حسابك، وبعدها تحصل على ساعتيك الترحيبيتين.
          </p>
        </header>
        <p className="text-sm text-muted">
          لم تصلك الرسالة؟ تحقق من مجلد الرسائل غير المرغوب فيها (Spam)، أو{" "}
          <Link href="/login" className="font-medium text-cyan-ink underline-offset-4 hover:underline">
            سجّل الدخول لطلب رابط جديد
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="space-y-2">
        <h1 className="text-4xl leading-tight md:text-5xl">افتح محفظة وقتك</h1>
        <p className="text-muted">حساب واحد تعلّم فيه ما تتقنه، وتتعلّم به ما تريده.</p>
      </header>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
              {formError}
            </div>
          )}

          <Input
            id="displayName"
            label="الاسم الكامل"
            placeholder="مثال: يمان عبد الدايم"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={fieldErrors.displayName?.[0]}
            startAdornment={<User className="size-4" />}
            required
            autoComplete="name"
          />

          <Input
            id="email"
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email?.[0]}
            startAdornment={<Mail className="size-4" />}
            required
            autoComplete="email"
          />

          <Input
            id="password"
            label="كلمة المرور"
            type="password"
            dir="ltr"
            placeholder="8 محارف على الأقل"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password?.[0]}
            startAdornment={<Lock className="size-4" />}
            hint="يجب أن تتكون من 8 أحرف على الأقل"
            required
            autoComplete="new-password"
          />

          <p className="rounded-xl border border-amber/25 bg-amber-soft px-4 py-3 text-sm text-fg">
            تبدأ بساعتين في رصيدك فور إنشاء الحساب، لتحجز بهما جلستك الأولى.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={isPending}
          >
            إنشاء الحساب
          </Button>
          <p className="text-sm text-muted">
            لديك حساب؟{" "}
            <Link href="/login" className="font-medium text-amber-ink underline-offset-4 hover:underline">
              سجّل الدخول
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
