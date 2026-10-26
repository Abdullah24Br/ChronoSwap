import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { DomainError } from "./errors";

// Every server action is built with defineAction so its input is always
// validated with zod on the server, and business errors come back as data.
//
//   export const acceptSession = defineAction(z.object({ sessionId: z.uuid() }), async (input) => { … });

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

export function defineAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.infer<S>) => Promise<T>,
): (input: unknown) => Promise<ActionResult<T>> {
  return async (raw) => {
    const parsed = schema.safeParse(raw instanceof FormData ? Object.fromEntries(raw) : raw);
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error);
      return {
        ok: false,
        error: {
          code: "VALIDATION",
          message: "البيانات المدخلة غير صحيحة",
          fieldErrors: fieldErrors as Record<string, string[]>,
        },
      };
    }
    try {
      return { ok: true, data: await handler(parsed.data) };
    } catch (err) {
      unstable_rethrow(err); // let redirect()/notFound() through
      if (err instanceof DomainError) {
        return { ok: false, error: { code: err.code, message: err.message } };
      }
      console.error(err);
      return { ok: false, error: { code: "INTERNAL", message: "حدث خطأ غير متوقع، حاول مرة أخرى" } };
    }
  };
}
