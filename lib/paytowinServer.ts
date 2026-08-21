// Server-side voter identity for PayToWin.
//
// Reading the cookie works anywhere. Creating a voter writes a cookie,
// which Next only allows in Route Handlers and Server Actions, so pages
// read and API routes create. A visitor who has never voted simply has
// no voter row yet, which is the correct state for someone who is only
// looking.

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  VOTER_COOKIE,
  VOTER_COOKIE_MAX_AGE,
  signVoterId,
  verifyVoterCookie,
} from "@/lib/paytowin";

export interface Voter {
  id: string;
  credits: number;
  email: string | null;
  is_admin: boolean;
}

/** Read-only. Safe in Server Components. Returns null for a first-time visitor. */
export async function getVoter(): Promise<Voter | null> {
  const jar = await cookies();
  const id = verifyVoterCookie(jar.get(VOTER_COOKIE)?.value);
  if (!id) return null;

  const sql = db();
  if (!sql) return null;

  try {
    const rows = await sql`
      select id, credits, email, is_admin
        from ptw_voters
       where id = ${id}::uuid
    `;
    return (rows[0] as Voter) ?? null;
  } catch {
    return null;
  }
}

/**
 * Route Handlers and Server Actions only: creates the voter and sets the cookie.
 * Returns null rather than throwing, so a database that is missing or down
 * produces a real error response instead of a bare 500 with no body.
 */
export async function ensureVoter(): Promise<Voter | null> {
  const existing = await getVoter();
  if (existing) return existing;

  const sql = db();
  if (!sql) return null;

  let voter: Voter;
  try {
    const rows = await sql`
      insert into ptw_voters default values
      returning id, credits, email, is_admin
    `;
    if (!rows[0]) return null;
    voter = rows[0] as Voter;
  } catch {
    return null;
  }

  const jar = await cookies();
  jar.set(VOTER_COOKIE, signVoterId(voter.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VOTER_COOKIE_MAX_AGE,
  });

  return voter;
}

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
