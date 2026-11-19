import { z } from "zod";

// FR-5.2 / Q-34: every accepted session carries a Google Meet link. Shared by the accept form,
// the room's link editor and the server (client checks are hints; the server decides).

export const MEET_URL_EXAMPLE = "https://meet.google.com/abc-defg-hij";

export const MEET_URL_ERROR = `أدخل رابط Google Meet صحيحاً، مثل ${MEET_URL_EXAMPLE}`;

/** Trims and returns the link, or null when it is not an https://meet.google.com/<code> link. */
export function normalizeMeetUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "meet.google.com") return null;
  // Meeting codes look like abc-defg-hij; Workspace nicknames (/lookup/…) also open a meeting.
  if (!/^\/([a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[\w-]+)\/?$/i.test(url.pathname)) return null;
  return url.toString();
}

export const meetUrlSchema = z
  .string({ error: MEET_URL_ERROR })
  .trim()
  .min(1, "رابط Google Meet إلزامي لتأكيد القبول")
  .refine((value) => normalizeMeetUrl(value) !== null, MEET_URL_ERROR);
