// Read-only readiness checks. Never print credentials, response bodies,
// customer records, product metadata, or full sender addresses.
const expectedLocation = "NszWXYVmSCHchEEh0c9L";
async function get(url, headers) {
  try {
    const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { status: response.status };
    return { status: response.status, body: await response.json() };
  } catch { return { status: "unavailable" }; }
}

if (!process.env.GHL_API_TOKEN || !process.env.GHL_LOCATION_ID) {
  console.log("GHL_PRODUCT_READ: missing configuration");
} else if (process.env.GHL_LOCATION_ID.trim() !== expectedLocation) {
  console.log("GHL_PRODUCT_READ: configured location differs from SecureTotalScan; no request made");
} else {
  const url = new URL("https://services.leadconnectorhq.com/products/");
  url.searchParams.set("locationId", expectedLocation);
  url.searchParams.set("limit", "100");
  const result = await get(url, { Authorization: `Bearer ${process.env.GHL_API_TOKEN}`, Version: "v3" });
  console.log(`GHL_PRODUCT_READ: HTTP ${result.status}`);
  if (Array.isArray(result.body?.products)) console.log(`GHL_PRODUCT_COUNT_FIRST_PAGE: ${result.body.products.length}`);
}

const sender = process.env.REPORT_FROM_EMAIL ?? "";
const domain = /@([^>\s]+)>?$/.exec(sender.trim())?.[1]?.toLowerCase();
if (!process.env.RESEND_API_KEY || !domain) {
  console.log("REPORT_SENDER: missing configuration");
} else {
  console.log(`REPORT_SENDER_EXPECTED_SUBDOMAIN: ${domain === "send.securetotalscan.com"}`);
  const result = await get("https://api.resend.com/domains?limit=100", { Authorization: `Bearer ${process.env.RESEND_API_KEY}` });
  console.log(`RESEND_DOMAIN_READ: HTTP ${result.status}`);
  if (Array.isArray(result.body?.data)) {
    const match = result.body.data.find(item => item.name?.toLowerCase() === domain);
    console.log(`REPORT_SENDER_VERIFIED: ${match ? match.status === "verified" : "not found on first page"}`);
    console.log(`RESEND_MORE_PAGES: ${Boolean(result.body.has_more)}`);
  }
}
