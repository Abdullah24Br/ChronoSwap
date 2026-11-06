import type { PrismaClient } from "@/generated/prisma/client";
import { RATING_MAX_STARS, RATING_MIN_STARS } from "@/lib/rules";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";

// ─────────────────────────────────────────────────────────────
// FR-6.2: Teacher Rating (1-5 stars + review)
// ─────────────────────────────────────────────────────────────

/** Statuses that allow rating (session must be post-session). */
const RATABLE_STATUSES = [
  "ENDED",
  "QUIZ_PENDING",
  "RELEASED",
  "RESOLVED_REFUNDED",
  "RESOLVED_RELEASED",
  "BARTER_COMPLETED",
  "BARTER_SETTLED",
] as const;

export interface RateTeacherInput {
  sessionId: string;
  raterId: string;
  stars: number;
  review?: string;
}

/**
 * FR-6.2: The learner rates the teacher once per session (1-5 stars + optional review).
 * Updates the teacher's denormalised ratingCount & ratingSum atomically.
 */
export async function rateTeacher(
  input: RateTeacherInput,
  client: PrismaClient = db,
) {
  const { sessionId, raterId, stars, review } = input;

  // Validate star range
  if (!Number.isInteger(stars) || stars < RATING_MIN_STARS || stars > RATING_MAX_STARS) {
    throw new DomainError(
      "INVALID_RATING",
      `التقييم يجب أن يكون عدد صحيح بين ${RATING_MIN_STARS} و ${RATING_MAX_STARS}`,
    );
  }

  return client.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: { rating: true },
    });

    if (!session) {
      throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
    }

    // Only the learner can rate the teacher
    if (session.learnerId !== raterId) {
      throw new DomainError(
        "FORBIDDEN",
        "فقط المتعلم يمكنه تقييم المدرّس",
      );
    }

    // Check session is in a ratable status
    if (!RATABLE_STATUSES.includes(session.status as (typeof RATABLE_STATUSES)[number])) {
      throw new DomainError(
        "INVALID_STATUS",
        "لا يمكن تقييم المدرّس لأن الجلسة لم تنتهِ بعد",
      );
    }

    // Prevent duplicate rating
    if (session.rating) {
      throw new DomainError(
        "DUPLICATE_RATING",
        "تم تقييم المدرّس مسبقاً لهذه الجلسة",
      );
    }

    // Create the rating
    const rating = await tx.rating.create({
      data: {
        sessionId,
        raterId,
        rateeId: session.teacherId,
        stars,
        review: review?.trim() || null,
      },
    });

    // Update teacher's denormalised aggregates atomically
    await tx.user.update({
      where: { id: session.teacherId },
      data: {
        ratingCount: { increment: 1 },
        ratingSum: { increment: stars },
      },
    });

    return rating;
  });
}

