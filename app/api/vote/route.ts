import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
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

  const voter = await ensureVoter();
  if (!voter) {
    return NextResponse.json({ error: "voter_unavailable" }, { status: 503 });
  }

  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  if (kind === "free") {
    const { data, error } = await db.rpc("ptw_cast_free_vote", {
      p_voter: voter.id,
      p_post: postId,
    });
    if (error) return rpcError(error.message);
    // false means they had already free-voted here. Not an error, just a no-op.
    return NextResponse.json({ ok: true, counted: data === true, credits: voter.credits });
  }

  const { data, error } = await db.rpc("ptw_cast_paid_vote", {
    p_voter: voter.id,
    p_post: postId,
  });
  if (error) return rpcError(error.message);

  return NextResponse.json({ ok: true, counted: true, credits: data as number });
}

function rpcError(message: string) {
  if (message.includes("no_credits")) {
    return NextResponse.json({ error: "no_credits" }, { status: 402 });
  }
  if (message.includes("post_not_live")) {
    return NextResponse.json({ error: "post_not_live" }, { status: 404 });
  }
  return NextResponse.json({ error: "vote_failed" }, { status: 500 });
}
