import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureVoter } from "@/lib/paytowinServer";
import { validateImageUrl, cleanHandle } from "@/lib/paytowin";

// Everything lands in 'pending'. Nothing reaches the board until it is
// approved. This is the whole moderation strategy and it is deliberately
// boring, because the alternative is discovering what strangers upload
// to a site that takes card payments.

export async function POST(request: NextRequest) {
  let payload: {
    kind?: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    handle?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const kind = payload.kind === "text" ? "text" : "image";
  const title = (payload.title ?? "").trim();
  const body = (payload.body ?? "").trim() || null;

  if (title.length < 1 || title.length > 140) {
    return NextResponse.json({ error: "bad_title" }, { status: 400 });
  }
  if (body && body.length > 500) {
    return NextResponse.json({ error: "body_too_long" }, { status: 400 });
  }

  let imageUrl: string | null = null;
  if (kind === "image") {
    imageUrl = validateImageUrl(payload.imageUrl ?? "");
    if (!imageUrl) {
      return NextResponse.json({ error: "bad_image_url" }, { status: 400 });
    }
  }

  const voter = await ensureVoter();
  if (!voter) {
    return NextResponse.json({ error: "voter_unavailable" }, { status: 503 });
  }

  const db = supabaseAdmin();

  // One pending submission at a time, or the queue becomes a spam target.
  const { count } = await db
    .from("ptw_posts")
    .select("id", { count: "exact", head: true })
    .eq("submitter_id", voter.id)
    .eq("status", "pending");

  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: "too_many_pending" }, { status: 429 });
  }

  const { data, error } = await db
    .from("ptw_posts")
    .insert({
      kind,
      title,
      body,
      image_url: imageUrl,
      submitter_id: voter.id,
      submitter_handle: cleanHandle(payload.handle),
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "submit_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, status: "pending" });
}
