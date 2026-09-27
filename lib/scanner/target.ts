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

import { classifyIp } from "./ipguard";

export class ScanError extends Error {}

export type Protocol = "https:" | "http:";

export interface TargetOptions {
  /**
   * Permit loopback targets (localhost, 127.0.0.0/8, ::1). Only for a local
   * developer run of the scanner CLI; the public API route never sets it.
   * Private, link-local and metadata addresses stay blocked regardless.
   */
  allowLoopback?: boolean;
}

/**
 * Hosts we refuse to scan, because the scanner fetches whatever it is given
 * from inside our own network. IP literals are classified by ./ipguard
 * (loopback, RFC 1918, CGNAT, link-local, reserved, IPv6 equivalents). Names
 * are refused when they are internal by convention, or have no dot (a bare
 * hostname resolves against internal DNS). A trailing dot is stripped first:
 * `localhost.` is the same host as `localhost`.
 *
 * This is a static check on the text. The server additionally resolves the
 * name and checks every address it resolves to (./netguard), on every
 * redirect hop, because a public-looking name can point anywhere.
 */
export function isBlockedHost(rawHost: string, opts: TargetOptions = {}): boolean {
  const host = rawHost.toLowerCase().replace(/\.+$/, "");
  const ipClass = classifyIp(host);
  if (ipClass !== null) {
    return !(ipClass === "public" || (opts.allowLoopback && ipClass === "loopback"));
  }
  if (host === "localhost" || host.endsWith(".localhost")) return !opts.allowLoopback;
  return (
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localdomain") ||
    host.endsWith(".home.arpa") ||
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
  opts: TargetOptions = {},
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
  if (isBlockedHost(url.hostname, opts)) {
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
