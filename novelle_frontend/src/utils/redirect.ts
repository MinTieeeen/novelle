/**
 * The `redirect` query param of /login, kept only when it is a path inside the app ("/library?tab=x").
 * "//evil.com", "https://…", "/\evil" and anything not starting with one "/" fall back to "/".
 */
export function safeRedirect(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if ([...value].some((c) => c.charCodeAt(0) < 0x20)) return fallback; // tab/newline tricks
  if (value.startsWith('/login') || value.startsWith('/register')) return fallback;
  return value;
}
