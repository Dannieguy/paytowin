# PayToWin.lol

A continuous pay-to-rank shitpost board. One dollar pushes a post up. The money
goes to the house, not to a prize pot. That is the entire product, and saying so
plainly is the joke.

Setup and launch steps are in [LAUNCH.md](LAUNCH.md).

## How the ranking works

There are no rounds. Every vote decays on its own clock:

```
value = amount × 0.5 ^ ( max(0, hours_elapsed − 1) / half_life )
```

Paid votes use a **24-hour half-life**, free votes **48 hours**, and the first
hour runs at full strength so nobody watches their money evaporate during the
checkout redirect.

Decaying each payment independently is the whole design. A top-up adds fresh
money rather than refreshing old money, so there is no way to hold #1 forever off
one big early bid plus pocket change.

The half-life is also the price of #1: the top settles at roughly
`daily spend × half-life`. Shorten it and #1 stays beatable on impulse. Lengthen
it and the leader ossifies and newcomers stop bothering. It is the single most
important number here, and it lives in `ptw_paid_half_life()` in the schema.

## Two boards

| Board | Ranked by | Purpose |
|---|---|---|
| **Top** | money | the spectacle |
| **Actually Good** | free votes | keeps the front page genuinely funny |
| **New** | recency | fresh posts get seen without paying |
| **Hall of Fame** | peak score, never decays | the permanent record |

Every row carries both ranks, so a post can sit at #1 on Top and #63 on Actually
Good. That gap is surfaced as a `bought N spots` badge, and it is the thing
people screenshot.

Splitting the two also solves the death spiral a paid-only board walks into: if
money alone ranks everything, the front page fills with mediocre posts backed by
cash, the content stops being worth visiting, and the traffic that made rank
valuable disappears.

## Deliberate omissions

- **No accounts.** Identity is a signed cookie. Nobody creates a login to spend a
  dollar. Email captured at checkout is the only balance recovery.
- **No uploads.** Image links from a host allowlist only. Hosting arbitrary
  binaries from anonymous users, on a site that takes card payments, is the one
  thing here that could cause real harm.
- **No auto-moderation.** Everything lands in a queue and a human approves it.
- **No prize.** Nobody pays for a chance at money, so no state gambling law comes
  near it and Stripe has nothing to underwrite beyond paid placement.

## Stack

Next.js 16 (App Router), Neon Postgres over HTTP, Stripe via a zero-dependency
form-encoded client with HMAC webhook verification. Postgres does all the
ranking; `lib/paytowin.ts` mirrors the decay constants so the UI can quote a
price without a round trip. **Those two must stay in sync.**
