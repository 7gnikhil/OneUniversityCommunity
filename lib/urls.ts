// URL normalisation for user-pasted links (portfolio links today).
//
// Students paste links in every shape — "github.com/me", "www.x.com",
// "https://x.com" — and a bare domain renders as a RELATIVE href that
// goes nowhere. Rule: a non-empty link that doesn't already carry a
// scheme gets https:// by default. http:// is left alone when the user
// typed it deliberately; protocol-relative "//x.com" gains "https:".
//
// Pure module: safe to import from client and server code.

export function normaliseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}
