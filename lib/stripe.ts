// Zero-dependency Stripe client.
// Their API is form-encoded HTTPS and the webhook signature is an HMAC,
// so there is nothing here that needs the SDK.

import crypto from "node:crypto";

const API = "https://api.stripe.com/v1";

type FormValue = string | number | boolean | null | undefined | FormObject | FormValue[];
interface FormObject { [k: string]: FormValue }

/** Flattens { a: { b: 1 }, c: [{ d: 2 }] } into a[b]=1&c[0][d]=2 */
function flatten(value: FormValue, prefix: string, out: string[]): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, `${prefix}[${k}]`, out);
    return;
  }
  out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
}

function toForm(body: FormObject): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(body)) flatten(v, k, out);
  return out.join("&");
}

async function stripePost<T>(path: string, body: FormObject): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");

  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: toForm(body),
    cache: "no-store",
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export function createCheckoutSession(opts: {
  amountCents: number;
  productName: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId: string;
  metadata: Record<string, string>;
}): Promise<CheckoutSession> {
  return stripePost<CheckoutSession>("/checkout/sessions", {
    mode: "payment",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.clientReferenceId,
    metadata: opts.metadata,
    payment_intent_data: { metadata: opts.metadata },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: opts.amountCents,
          product_data: {
            name: opts.productName,
            description: opts.description,
          },
        },
      },
    ],
  });
}

/**
 * Verifies a Stripe webhook signature over the RAW request body.
 * Parsing and re-serialising the body breaks the signature, so the caller
 * must pass the exact bytes Stripe sent.
 *
 * Stale timestamps are rejected, otherwise a captured request works forever.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!signatureHeader) return false;

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k?.trim() === "t") timestamp = v ?? "";
    if (k?.trim() === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}
