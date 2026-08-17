// ──────────────────────────────────────────────────────────────
// Target resolution and validation.
//
// Split out of index.ts so the browser can apply the same rules without
// pulling in the scanner itself — this module touches no network, no
// filesystem, and no environment.
//
// **The server remains authoritative.** Everything here also runs in
// `/api/scan`, which is where the SSRF block actually protects anything: a
// check that only exists in the browser protects nobody, because the browser
// is the attacker's. The client copy exists so a typo is caught before it
// costs the visitor a round trip and a scan credit, not as a security
// boundary.
// ──────────────────────────────────────────────────────────────

export class ScanError extends Error {}

export type Protocol = "https:" | "http:";

/**
 * Hosts we refuse to scan, because the scanner fetches whatever it is given
 * from inside our own network. Loopback, link-local, RFC 1918 ranges, and
 * anything without a dot (a bare hostname resolves against internal DNS).
 */
function isBlockedHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]" ||
    !host.includes(".")
  );
}

/**
 * Resolve and validate a user-supplied target.
 *
 * A bare domain is accepted and assumed to be `defaultProtocol` — most people
 * type `example.com`, and rejecting that in the browser (as `type="url"` did)
 * turned a normal input into an error the server would have accepted anyway.
 *
 * @param input Raw text as typed.
 * @param defaultProtocol Scheme to assume when the input carries none.
 */
export function normalizeTarget(
  input: string,
  defaultProtocol: Protocol = "https:",
): URL {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(
      trimmed.includes("://") ? trimmed : `${defaultProtocol}//${trimmed}`,
    );
  } catch {
    throw new ScanError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ScanError("Only http and https URLs can be scanned.");
  }
  if (isBlockedHost(url.hostname.toLowerCase())) {
    throw new ScanError("For safety, internal and private addresses cannot be scanned.");
  }
  return url;
}

/**
 * Non-throwing form for live feedback while someone is still typing.
 *
 * Returns `null` for empty input rather than an error — a blank field is not
 * yet wrong, and shouting at someone before they have typed anything is a way
 * to make a form feel broken.
 */
export function targetError(input: string, defaultProtocol: Protocol = "https:"): string | null {
  if (!input.trim()) return null;
  try {
    normalizeTarget(input, defaultProtocol);
    return null;
  } catch (err) {
    return err instanceof ScanError ? err.message : "That doesn't look like a valid URL.";
  }
}

/** The scheme written into the input, if any. Used to sync the selector. */
export function protocolFrom(input: string): Protocol | null {
  const match = /^(https?):\/\//i.exec(input.trim());
  if (!match) return null;
  return match[1]!.toLowerCase() === "http" ? "http:" : "https:";
}
