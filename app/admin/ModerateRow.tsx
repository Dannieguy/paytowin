"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../paytowin.module.css";

export default function ModerateRow({ id, adminKey }: { id: string; adminKey: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function act(action: "approve" | "reject") {
    setBusy(true);
    try {
      const res = await fetch("/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey, id, action }),
      });
      if (res.ok) startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <div className={styles.voteCol}>
      <button
        className={`${styles.voteBtn} ${styles.votePaid}`}
        onClick={() => act("approve")}
        disabled={disabled}
      >
        approve
      </button>
      <button className={styles.voteBtn} onClick={() => act("reject")} disabled={disabled}>
        reject
      </button>
    </div>
  );
}
