// ──────────────────────────────────────────────────────────────
// Server-side SSRF guard: resolve before you fetch.
//
// ./target only looks at the text of the URL. A public-looking name can
// resolve to 127.0.0.1 or 169.254.169.254, and a public site can redirect to
// either. So before every request, including every redirect hop, the
// hostname is resolved and every address it resolves to must be public.
//
// Server only: imports node:dns.
// ──────────────────────────────────────────────────────────────

import { lookup } from "node:dns/promises";
import { classifyIp, isAllowedIp } from "./ipguard";
import { isBlockedHost, type TargetOptions } from "./target";

export type Resolver = (hostname: string) => Promise<string[]>;

export interface GuardOptions extends TargetOptions {
  /** Injected in tests. Defaults to the system resolver, all addresses. */
  resolve?: Resolver;
}

export const BLOCKED_MESSAGE =
  "For safety, internal and private addresses cannot be scanned.";

const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

/**
 * Decide whether a URL may be fetched. Returns null when it may, or a reason
 * string when it must not. Never throws.
 *
 * A name that does not resolve is allowed through here: the fetch will fail
 * on its own and the caller reports "could not reach", which is the honest
 * message for a typo.
 */
export async function checkDestination(
  url: URL,
  opts: GuardOptions = {},
): Promise<string | null> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Only http and https URLs can be scanned.";
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (isBlockedHost(host, opts)) return BLOCKED_MESSAGE;

  // IP literal that passed the static check: nothing to resolve.
  if (classifyIp(host) !== null) return null;

  let addresses: string[];
  try {
    addresses = await (opts.resolve ?? systemResolver)(host);
  } catch {
    return null;
  }
  for (const address of addresses) {
    if (!isAllowedIp(address, opts.allowLoopback)) return BLOCKED_MESSAGE;
  }
  return null;
}
