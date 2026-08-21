-- ============================================================
-- PayToWin.lol - continuous pay-to-rank shitpost board
-- Every object is prefixed ptw_ so this can sit beside the
-- TurnBook schema or be lifted into its own project unchanged.
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- TUNING
-- There are no rounds, so decay is what keeps the board alive.
-- The top settles at roughly (daily spend) x (half-life), which
-- means the half-life IS the price of #1. Shorten it and #1 stays
-- beatable on impulse; lengthen it and the leader ossifies and
-- newcomers stop bothering. This is the single most important
-- number in the product.
-- ============================================================
create or replace function ptw_paid_half_life() returns numeric
  language sql immutable as $fn$ select 24.0 $fn$;   -- hours

create or replace function ptw_free_half_life() returns numeric
  language sql immutable as $fn$ select 48.0 $fn$;   -- hours

-- The first hour runs at full strength so nobody watches their
-- vote start evaporating during the checkout redirect.
create or replace function ptw_grace_hours() returns numeric
  language sql immutable as $fn$ select 1.0 $fn$;

create or replace function ptw_vote_cents() returns int
  language sql immutable as $fn$ select 100 $fn$;    -- $1 per paid vote

-- ============================================================
-- VOTERS
-- Identity is a signed cookie, not an account. Nobody creates a
-- login to spend a dollar. Email arrives from Stripe at purchase
-- and is the only way to recover a balance if cookies are cleared.
-- That email list is also the most durable thing this site produces.
-- ============================================================
create table if not exists ptw_voters (
  id           uuid primary key default gen_random_uuid(),
  email        text,
  credits      int not null default 0 check (credits >= 0),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists ptw_voters_email_idx on ptw_voters (lower(email));

-- ============================================================
-- POSTS
-- Nothing is publicly visible until status = 'live'. Anonymous
-- image uploads plus a payment processor is the part of this that
-- can actually cause harm, and an approval queue is the cheapest
-- real defence. Everything lands in 'pending'.
-- ============================================================
create table if not exists ptw_posts (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null default 'image' check (kind in ('image','text')),
  title             text not null check (char_length(title) between 1 and 140),
  body              text check (char_length(body) <= 500),
  image_url         text,
  submitter_id      uuid references ptw_voters(id) on delete set null,
  submitter_handle  text,
  status            text not null default 'pending'
                    check (status in ('pending','live','rejected','removed')),
  reject_reason     text,
  live_at           timestamptz,
  -- Peak never decays. It is what someone's $20 permanently bought,
  -- and it is what the Hall of Fame is ranked on.
  peak_paid_score   numeric(14,2) not null default 0,
  peak_at           timestamptz,
  views             int not null default 0,
  created_at        timestamptz not null default now(),
  constraint ptw_posts_image_present
    check (kind <> 'image' or image_url is not null)
);

create index if not exists ptw_posts_live_idx on ptw_posts (live_at desc) where status = 'live';
create index if not exists ptw_posts_queue_idx on ptw_posts (created_at) where status = 'pending';

-- ============================================================
-- VOTES
-- Each vote decays on its own clock. A paid vote is worth
-- ptw_vote_cents(); a free vote is worth one unit on a separate
-- scale. They are never mixed into one number - that separation
-- is what keeps the free board honest.
-- One free vote per person per post. Paid votes are unlimited,
-- which is the entire business model.
-- ============================================================
create table if not exists ptw_votes (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references ptw_posts(id) on delete cascade,
  voter_id    uuid not null references ptw_voters(id) on delete cascade,
  kind        text not null check (kind in ('free','paid')),
  value_cents int not null default 0,
  created_at  timestamptz not null default now()
);

create unique index if not exists ptw_votes_one_free_per_post
  on ptw_votes (post_id, voter_id) where kind = 'free';
create index if not exists ptw_votes_post_idx on ptw_votes (post_id, kind);

-- ============================================================
-- CREDIT PURCHASES
-- A $1 charge loses a third of itself to Stripe fees, so nobody
-- buys one vote. They buy a bundle once and then click freely.
-- ============================================================
create table if not exists ptw_credit_purchases (
  id                       uuid primary key default gen_random_uuid(),
  voter_id                 uuid not null references ptw_voters(id) on delete cascade,
  credits                  int not null check (credits > 0),
  amount_cents             int not null check (amount_cents > 0),
  stripe_session_id        text not null unique,
  stripe_payment_intent_id text,
  email                    text,
  status                   text not null default 'pending'
                           check (status in ('pending','paid','refunded','disputed')),
  paid_at                  timestamptz,
  created_at               timestamptz not null default now()
);

create index if not exists ptw_purchases_pi_idx
  on ptw_credit_purchases (stripe_payment_intent_id);

-- ============================================================
-- DECAY
--   value * 0.5 ^ ( max(0, hours_elapsed - grace) / half_life )
-- stable, not immutable: it reads now().
-- ============================================================
create or replace function ptw_decayed(value numeric, at timestamptz, half_life numeric)
returns numeric language sql stable as $fn$
  select case
    when at is null then 0::numeric
    else value * power(
      0.5,
      greatest(0, extract(epoch from (now() - at)) / 3600.0 - ptw_grace_hours()) / half_life
    )
  end;
$fn$;

-- ============================================================
-- SCORING
-- ============================================================
create or replace view ptw_scored as
select
  p.id, p.kind, p.title, p.body, p.image_url, p.submitter_handle,
  p.live_at, p.created_at, p.peak_paid_score, p.peak_at, p.views,
  coalesce(sum(ptw_decayed(v.value_cents, v.created_at, ptw_paid_half_life()))
           filter (where v.kind = 'paid'), 0)::numeric(14,2) as paid_score,
  coalesce(sum(ptw_decayed(1, v.created_at, ptw_free_half_life()))
           filter (where v.kind = 'free'), 0)::numeric(14,4) as free_score,
  count(*) filter (where v.kind = 'paid')::int               as paid_votes,
  count(*) filter (where v.kind = 'free')::int               as free_votes,
  coalesce(sum(v.value_cents), 0)::bigint                    as total_cents,
  max(v.created_at)                                          as last_vote_at
from ptw_posts p
left join ptw_votes v on v.post_id = p.id
where p.status = 'live'
group by p.id;

-- Both ranks on every row, so a post can show that it is #1 on Top
-- and #63 on Actually Good. That gap is the joke and the screenshot.
create or replace view ptw_board as
select
  s.*,
  rank() over (order by s.paid_score desc, s.live_at desc)::int as paid_rank,
  rank() over (order by s.free_score desc, s.live_at desc)::int as free_rank
from ptw_scored s;

-- ============================================================
-- WRITES
-- ============================================================

-- Both SET expressions read the pre-update row, so comparing
-- against the old peak is correct.
create or replace function ptw_refresh_peak(p_post_id uuid)
returns numeric language plpgsql as $fn$
declare s numeric;
begin
  select coalesce(sum(ptw_decayed(value_cents, created_at, ptw_paid_half_life())), 0)
    into s
    from ptw_votes
   where post_id = p_post_id and kind = 'paid';

  update ptw_posts
     set peak_paid_score = greatest(peak_paid_score, s),
         peak_at         = case when s > peak_paid_score then now() else peak_at end
   where id = p_post_id;

  return s;
end $fn$;

-- Spending a credit and recording the vote must be one transaction,
-- or a crash between them either eats a dollar or gives a free vote.
create or replace function ptw_cast_paid_vote(p_voter uuid, p_post uuid)
returns int language plpgsql as $fn$
declare remaining int;
begin
  if not exists (select 1 from ptw_posts where id = p_post and status = 'live') then
    raise exception 'post_not_live';
  end if;

  update ptw_voters
     set credits = credits - 1, last_seen_at = now()
   where id = p_voter and credits > 0
  returning credits into remaining;

  if remaining is null then
    raise exception 'no_credits';
  end if;

  insert into ptw_votes (post_id, voter_id, kind, value_cents)
  values (p_post, p_voter, 'paid', ptw_vote_cents());

  perform ptw_refresh_peak(p_post);
  return remaining;
end $fn$;

-- Returns false if this voter already free-voted on this post.
create or replace function ptw_cast_free_vote(p_voter uuid, p_post uuid)
returns boolean language plpgsql as $fn$
declare n int;
begin
  if not exists (select 1 from ptw_posts where id = p_post and status = 'live') then
    raise exception 'post_not_live';
  end if;

  insert into ptw_votes (post_id, voter_id, kind, value_cents)
  values (p_post, p_voter, 'free', 0)
  on conflict do nothing;

  get diagnostics n = row_count;
  update ptw_voters set last_seen_at = now() where id = p_voter;
  return n > 0;
end $fn$;

create or replace function ptw_grant_credits(p_voter uuid, p_credits int)
returns int language plpgsql as $fn$
declare total int;
begin
  update ptw_voters set credits = credits + p_credits
   where id = p_voter returning credits into total;
  return total;
end $fn$;

-- ============================================================
-- RLS
-- The board renders server-side with the service role, which
-- bypasses RLS. Nothing here needs anon write access, and votes,
-- voters and purchases must never be readable by the browser.
-- ============================================================
alter table ptw_voters           enable row level security;
alter table ptw_posts            enable row level security;
alter table ptw_votes            enable row level security;
alter table ptw_credit_purchases enable row level security;

drop policy if exists "public read live posts" on ptw_posts;
create policy "public read live posts" on ptw_posts
  for select using (status = 'live');

-- No policies on ptw_voters, ptw_votes, ptw_credit_purchases:
-- no anon or authenticated access at all.

-- Views run as owner and would otherwise leak the vote table
-- through the aggregates. Service role only.
revoke all on ptw_scored from anon, authenticated;
revoke all on ptw_board  from anon, authenticated;
