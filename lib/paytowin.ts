// PayToWin.lol - domain rules.
// The decay constants here MUST match ptw_paid_half_life(),
// ptw_free_half_life() and ptw_grace_hours() in
// db/schema.sql. Postgres ranks the board; these
// mirrors exist so the UI can quote a "take #1" price and show a
// live countdown without a round trip.

import crypto from "node:crypto";

export const SITE_NAME = "PayToWin.lol";
export const TAGLINE = "The best shitpost money can buy.";

export const PAID_HALF_LIFE_HOURS = 24;
export const FREE_HALF_LIFE_HOURS = 48;
export const GRACE_HOURS = 1;
export const VOTE_CENTS = 100;

/** One $1 charge loses a third of itself to Stripe. Nobody buys one vote. */
export interface Bundle {
  id: string;
  credits: number;
  cents: number;
  label: string;
  blurb: string;
}

export const BUNDLES: Bundle[] = [
  { id: "starter", credits: 5, cents: 500, label: "5 votes", blurb: "Dip a toe in." },
  { id: "serious", credits: 25, cents: 2000, label: "25 votes", blurb: "5 free. You're invested now." },
  { id: "unwell", credits: 70, cents: 5000, label: "70 votes", blurb: "20 free. Seek help." },
];

export function bundleById(id: string): Bundle | undefined {
  return BUNDLES.find((b) => b.id === id);
}

/** value * 0.5 ^ ( max(0, hours - grace) / half_life ) */
export function decayedValue(
  value: number,
  at: Date | string,
  halfLifeHours: number,
  now: Date = new Date(),
): number {
  const t = typeof at === "string" ? new Date(at) : at;
  const hours = (now.getTime() - t.getTime()) / 3_600_000;
  return value * Math.pow(0.5, Math.max(0, hours - GRACE_HOURS) / halfLifeHours);
}

/**
 * How many votes it takes to seize #1 right now.
 * The highest-converting number on the page, so it goes in the button.
 */
export function votesToTakeFirst(topScoreCents: number, yourScoreCents = 0): number {
  const gap = topScoreCents - yourScoreCents;
  if (gap <= 0) return 1;
  return Math.max(1, Math.ceil(gap / VOTE_CENTS) + 1);
}

export function formatMoney(cents: number, opts: { cents?: boolean } = {}): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ── Voter identity ─────────────────────────────────────────────────
// A signed cookie, not an account. Nobody makes a login to spend a
// dollar. The signature stops someone handing themselves another
// person's credit balance by editing the cookie.

export const VOTER_COOKIE = "ptw_voter";
export const VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function cookieSecret(): string {
  const s = process.env.PTW_COOKIE_SECRET;
  if (!s) throw new Error("PTW_COOKIE_SECRET is not set");
  return s;
}

export function signVoterId(id: string): string {
  const sig = crypto.createHmac("sha256", cookieSecret()).update(id).digest("base64url");
  return `${id}.${sig}`;
}

export function verifyVoterCookie(value: string | undefined): string | null {
  if (!value) return null;
  const idx = value.lastIndexOf(".");
  if (idx <= 0) return null;

  const id = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;

  const expected = crypto.createHmac("sha256", cookieSecret()).update(id).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? id : null;
}

// ── Submissions ────────────────────────────────────────────────────

/**
 * Images are accepted as URLs on a small allowlist rather than as
 * uploads. Hosting arbitrary binaries from anonymous users is the one
 * part of this build that can cause real harm, and not accepting them
 * removes the whole class of problem. Everything still goes through
 * the approval queue on top of this.
 */
export const IMAGE_HOSTS = [
  "i.imgur.com",
  "i.redd.it",
  "pbs.twimg.com",
  "media.tenor.com",
  "i.ibb.co",
];

export function validateImageUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    if (!IMAGE_HOSTS.includes(u.hostname.toLowerCase())) return null;
    if (!/\.(png|jpe?g|gif|webp)$/i.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function cleanHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^@/, "").slice(0, 20);
  return /^[A-Za-z0-9_]{1,20}$/.test(h) ? h : null;
}

// ── Board rows, shaped by the ptw_board view ───────────────────────
export interface BoardRow {
  id: string;
  kind: "image" | "text";
  title: string;
  body: string | null;
  image_url: string | null;
  submitter_handle: string | null;
  live_at: string | null;
  created_at: string;
  peak_paid_score: string | number;
  peak_at: string | null;
  views: number;
  paid_score: string | number;
  free_score: string | number;
  paid_votes: number;
  free_votes: number;
  total_cents: string | number;
  last_vote_at: string | null;
  paid_rank: number;
  free_rank: number;
}

/** Supabase returns numeric columns as strings. Everything downstream wants numbers. */
export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

export type BoardTab = "top" | "good" | "new" | "fame";

export const TABS: { id: BoardTab; label: string; blurb: string }[] = [
  { id: "top", label: "Top", blurb: "Ranked by money. Purest form of the internet." },
  { id: "good", label: "Actually Good", blurb: "Ranked by free votes. What people genuinely liked." },
  { id: "new", label: "New", blurb: "Fresh out of the approval queue." },
  { id: "fame", label: "Hall of Fame", blurb: "Highest score ever reached. This one never decays." },
];
