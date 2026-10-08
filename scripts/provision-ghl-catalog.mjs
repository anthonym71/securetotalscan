const BASE = "https://services.leadconnectorhq.com";
const token = process.env.GHL_API_TOKEN?.trim();
const locationId = process.env.GHL_LOCATION_ID?.trim();
if (!token || !locationId) {
  console.error("GHL_API_TOKEN and GHL_LOCATION_ID are required");
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Version: "2021-07-28",
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path}: ${res.status} ${text.slice(0, 500)}`);
  return body;
}

const specs = [
  {
    key: "report",
    name: "Secure Total Scan — Report",
    description: "One-time full surface-security report with fix prompts, PDF and one priority re-scan.",
    type: "one_time",
    amount: 9,
  },
  {
    key: "pro",
    name: "Secure Total Scan — Pro",
    description: "10 deep scans per month with repo, Docker and log analysis, saved reports, fix prompts and monitoring.",
    type: "recurring",
    amount: 49,
    recurring: { interval: "month", intervalCount: 1 },
  },
  {
    key: "business",
    name: "Secure Total Scan — Business",
    description: "100 deep scans per month, up to five team seats, compliance reports and priority monitoring.",
    type: "recurring",
    amount: 99,
    recurring: { interval: "month", intervalCount: 1 },
  },
];

async function listProducts(search) {
  const qs = new URLSearchParams({ locationId, limit: "100", offset: "0", search });
  const body = await api(`/products/?${qs}`);
  return body.products || body.data || [];
}

async function ensureProduct(spec) {
  const existing = (await listProducts(spec.name)).find((p) => p.name === spec.name);
  let product = existing;
  if (!product) {
    product = await api("/products/", {
      method: "POST",
      body: JSON.stringify({
        name: spec.name,
        locationId,
        description: spec.description,
        productType: "DIGITAL",
        statementDescriptor: "SECURETOTALSCAN",
        availableInStore: true,
      }),
    });
  }
  const productId = product._id || product.id;
  if (!productId) throw new Error(`No product id for ${spec.name}`);

  const priceHeaders = { Version: "v3" };
  const qs = new URLSearchParams({ locationId, limit: "100", offset: "0" });
  const listed = await api(`/products/${productId}/price?${qs}`, { headers: priceHeaders });
  const prices = listed.prices || listed.data || [];
  const exact = prices.find((p) =>
    p.name === spec.name &&
    p.type === spec.type &&
    Number(p.amount) === spec.amount &&
    String(p.currency).toUpperCase() === "USD"
  );
  let price = exact;
  if (!price) {
    price = await api(`/products/${productId}/price`, {
      method: "POST",
      headers: priceHeaders,
      body: JSON.stringify({
        name: spec.name,
        type: spec.type,
        currency: "USD",
        amount: spec.amount,
        locationId,
        isDigitalProduct: true,
        ...(spec.recurring ? { recurring: spec.recurring } : {}),
      }),
    });
  }
  return { key: spec.key, productId, priceId: price._id || price.id, name: spec.name };
}

const results = [];
for (const spec of specs) results.push(await ensureProduct(spec));

const productMap = {};
for (const item of results) {
  productMap[item.productId] =
    item.key === "report"
      ? { kind: "purchase", product: "report" }
      : { kind: "subscription", tier: item.key };
}

console.log("CATALOG_RESULT=" + JSON.stringify(results));
console.log("PRODUCT_MAP=" + JSON.stringify(productMap));
