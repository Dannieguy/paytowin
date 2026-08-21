"use client";

import { useState } from "react";
import styles from "./paytowin.module.css";
import { BUNDLES, formatMoney } from "@/lib/paytowin";

export default function BuyPanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(bundleId: string) {
    setBusy(bundleId);
    setError(null);
    try {
      const res = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId,
          returnTo: window.location.pathname + window.location.search,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.url) {
        setError("Checkout would not open. Try again in a moment.");
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("Checkout would not open. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.panel} id="buy">
      <h2 className={styles.panelTitle}>Buy votes</h2>
      <p className={styles.panelBlurb}>
        One dollar per vote. Bought in bundles because a $1 card charge loses a
        third of itself to fees, and we would rather you got the third.
      </p>

      <div className={styles.bundles}>
        {BUNDLES.map((b) => (
          <button
            key={b.id}
            className={styles.bundle}
            onClick={() => buy(b.id)}
            disabled={busy !== null}
          >
            <div className={styles.bundlePrice}>{formatMoney(b.cents)}</div>
            <div className={styles.bundleLabel}>
              {busy === b.id ? "Opening…" : b.label}
            </div>
            <div className={styles.bundleBlurb}>{b.blurb}</div>
          </button>
        ))}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <p className={styles.hint}>
        Non-refundable. Votes decay on a 24-hour half-life, so buying the top
        spot buys you today, not forever. We are telling you this before you
        pay, which is more than most things do.
      </p>
    </section>
  );
}
