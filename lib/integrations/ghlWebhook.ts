import { verify } from "node:crypto";
import type { CommercialGrant } from "@/lib/db/commercial";

const GHL_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

export interface InvoicePaidPayload {
  _id?: unknown;
  status?: unknown;
  liveMode?: unknown;
  amountPaid?: unknown;
  currency?: unknown;
  contactDetails?: { id?: unknown; email?: unknown };
  invoiceItems?: Array<{ productId?: unknown }>;
}

interface ProductConfig {
  kind: "subscription" | "purchase";
  tier?: string;
  product?: string;
}

function productMap(): Record<string, ProductConfig> {
  const raw = (process.env.STS_GHL_PRODUCT_MAP ?? "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, ProductConfig>;
  } catch {
    return {};
  }
}

export function verifyGhlSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  try {
    return verify(
      null,
      Buffer.from(rawBody, "utf8"),
      GHL_ED25519_PUBLIC_KEY,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

export function parsePaidInvoice(payload: InvoicePaidPayload): {
  invoiceId: string;
  email: string;
  ghlContactId?: string;
  amountPaid: number;
  currency: string;
  grants: CommercialGrant[];
} | null {
  if (payload.status !== "paid") return null;
  if (typeof payload._id !== "string" || !payload._id) return null;
  const email = typeof payload.contactDetails?.email === "string"
    ? payload.contactDetails.email.trim().toLowerCase()
    : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const amountPaid = Number(payload.amountPaid);
  if (!Number.isFinite(amountPaid) || amountPaid < 0) return null;
  const currency = typeof payload.currency === "string" && payload.currency
    ? payload.currency.toUpperCase()
    : "USD";

  const map = productMap();
  const grants: CommercialGrant[] = [];
  for (const item of payload.invoiceItems ?? []) {
    if (typeof item.productId !== "string") continue;
    const config = map[item.productId];
    if (!config) continue;
    if (config.kind === "subscription" && typeof config.tier === "string" && config.tier) {
      grants.push({ kind: "subscription", tier: config.tier, productId: item.productId });
    } else if (config.kind === "purchase" && typeof config.product === "string" && config.product) {
      grants.push({ kind: "purchase", product: config.product, productId: item.productId });
    }
  }
  if (!grants.length) return null;

  return {
    invoiceId: payload._id,
    email,
    ...(typeof payload.contactDetails?.id === "string" ? { ghlContactId: payload.contactDetails.id } : {}),
    amountPaid: Math.round(amountPaid),
    currency,
    grants,
  };
}
