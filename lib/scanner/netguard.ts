// ──────────────────────────────────────────────────────────────
// Server-side SSRF guard: resolve once, check, and connect only to what was
// checked.
//
// ./target only looks at the text of the URL. A public-looking name can
// resolve to 127.0.0.1 or 169.254.169.254, and a public site can redirect to
// either. So before every request, including every redirect hop, the
// hostname is resolved and every address it resolves to must be public.
//
// Checking is not enough on its own: if fetch() resolved the name again, a
// zero-TTL DNS answer could change between the check and the connection (DNS
// rebinding). pinnedDispatcher() closes that gap. The connection's DNS lookup
// is replaced with one that returns only the addresses already checked, and
// checks them again, so the socket can only ever open to a vetted address.
// The hostname itself is untouched, so the Host header and TLS SNI (and
// certificate validation) still use the name the visitor typed.
//
// Server only: imports node:dns, node:net and undici.
// ──────────────────────────────────────────────────────────────

import { lookup } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";
import { isIP } from "node:net";
import { Agent } from "undici";
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

export type Destination =
  | { ok: true; hostname: string; addresses: string[] }
  | { ok: false; reason: string };

function normalizeHost(hostname: string): string {
  let host = hostname.toLowerCase().replace(/\.+$/, "");
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host;
}

/**
 * Resolve a URL's host once and decide whether it may be fetched. Never
 * throws. On success, `addresses` is the complete, checked set that the
 * connection must be pinned to.
 *
 * Fails closed: a lookup error or an empty answer refuses the request. An
 * attacker's DNS could otherwise answer NXDOMAIN to the check and a private
 * address to the connection.
 */
export async function resolveDestination(
  url: URL,
  opts: GuardOptions = {},
): Promise<Destination> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs can be scanned." };
  }
  const host = normalizeHost(url.hostname);
  if (isBlockedHost(host, opts)) return { ok: false, reason: BLOCKED_MESSAGE };

  // IP literal that passed the static check: it is its own answer.
  if (classifyIp(host) !== null) return { ok: true, hostname: host, addresses: [host] };

  let addresses: string[];
  try {
    addresses = await (opts.resolve ?? systemResolver)(host);
  } catch {
    return { ok: false, reason: `Could not resolve ${host}.` };
  }
  if (addresses.length === 0) return { ok: false, reason: `Could not resolve ${host}.` };
  for (const address of addresses) {
    if (!isAllowedIp(address, opts.allowLoopback)) return { ok: false, reason: BLOCKED_MESSAGE };
  }
  return { ok: true, hostname: host, addresses };
}

/** Reason string when the URL must not be fetched, null when it may. */
export async function checkDestination(
  url: URL,
  opts: GuardOptions = {},
): Promise<string | null> {
  const destination = await resolveDestination(url, opts);
  return "reason" in destination ? destination.reason : null;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * A dns.lookup replacement that never touches DNS. It answers only for the
 * host that was checked, only with the addresses that were checked, and
 * re-applies the address policy on every call.
 */
export function pinnedLookup(
  hostname: string,
  addresses: string[],
  allowLoopback = false,
) {
  const expected = normalizeHost(hostname);
  return (host: string, options: LookupOptions | number | undefined, callback: LookupCallback) => {
    const refuse = (message: string) => {
      const err = new Error(message) as NodeJS.ErrnoException;
      err.code = "ESSRFBLOCKED";
      callback(err, "");
    };
    if (normalizeHost(host) !== expected) return refuse(`${host} was not checked.`);
    const raw: unknown = typeof options === "number" ? options : options?.family;
    const family = raw === 4 || raw === "IPv4" ? 4 : raw === 6 || raw === "IPv6" ? 6 : 0;
    const vetted = addresses.filter(
      (address) =>
        isAllowedIp(address, allowLoopback) && (family === 0 || isIP(address) === family),
    );
    if (vetted.length === 0) return refuse(BLOCKED_MESSAGE);
    if (typeof options === "object" && options?.all) {
      return callback(
        null,
        vetted.map((address) => ({ address, family: isIP(address) })),
      );
    }
    callback(null, vetted[0]!, isIP(vetted[0]!));
  };
}

/** An undici dispatcher whose connections can only reach the checked addresses. */
export function pinnedDispatcher(destination: Extract<Destination, { ok: true }>, allowLoopback = false): Agent {
  return new Agent({
    connect: {
      lookup: pinnedLookup(destination.hostname, destination.addresses, allowLoopback),
    },
  });
}
