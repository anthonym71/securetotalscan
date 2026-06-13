const TIMEOUT_MS = Number(process.env.SCAN_FETCH_TIMEOUT_MS ?? 8000);
const MAX_BODY_BYTES = 2_500_000; // 2.5 MB cap per resource

const UA =
  "Mozilla/5.0 (compatible; VibeSecurityScanner/1.0; +https://github.com/your-org/vibe-security-scanner)";

export interface FetchedResource {
  ok: boolean;
  status: number;
  url: string; // final URL after redirects
  headers: Record<string, string>;
  body: string;
  error?: string;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/** Fetch a URL with a hard timeout and a body-size cap. Never throws. */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
): Promise<FetchedResource> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        ...(init.headers ?? {}),
      },
    });

    let body = "";
    // Only read text-ish bodies; skip large binaries.
    const contentType = res.headers.get("content-type") ?? "";
    const length = Number(res.headers.get("content-length") ?? 0);
    const readable =
      length <= MAX_BODY_BYTES &&
      /text|json|javascript|xml|html|ecmascript|plain/i.test(contentType);

    if (readable && init.method !== "HEAD") {
      const buf = await res.arrayBuffer();
      body = new TextDecoder().decode(buf.slice(0, MAX_BODY_BYTES));
    }

    return {
      ok: res.ok,
      status: res.status,
      url: res.url || url,
      headers: headersToObject(res.headers),
      body,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      headers: {},
      body: "",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
