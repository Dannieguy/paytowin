import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/stripe";

// This is the one public route that hands out something valuable, so a
// forgery here is free votes forever.
//
// Raw bytes, because parsing and re-serialising breaks the signature.
// 400 on a failure we want Stripe to retry. 200 on anything we cannot
// act on, because an error makes Stripe redeliver it forever.

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyWebhookSignature(raw, signature, secret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const sql = db();
  if (!sql) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  const obj = event.data?.object ?? {};

  try {
    if (event.type === "checkout.session.completed") {
      if (obj.payment_status !== "paid") {
        return NextResponse.json({ ok: true, ignored: "unpaid_session" });
      }

      const sessionId = String(obj.id ?? "");
      const paymentIntent = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
      const email =
        (obj.customer_details as { email?: string } | undefined)?.email ??
        (obj.customer_email as string | undefined) ??
        null;

      // Only a pending row flips to paid. A redelivered event finds
      // nothing to update and grants nothing, which is the idempotency.
      const rows = await sql`
        update ptw_credit_purchases
           set status = 'paid',
               paid_at = now(),
               stripe_payment_intent_id = ${paymentIntent},
               email = ${email}
         where stripe_session_id = ${sessionId} and status = 'pending'
        returning id, voter_id, credits
      `;

      if (rows.length === 0) {
        return NextResponse.json({ ok: true, ignored: "already_processed_or_unknown" });
      }

      const purchase = rows[0] as { voter_id: string; credits: number };
      await sql`select ptw_grant_credits(${purchase.voter_id}::uuid, ${purchase.credits})`;

      // Email is how a balance survives a cleared cookie, and it is the
      // most durable thing this site produces.
      if (email) {
        await sql`update ptw_voters set email = ${email} where id = ${purchase.voter_id}::uuid`;
      }

      return NextResponse.json({ ok: true, granted: purchase.credits });
    }

    if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      const paymentIntent = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
      if (!paymentIntent) {
        return NextResponse.json({ ok: true, ignored: "no_payment_intent" });
      }

      const status = event.type === "charge.refunded" ? "refunded" : "disputed";
      const rows = await sql`
        update ptw_credit_purchases
           set status = ${status}
         where stripe_payment_intent_id = ${paymentIntent} and status = 'paid'
        returning voter_id, credits
      `;

      if (rows.length === 0) {
        return NextResponse.json({ ok: true, ignored: "nothing_to_reverse" });
      }

      // Best-effort clawback, floored at zero. Credits already spent are
      // gone, and the votes they bought stay on the board; unwinding those
      // would let anyone erase someone else's rank by charging back.
      for (const row of rows as { voter_id: string; credits: number }[]) {
        await sql`
          update ptw_voters
             set credits = greatest(0, credits - ${row.credits})
           where id = ${row.voter_id}::uuid
        `;
      }

      return NextResponse.json({ ok: true, reversed: rows.length });
    }
  } catch {
    // Something on our side failed. Ask Stripe to try again.
    return NextResponse.json({ error: "handler_failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
}
