// ──────────────────────────────────────────────────────────────
// IP address classification for the SSRF guard.
//
// Pure: no network, no filesystem, no Node built-ins, so both the browser
// copy of the target rules (./target) and the server-side DNS check
// (./netguard) can share one definition of "internal".
//
// The scanner fetches whatever it is pointed at from inside our own network.
// Anything that is not ordinary public unicast is refused: loopback, RFC 1918,
// carrier-grade NAT, link-local (which includes the cloud metadata service at
// 169.254.169.254), documentation and benchmark ranges, multicast, reserved,
// and the IPv6 equivalents, including IPv6 forms that embed an IPv4 address.
// ──────────────────────────────────────────────────────────────

export type IpClass = "public" | "loopback" | "private";

/** Strict dotted-quad parser. WHATWG URL already normalises 127.1, 0x7f.1 and 2130706433 to this form. */
export function parseIPv4(input: string): number[] | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** Parse an IPv6 address (brackets and zone id tolerated) into eight 16-bit groups. */
export function parseIPv6(input: string): number[] | null {
  let s = input.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(":")) return null;

  // An embedded dotted IPv4 tail (::ffff:1.2.3.4) becomes two groups.
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    const hi = ((v4[0]! << 8) | v4[1]!).toString(16);
    const lo = ((v4[2]! << 8) | v4[3]!).toString(16);
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (chunk: string): number[] | null => {
    if (chunk === "") return [];
    const groups: number[] = [];
    for (const g of chunk.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      groups.push(parseInt(g, 16));
    }
    return groups;
  };
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  if (!head || !rest) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - rest.length;
  if (fill < 1) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...rest];
}

function inV4(ip: number[], base: [number, number, number, number], prefix: number): boolean {
  const toInt = (a: number[]) => ((a[0]! << 24) >>> 0) + (a[1]! << 16) + (a[2]! << 8) + a[3]!;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((toInt(ip) & mask) >>> 0) === ((toInt(base) & mask) >>> 0);
}

// Everything here is refused. Loopback is listed separately so a local
// developer run can opt into it explicitly (never the API route).
const V4_NON_PUBLIC: Array<[[number, number, number, number], number]> = [
  [[0, 0, 0, 0], 8], // "this" network
  [[10, 0, 0, 0], 8], // RFC 1918
  [[100, 64, 0, 0], 10], // carrier-grade NAT
  [[169, 254, 0, 0], 16], // link-local, cloud metadata
  [[172, 16, 0, 0], 12], // RFC 1918
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2, 0], 24], // TEST-NET-1
  [[192, 88, 99, 0], 24], // 6to4 relay anycast
  [[192, 168, 0, 0], 16], // RFC 1918
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // TEST-NET-2
  [[203, 0, 113, 0], 24], // TEST-NET-3
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved, includes broadcast
];

export function classifyIPv4(ip: number[]): IpClass {
  if (inV4(ip, [127, 0, 0, 0], 8)) return "loopback";
  for (const [base, prefix] of V4_NON_PUBLIC) {
    if (inV4(ip, base, prefix)) return "private";
  }
  return "public";
}

export function classifyIPv6(g: number[]): IpClass {
  const allZero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  const embeddedV4 = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];

  if (allZero(0, 7) && g[7] === 1) return "loopback"; // ::1
  if (allZero(0, 8)) return "private"; // ::
  // IPv4-mapped ::ffff:a.b.c.d, and the deprecated IPv4-compatible ::a.b.c.d
  if (allZero(0, 5) && (g[5] === 0xffff || g[5] === 0)) {
    return classifyIPv4(embeddedV4(g[6]!, g[7]!));
  }
  // IPv4-translated ::ffff:0:a.b.c.d (::ffff:0:0/96, RFC 2765). Refused
  // outright: it only has meaning to a translator on the local network.
  if (allZero(0, 4) && g[4] === 0xffff && g[5] === 0) return "private";
  // Local-use NAT64 64:ff9b:1::/48 (RFC 8215): a site's own translator.
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return "private";
  // NAT64 64:ff9b::/96 embeds an IPv4 address in the last 32 bits.
  if (g[0] === 0x64 && g[1] === 0xff9b && allZero(2, 6)) {
    return classifyIPv4(embeddedV4(g[6]!, g[7]!));
  }
  // 6to4 2002::/16 embeds an IPv4 address in bits 16..47.
  if (g[0] === 0x2002) {
    return classifyIPv4(embeddedV4(g[1]!, g[2]!));
  }
  const first = g[0]!;
  if ((first & 0xfe00) === 0xfc00) return "private"; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return "private"; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return "private"; // fec0::/10 site-local
  if ((first & 0xff00) === 0xff00) return "private"; // ff00::/8 multicast
  if (first === 0x2001 && g[1] === 0x0db8) return "private"; // documentation
  if (first === 0x2001 && g[1] === 0) return "private"; // Teredo tunnels to arbitrary IPv4
  if (first === 0x3fff && (g[1]! & 0xf000) === 0) return "private"; // 3fff::/20 documentation
  if (first === 0x2001 && (g[1]! & 0xfff0) === 0x0010) return "private"; // ORCHID 2001:10::/28
  if (first === 0x2001 && (g[1]! & 0xfff0) === 0x0020) return "private"; // ORCHIDv2 2001:20::/28
  if (first === 0x2001 && g[1]! < 0x0200) return "private"; // rest of IETF 2001::/23 special-purpose
  if (first === 0x0100 && allZero(1, 4)) return "private"; // discard-only
  return "public";
}

/**
 * Classify a hostname that may be an IP literal. Returns null when the input
 * is not an IP address at all (an ordinary DNS name).
 */
export function classifyIp(host: string): IpClass | null {
  const v4 = parseIPv4(host);
  if (v4) return classifyIPv4(v4);
  const v6 = parseIPv6(host);
  if (v6) return classifyIPv6(v6);
  return null;
}

/** True when the address may be fetched under the given policy. */
export function isAllowedIp(host: string, allowLoopback = false): boolean {
  const cls = classifyIp(host);
  if (cls === null) return false;
  return cls === "public" || (allowLoopback && cls === "loopback");
}
