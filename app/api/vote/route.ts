import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ensureVoter } from "@/lib/paytowinServer";

export async function POST(request: NextRequest) {
  let payload: { postId?: string; kind?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { postId, kind } = payload;
  if (!postId || (kind !== "free" && kind !== "paid")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const sql = db();
  if (!sql) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const voter = await ensureVoter();
  if (!voter) return NextResponse.json({ error: "voter_unavailable" }, { status: 503 });

  try {
    if (kind === "free") {
      const rows = await sql`
        select ptw_cast_free_vote(${voter.id}::uuid, ${postId}::uuid) as counted
      `;
      // false means they had already free-voted here. Not an error, just a no-op.
      return NextResponse.json({
        ok: true,
        counted: rows[0]?.counted === true,
        credits: voter.credits,
      });
    }

    const rows = await sql`
      select ptw_cast_paid_vote(${voter.id}::uuid, ${postId}::uuid) as credits
    `;
    return NextResponse.json({
      ok: true,
      counted: true,
      credits: Number(rows[0]?.credits ?? 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("no_credits")) {
      return NextResponse.json({ error: "no_credits" }, { status: 402 });
    }
    if (message.includes("post_not_live")) {
      return NextResponse.json({ error: "post_not_live" }, { status: 404 });
    }
    if (message.includes("invalid input syntax")) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    return NextResponse.json({ error: "vote_failed" }, { status: 500 });
  }
}
