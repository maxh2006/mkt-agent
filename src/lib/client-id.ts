// Client-safe ID generator.
// crypto.randomUUID() is only available in secure contexts (HTTPS or localhost),
// so it fails on the deployed non-HTTPS site. This fallback works everywhere.
export function generateClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch { /* fall through */ }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
