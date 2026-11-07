// NFR-1: where to go after login. Only same-site paths are allowed, so a crafted
// "/login?next=https://evil.example" link cannot send users to another site (open redirect).
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback; // relative paths and absolute URLs
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback; // protocol-relative URLs
  if (/[\u0000-\u001f]/.test(raw)) return fallback; // control characters (e.g. "/\t/evil")
  return raw;
}
