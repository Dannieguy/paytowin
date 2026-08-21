"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./paytowin.module.css";

export default function VoteButtons({
  postId,
  credits,
}: {
  postId: string;
  credits: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [freeDone, setFreeDone] = useState(false);

  async function vote(kind: "free" | "paid") {
    setBusy(true);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, kind }),
      });
      const json = await res.json();

      if (res.status === 402) {
        // Out of credits. Send them to the bundles rather than a dead end.
        document.getElementById("buy")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      if (!res.ok) return;

      if (kind === "free") setFreeDone(true);
      if (json.counted) startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <div className={styles.voteCol}>
      <button
        className={`${styles.voteBtn} ${styles.votePaid}`}
        onClick={() => vote("paid")}
        disabled={disabled}
        title={credits > 0 ? `${credits} votes left` : "Buy votes first"}
      >
        $1 ↑
      </button>
      <button
        className={styles.voteBtn}
        onClick={() => vote("free")}
        disabled={disabled || freeDone}
      >
        {freeDone ? "voted" : "free ↑"}
      </button>
    </div>
  );
}
