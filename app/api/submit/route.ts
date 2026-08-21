import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
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

  const sql = db();
  if (!sql) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const voter = await ensureVoter();
  if (!voter) return NextResponse.json({ error: "voter_unavailable" }, { status: 503 });

  try {
    // A cap on pending submissions, or the queue becomes a spam target.
    const waiting = await sql`
      select count(*)::int as n
        from ptw_posts
       where submitter_id = ${voter.id}::uuid and status = 'pending'
    `;
    if (Number(waiting[0]?.n ?? 0) >= 3) {
      return NextResponse.json({ error: "too_many_pending" }, { status: 429 });
    }

    const rows = await sql`
      insert into ptw_posts (kind, title, body, image_url, submitter_id, submitter_handle, status)
      values (
        ${kind}, ${title}, ${body}, ${imageUrl},
        ${voter.id}::uuid, ${cleanHandle(payload.handle)}, 'pending'
      )
      returning id
    `;
    return NextResponse.json({ ok: true, id: rows[0]?.id, status: "pending" });
  } catch {
    return NextResponse.json({ error: "submit_failed" }, { status: 500 });
  }
}
