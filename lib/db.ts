import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type Sql = NeonQueryFunction<false, false>;

/**
 * Neon over HTTP. No connection pool to exhaust, which is what you want on
 * serverless. Returns null when DATABASE_URL is unset so a fresh checkout
 * renders an empty board instead of a 500.
 */
export function db(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}
