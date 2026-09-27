import { fetch as undiciFetch, type Dispatcher, type Response } from "undici";
import { pinnedDispatcher, resolveDestination, type GuardOptions } from "./netguard";

const TIMEOUT_MS = Number(process.env.SCAN_FETCH_TIMEOUT_MS ?? 8000);
const MAX_BODY_BYTES = 2_500_000; // 2.5 MB cap per resource
const MAX_REDIRECTS = 5;

const UA =
  "Mozilla/5.0 (compatible; VibeSecurityScanner/1.0; +https://github.com/your-org/vibe-security-scanner)";

export interface FetchedResource {
  ok: boolean;
  status: number;
  url: string; // final URL after redirects
  headers: Record<string, string>;
  body: string;
  error?: string;
  /** True when the SSRF guard refused the URL or one of its redirect hops. */
  blocked?: boolean;
}

/**
 * Read at most `cap` bytes of a body, then stop. A missing or false
 * Content-Length must not let a target stream an unbounded body into memory.
 */
async function readCapped(res: Response, cap: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const take = value.subarray(0, cap - total);
    chunks.push(take);
    total += take.length;
  }
  await reader.cancel().catch(() => undefined);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(buf);
}

function failed(url: string, error: string): FetchedResource {
  return { ok: false, status: 0, url, headers: {}, body: "", error };
}

function headersToObject(headers: Response["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/**
 * Fetch a URL with a hard timeout, a body-size cap and the SSRF guard.
 * Never throws.
 *
 * Redirects are followed here, one hop at a time, rather than by fetch():
 * fetch would follow a public site's redirect to 169.254.169.254 without
 * asking. Every hop, including the first, is resolved once by
 * resolveDestination(), and its connection is pinned to exactly the addresses
 * that were checked (pinnedDispatcher), so a second DNS answer can never be
 * used. A refused hop comes back as status 0 with `blocked: true`.
 */
export async function safeFetch(
  url: string,
  init: Pick<RequestInit, "method" | "headers" | "redirect"> = {},
  guard: GuardOptions = {},
): Promise<FetchedResource> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // The HTTP-posture probe passes "manual": following the redirect would land
  // on the HTTPS site and tell us nothing about whether a redirect happened.
  const follow = (init.redirect ?? "follow") === "follow";
  let current = url;
  const dispatchers: Dispatcher[] = [];
  try {
    let res: Response;
    for (let hop = 0; ; hop += 1) {
      let parsed: URL;
      try {
        parsed = new URL(current);
      } catch {
        return failed(current, "Invalid redirect target.");
      }
      const destination = await resolveDestination(parsed, guard);
      if ("reason" in destination) return { ...failed(current, destination.reason), blocked: true };
      const dispatcher = pinnedDispatcher(destination, guard.allowLoopback);
      dispatchers.push(dispatcher);

      res = await undiciFetch(current, {
        method: init.method,
        redirect: "manual",
        signal: controller.signal,
        dispatcher,
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          ...((init.headers as Record<string, string> | undefined) ?? {}),
        },
      });

      const location = res.headers.get("location");
      if (!follow || res.status < 300 || res.status >= 400 || !location) break;
      if (hop >= MAX_REDIRECTS) return failed(current, "Too many redirects.");
      await res.body?.cancel().catch(() => undefined);
      current = new URL(location, current).toString();
    }

    let body = "";
    // Only read text-ish bodies; skip large binaries.
    const contentType = res.headers.get("content-type") ?? "";
    const length = Number(res.headers.get("content-length") ?? 0);
    const readable =
      length <= MAX_BODY_BYTES &&
      /text|json|javascript|xml|html|ecmascript|plain/i.test(contentType);

    if (readable && init.method !== "HEAD") {
      body = await readCapped(res, MAX_BODY_BYTES);
    } else {
      await res.body?.cancel().catch(() => undefined);
    }

    return {
      ok: res.ok,
      status: res.status,
      url: current,
      headers: headersToObject(res.headers),
      body,
    };
  } catch (err) {
    return failed(current, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
    for (const dispatcher of dispatchers) void dispatcher.destroy().catch(() => undefined);
  }
}
