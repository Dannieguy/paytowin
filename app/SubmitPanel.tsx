"use client";

import { useState } from "react";
import styles from "./paytowin.module.css";
import { IMAGE_HOSTS } from "@/lib/paytowin";

const ERRORS: Record<string, string> = {
  bad_title: "Title has to be between 1 and 140 characters.",
  body_too_long: "Caption is over 500 characters.",
  bad_image_url:
    "That image link will not work. It has to be a direct https link ending in .jpg, .png, .gif or .webp on one of the allowed hosts.",
  too_many_pending: "You already have three posts waiting for approval. Sit tight.",
};

export default function SubmitPanel() {
  const [kind, setKind] = useState<"image" | "text">("image");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title, body, imageUrl, handle }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(ERRORS[json.error] ?? "Could not submit that. Try again.");
        return;
      }

      setDone(true);
      setTitle("");
      setBody("");
      setImageUrl("");
    } catch {
      setError("Could not submit that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} id="submit">
      <h2 className={styles.panelTitle}>Submit a post</h2>
      <p className={styles.panelBlurb}>
        Free to enter. A human reads every submission before it goes on the
        board, so it will not appear instantly.
      </p>

      <form onSubmit={submit}>
        <div className={styles.field}>
          <label className={styles.label}>Type</label>
          <div className={styles.actions} style={{ justifyContent: "flex-start", marginTop: 0 }}>
            <button
              type="button"
              className={`${styles.btn} ${kind === "image" ? styles.btnPrimary : ""}`}
              onClick={() => setKind("image")}
            >
              Image
            </button>
            <button
              type="button"
              className={`${styles.btn} ${kind === "text" ? styles.btnPrimary : ""}`}
              onClick={() => setKind("text")}
            >
              Text
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="ptw-title">
            Title
          </label>
          <input
            id="ptw-title"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            required
          />
        </div>

        {kind === "image" ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ptw-image">
              Image link
            </label>
            <input
              id="ptw-image"
              className={styles.input}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://i.imgur.com/example.jpg"
            />
            <p className={styles.hint}>
              Direct https link from: {IMAGE_HOSTS.join(", ")}. We do not host
              uploads, which spares everyone a great deal of trouble.
            </p>
          </div>
        ) : (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ptw-body">
              The post
            </label>
            <textarea
              id="ptw-body"
              className={styles.input}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={500}
              rows={4}
            />
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="ptw-handle">
            Credit it to (optional)
          </label>
          <input
            id="ptw-handle"
            className={styles.input}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="yourhandle"
            maxLength={20}
          />
        </div>

        <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
          {busy ? "Sending…" : "Submit for approval"}
        </button>

        {error ? <p className={styles.error}>{error}</p> : null}
        {done ? (
          <p className={styles.success}>
            In the queue. It shows up on the board once it is approved.
          </p>
        ) : null}
      </form>
    </section>
  );
}
