import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";

// The approval queue is the only thing standing between an anonymous
// image link and a page that takes card payments, so this endpoint
// decides what the public sees. Key it properly.

function keyOk(provided: string | null): boolean {
  const expected = process.env.PTW_ADMIN_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  let payload: { key?: string; id?: string; action?: string; reason?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  if (!keyOk(payload.key ?? null)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id, action } = payload;
  if (!id || !["approve", "reject", "remove"].includes(action ?? "")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const patch =
    action === "approve"
      ? { status: "live", live_at: new Date().toISOString(), reject_reason: null }
      : action === "reject"
        ? { status: "rejected", reject_reason: payload.reason ?? null }
        : { status: "removed", reject_reason: payload.reason ?? null };

  const { error } = await db.from("ptw_posts").update(patch).eq("id", id);
  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, action });
}
