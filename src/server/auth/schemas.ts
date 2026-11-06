import { z } from "zod";
import { passwordSchema } from "./password";
import { emailSchema } from "./tokens";

// Validation schemas for authentication (FR-1.1)

export const registerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "الاسم يجب أن يكون حرفين على الأقل")
    .max(80, "الاسم يجب ألا يتجاوز 80 حرفاً"),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "يرجى إدخال كلمة المرور"),
});

export const resendSchema = z.object({
  email: emailSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "رمز التفعيل مطلوب"),
});

