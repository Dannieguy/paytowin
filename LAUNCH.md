# PayToWin.lol — launch checklist

Standalone project. Nothing is shared with any other site: its own repo, its own
Vercel project, its own Supabase project, its own Stripe keys.

Code is done, typechecked, linted, and the production build passes.

---

## 1. Its own Supabase project (3 min)

Create a **new** Supabase project. Do not reuse an existing one.

SQL Editor → New Query → paste all of `supabase/schema.sql` → Run.

Verify with `select * from ptw_board;` — zero rows, no error.

Copy the project URL and the **service role** key into `.env.local`.

---

## 2. Stripe (10 min)

1. Secret key (`sk_live_…`) from Developers → API keys.
2. Developers → Webhooks → Add endpoint:
   - URL: `https://paytowin.lol/api/webhook`
   - Events: `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`
3. Copy the signing secret (`whsec_…`) off that endpoint.

Describe the business as paid content promotion. There is no prize and no chance
element here, which is what keeps this straightforward — keep the account
description matching that.

---

## 3. Domain (5 min)

`paytowin.lol` — Porkbun or Namecheap, roughly $5–30/yr.

Fallbacks if taken: `paytowin.gg`, `paytowin.fun`, `paidtowin.lol`.

---

## 4. Environment variables

`.env.local` already has `PTW_COOKIE_SECRET` and `PTW_ADMIN_KEY` generated. Fill
in the rest, then add all seven to Vercel → Settings → Environment Variables.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
| `STRIPE_SECRET_KEY` | from step 2 |
| `STRIPE_WEBHOOK_SECRET` | from step 2 |
| `PTW_COOKIE_SECRET` | already in `.env.local` |
| `PTW_ADMIN_KEY` | already in `.env.local` |
| `NEXT_PUBLIC_SITE_URL` | `https://paytowin.lol` |

`NEXT_PUBLIC_SITE_URL` builds the Stripe return URLs. Wrong value means people
pay and land nowhere.

---

## 5. Deploy

From this folder, as a **new** Vercel project:

```bash
vercel --prod
```

Then add `paytowin.lol` in Vercel → Domains and set the DNS at the registrar.

---

## 6. Seed the board before you tell anyone

**This is the step that decides whether the launch works.** Everything above is
plumbing.

An empty board is worth nothing to the first visitor, so nobody shares it and
nobody pays. Get **30 to 50 genuinely funny posts** on there first, submitted by
you and approved by you.

Submit on the front page. Approve at:

```
https://paytowin.lol/admin?key=YOUR_PTW_ADMIN_KEY
```

Images are direct https links only, from imgur, redd.it, pbs.twimg.com, tenor or
ibb. No uploads, by design.

Cast some free votes across them so "Actually Good" is not a flat list of zeros
on day one.

---

## 7. Test the money path with real money

Buy the $5 bundle yourself on the live site. Confirm:

- Checkout opens and completes
- Balance shows 5 votes when you land back
- A `$1 ↑` vote moves a post and decrements the balance
- `select * from ptw_credit_purchases;` shows `status = 'paid'`

If credits do not arrive it is the webhook, every time. Stripe → Webhooks → the
endpoint → Recent deliveries shows the response body.

---

## Brand assets

`public/avatar-button.png` is the profile pic and favicon. The other two are
alternates. All 1024×1024, all checked circle-cropped at 48px and 32px.

---

## What is deliberately not built

- **No accounts.** Identity is a signed cookie. Clearing cookies loses the
  balance; the email captured at checkout is the only recovery, and it is manual.
- **No uploads.** Image links from an allowlist only. This removes the entire
  category of problem that would otherwise be the biggest risk here.
- **No auto-moderation.** You approve everything by hand. At this volume that is
  correct and it is what keeps the site defensible.

## The one tuning knob

`ptw_paid_half_life()` in the schema, currently **24 hours**. It sets the price of
#1: the top settles at roughly daily-spend × half-life. If #1 gets so expensive
nobody challenges it, lower it. If people complain their votes evaporate, raise
it. Change it in Postgres **and** in `PAID_HALF_LIFE_HOURS` in `lib/paytowin.ts`
— the two must match or the quoted price will lie.
