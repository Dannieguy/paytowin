import crypto from "node:crypto";
import { db } from "@/lib/db";
import styles from "../paytowin.module.css";
import ModerateRow from "./ModerateRow";

export const dynamic = "force-dynamic";

interface PendingPost {
  id: string;
  kind: "image" | "text";
  title: string;
  body: string | null;
  image_url: string | null;
  submitter_handle: string | null;
  created_at: string;
}

function keyOk(provided: string | undefined): boolean {
  const expected = process.env.PTW_ADMIN_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const key = typeof params.key === "string" ? params.key : undefined;

  if (!keyOk(key)) {
    return (
      <div className={styles.shell}>
        <div className={styles.inner}>
          <p className={styles.empty}>Nope.</p>
        </div>
      </div>
    );
  }

  const sql = db();
  let pending: PendingPost[] = [];
  if (sql) {
    try {
      pending = (await sql`
        select id, kind, title, body, image_url, submitter_handle, created_at
          from ptw_posts
         where status = 'pending'
         order by created_at asc
         limit 100
      `) as PendingPost[];
    } catch {
      pending = [];
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.logo}>Queue</h1>
          <p className={styles.tagline}>
            {pending.length} waiting. Nothing is public until you say so.
          </p>
        </header>

        {pending.length === 0 ? (
          <p className={styles.empty}>Queue is empty.</p>
        ) : (
          pending.map((post) => (
            <article key={post.id} className={styles.row}>
              <div className={styles.thumbWrap}>
                {post.kind === "image" && post.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className={styles.thumb} src={post.image_url} alt={post.title} />
                ) : (
                  <div className={styles.textPost}>💬</div>
                )}
              </div>

              <div className={styles.meta}>
                <h2 className={styles.title}>{post.title}</h2>
                {post.body ? <p className={styles.body}>{post.body}</p> : null}
                <div className={styles.sub}>
                  {post.submitter_handle ? <span>@{post.submitter_handle}</span> : null}
                  {post.image_url ? (
                    <a
                      className={styles.tab}
                      style={{ padding: 0 }}
                      href={post.image_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      open source
                    </a>
                  ) : null}
                </div>
              </div>

              <ModerateRow id={post.id} adminKey={key!} />
            </article>
          ))
        )}
      </div>
    </div>
  );
}
