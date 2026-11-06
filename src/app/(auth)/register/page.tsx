"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registerAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mail, Lock, User } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
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
        // Direct login & redirect to dashboard / home
        router.push("/");
        router.refresh();
      }
    });
  };

  return (
    <Card accent="amber" className="shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">إنشاء حساب جديد</CardTitle>
        <CardDescription>
          انضم إلى ChronoSwap وابدأ بتبادل المعرفة بنظام بنك الوقت
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
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

          <div className="rounded-lg border border-line bg-raised/50 p-3 text-xs text-muted">
            <span className="font-semibold text-fg">هدية انضمام:</span> ستحصل على ساعتين رصيد ترحيبي مجاني فور تأكيد بريدك الإلكتروني.
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={isPending}
          >
            إنشاء الحساب
          </Button>
          <div className="text-center text-sm text-muted">
            لديك حساب مسبقاً؟{" "}
            <Link href="/login" className="text-amber-ink hover:underline font-medium">
              تسجيل الدخول
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
