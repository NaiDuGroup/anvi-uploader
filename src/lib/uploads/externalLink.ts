/**
 * «Внешняя ссылка» on the walk-in uploader: the pasted text must be an
 * http(s) link. A bare domain (`drive.google.com/…`, `wetransfer.com/x`)
 * gets `https://`. Returns the link to store, or null when it is not one
 * (e.g. «abc», `ftp://…`, `javascript:…`). Pure (client-safe).
 */
export function normalizeExternalLink(raw: string): string | null {
  const text = raw.trim();
  if (!text || /\s/.test(text) || text.length > 2000) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  // `localhost:3000` / `host:port/...` parse as a scheme — treat as no scheme unless it is http(s).
  const candidate = hasScheme && !/^[a-z0-9.-]+:\d+(\/|$)/i.test(text) ? text : `https://${text.replace(/^\/+/, "")}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname;
  // A real domain: labels with a dot and a letter TLD (e.g. drive.google.com), or an IPv4 address.
  // (URL gives the host in punycode, so an IDN TLD looks like `xn--…`.)
  const isDomain = /^([a-z0-9-]+\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(host);
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (!isDomain && !isIpv4) return null;
  return hasScheme ? text : candidate;
}
