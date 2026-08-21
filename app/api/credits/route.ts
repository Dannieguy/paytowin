import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ensureVoter, siteUrl } from "@/lib/paytowinServer";
import { bundleById, SITE_NAME } from "@/lib/paytowin";
import { createCheckoutSession } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  let payload: { bundleId?: string; returnTo?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const bundle = bundleById(payload.bundleId ?? "");
  if (!bundle) {
    return NextResponse.json({ error: "unknown_bundle" }, { status: 400 });
  }

  const sql = db();
  if (!sql) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const voter = await ensureVoter();
  if (!voter) return NextResponse.json({ error: "voter_unavailable" }, { status: 503 });

  const base = siteUrl();

  // Only ever return to a path on our own origin. Taking a full URL from
  // the client here would turn checkout into an open redirect.
  const returnPath =
    payload.returnTo && payload.returnTo.startsWith("/") && !payload.returnTo.startsWith("//")
      ? payload.returnTo
      : "/";

  let session;
  try {
    session = await createCheckoutSession({
      amountCents: bundle.cents,
      productName: `${bundle.credits} votes`,
      description: `${SITE_NAME} - ${bundle.credits} paid votes. Non-refundable. Votes decay.`,
      successUrl: `${base}${returnPath}${returnPath.includes("?") ? "&" : "?"}paid=1`,
      cancelUrl: `${base}${returnPath}`,
      clientReferenceId: voter.id,
      metadata: {
        voter_id: voter.id,
        bundle_id: bundle.id,
        credits: String(bundle.credits),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "checkout_failed";
    return NextResponse.json({ error: "checkout_failed", detail: message }, { status: 502 });
  }

  try {
    await sql`
      insert into ptw_credit_purchases (voter_id, credits, amount_cents, stripe_session_id, status)
      values (${voter.id}::uuid, ${bundle.credits}, ${bundle.cents}, ${session.id}, 'pending')
    `;
  } catch {
    return NextResponse.json({ error: "purchase_record_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: session.url });
}
