import type { SessionStatus } from "@/generated/prisma/enums";
import { SESSION_STATUS_META } from "@/lib/session-status";
import { Badge } from "./badge";

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const meta = SESSION_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot pulse={meta.live}>
      {meta.label}
    </Badge>
  );
}
