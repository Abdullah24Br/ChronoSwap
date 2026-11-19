import { NO_SHOW_GRACE_MINUTES } from "./rules";

/**
 * Q-8 / FR-4.6: whether a room entry at `at` counts as attendance for a session starting at
 * `startAt` (from 15 minutes before the start until 15 minutes after). Entries outside the window
 * are still logged, but they are visits, not attendance. Shared by the server and the admin view.
 */
export function isInAttendanceWindow(startAt: Date | string, at: Date | string): boolean {
  const graceMs = NO_SHOW_GRACE_MINUTES * 60 * 1000;
  const start = new Date(startAt).getTime();
  const time = new Date(at).getTime();
  return time >= start - graceMs && time <= start + graceMs;
}

/**
 * Q-8 (changed): the room of an accepted session opens 15 minutes before the start, the same moment
 * attendance starts to count. Before that the participants see a waiting page.
 */
export function roomOpensAt(startAt: Date | string): Date {
  return new Date(new Date(startAt).getTime() - NO_SHOW_GRACE_MINUTES * 60 * 1000);
}

export function isRoomOpen(startAt: Date | string, now: Date = new Date()): boolean {
  return now.getTime() >= roomOpensAt(startAt).getTime();
}
