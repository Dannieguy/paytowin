import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getVoter } from "@/lib/paytowinServer";
import styles from "./paytowin.module.css";
import VoteButtons from "./VoteButtons";
import BuyPanel from "./BuyPanel";
import SubmitPanel from "./SubmitPanel";
import {
  SITE_NAME,
  TAGLINE,
  TABS,
  PAID_HALF_LIFE_HOURS,
  formatMoney,
  timeAgo,
  votesToTakeFirst,
  num,
  type BoardRow,
  type BoardTab,
} from "@/lib/paytowin";

// Scores are a function of now(), so nothing here can be cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${SITE_NAME} — ${TAGLINE}`,
  description:
    "Pay a dollar to push a shitpost up the rankings. The money goes to us. That is the entire product.",
};

export default async function PayToWinPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = typeof params.tab === "string" ? params.tab : "top";
  const tab: BoardTab = (TABS.find((t) => t.id === raw)?.id ?? "top") as BoardTab;
  const justPaid = params.paid === "1";

  const [voter, board] = await Promise.all([getVoter(), loadBoard(tab)]);

  const topPaidScore = board.length
    ? Math.max(...board.map((r) => num(r.paid_score)))
    : 0;
  const takeFirst = votesToTakeFirst(topPaidScore);
  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.logo}>
            PayToWin<span>.lol</span>
          </h1>
          <p className={styles.tagline}>{TAGLINE}</p>

          <p className={styles.honest}>
            A dollar moves a post up. The money goes to us, not to a prize.
            Votes decay, so nothing stays on top for free. That is the whole
            thing. There is no catch because there is nothing to catch.
          </p>

          <div className={styles.actions}>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href="#buy">
              Buy votes
            </a>
            <a className={styles.btn} href="#submit">
              Submit a post
            </a>
          </div>

          <p className={styles.balance}>
            {voter ? (
              <>
                You have <b>{voter.credits}</b> {voter.credits === 1 ? "vote" : "votes"}.{" "}
              </>
            ) : null}
            {board.length > 0 ? (
              <>
                Taking #1 right now costs <b>{takeFirst}</b>{" "}
                {takeFirst === 1 ? "vote" : "votes"}.
              </>
            ) : (
              <>Nobody has posted yet. First one in takes #1 for a dollar.</>
            )}
          </p>

          {justPaid ? (
            <p className={styles.success}>
              Votes added. If the balance above looks stale, refresh in a second.
            </p>
          ) : null}
        </header>

        <nav className={styles.tabs}>
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/?tab=${t.id}`}
              className={`${styles.tab} ${t.id === tab ? styles.tabActive : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <p className={styles.tabBlurb}>{activeTab.blurb}</p>

        {board.length === 0 ? (
          <p className={styles.empty}>
            Nothing here yet. Submit something and it goes live once it clears
            the queue.
          </p>
        ) : (
          board.map((row, i) => (
            <Row key={row.id} row={row} index={i} tab={tab} credits={voter?.credits ?? 0} />
          ))
        )}

        <BuyPanel />
        <SubmitPanel />

        <footer className={styles.footer}>
          Votes are non-refundable and decay with a{" "}
          {PAID_HALF_LIFE_HOURS}-hour half-life.
          <br />
          Every post is approved by a human before it appears.
          <br />
          Want something taken down? Email us and it comes down.
        </footer>
      </div>
    </div>
  );
}

async function loadBoard(tab: BoardTab): Promise<BoardRow[]> {
  const sql = db();
  if (!sql) return [];

  // A sort column cannot be parameterised, so each tab gets its own
  // literal query rather than an interpolated identifier.
  try {
    switch (tab) {
      case "good":
        return (await sql`
          select * from ptw_board order by free_score desc nulls last limit 100
        `) as BoardRow[];
      case "new":
        return (await sql`
          select * from ptw_board order by live_at desc nulls last limit 100
        `) as BoardRow[];
      case "fame":
        return (await sql`
          select * from ptw_board order by peak_paid_score desc nulls last limit 100
        `) as BoardRow[];
      default:
        return (await sql`
          select * from ptw_board order by paid_score desc nulls last limit 100
        `) as BoardRow[];
    }
  } catch {
    return [];
  }
}

function Row({
  row,
  index,
  tab,
  credits,
}: {
  row: BoardRow;
  index: number;
  tab: BoardTab;
  credits: number;
}) {
  const displayRank = index + 1;
  const paidScore = num(row.paid_score);
  const gap = row.free_rank - row.paid_rank;

  return (
    <article className={styles.row}>
      <div className={`${styles.rank} ${displayRank === 1 ? styles.rankTop : ""}`}>
        {displayRank}
      </div>

      <div className={styles.thumbWrap}>
        {row.kind === "image" && row.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className={styles.thumb} src={row.image_url} alt={row.title} loading="lazy" />
        ) : (
          <div className={styles.textPost}>💬</div>
        )}
      </div>

      <div className={styles.meta}>
        <h2 className={styles.title}>{row.title}</h2>
        {row.body ? <p className={styles.body}>{row.body}</p> : null}

        <div className={styles.sub}>
          <span className={styles.score}>{formatMoney(paidScore, { cents: true })}</span>
          <span>{row.free_votes} free</span>
          {tab === "fame" ? (
            <span>peak {formatMoney(num(row.peak_paid_score), { cents: true })}</span>
          ) : (
            <span>{timeAgo(row.last_vote_at ?? row.live_at)}</span>
          )}
          {row.submitter_handle ? <span>@{row.submitter_handle}</span> : null}

          {/* The gap between paid rank and free rank is the joke. */}
          {gap >= 5 ? (
            <span className={styles.gap}>bought {gap} spots</span>
          ) : gap <= -5 ? (
            <span className={`${styles.gap} ${styles.gapGood}`}>
              {Math.abs(gap)} spots underrated
            </span>
          ) : null}
        </div>
      </div>

      <VoteButtons postId={row.id} credits={credits} />
    </article>
  );
}
