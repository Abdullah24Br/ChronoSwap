"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import {
  loginSchema,
  registerSchema,
  resendSchema,
  verifyEmailSchema,
} from "@/server/auth/schemas";
import {
  loginUser,
  logoutUser,
  registerUser,
  resendVerificationEmail,
  verifyEmailToken,
} from "@/server/services/auth/auth-service";

// FR-1.1: Server Actions for User Registration, Authentication, and Verification.

export const registerAction = defineAction(registerSchema, async (input) => {
  return registerUser(input);
});

export const loginAction = defineAction(loginSchema, async (input) => {
  return loginUser(input);
});

export const verifyEmailAction = defineAction(verifyEmailSchema, async (input) => {
  return verifyEmailToken(input.token);
});

export const resendVerificationAction = defineAction(resendSchema, async (input) => {
  return resendVerificationEmail(input.email);
});

export const logoutAction = defineAction(z.object({}), async () => {
  await logoutUser();
  return { ok: true };
});
