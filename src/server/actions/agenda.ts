"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";
import {
  generateAndSaveSessionAgenda,
  toggleAgendaTask,
} from "@/server/services/ai/agenda-service";
import {
  generateSessionSummaryAndQuiz,
  submitQuizAttempt,
} from "@/server/services/ai/summary-quiz-service";

// FR-4.3 / FR-4.4: Generate session agenda
export const generateAgendaAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
  }),
  async ({ sessionId }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتوليد الأجندة");
    }

    return generateAndSaveSessionAgenda(sessionId);
  },
);

// FR-5.4 / FR-6.1: Toggle task checklist
export const toggleAgendaTaskAction = defineAction(
  z.object({
    taskId: z.string().uuid("معرف المهمة غير صالح"),
  }),
  async ({ taskId }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتعديل مهام الأجندة");
    }

    return toggleAgendaTask(taskId, user.id);
  },
);

// FR-8.1: Generate AI summary and quiz
export const generateSummaryAndQuizAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
  }),
  async ({ sessionId }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتوليد الملخص والاختبار");
    }

    return generateSessionSummaryAndQuiz(sessionId);
  },
);

// FR-8.3: Submit quiz answers and release escrow
export const submitQuizAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
    answers: z.array(z.number().int().min(0)).min(1),
  }),
  async ({ sessionId, answers }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتقديم الاختبار");
    }

    return submitQuizAttempt({
      sessionId,
      learnerId: user.id,
      answers,
    });
  },
);



