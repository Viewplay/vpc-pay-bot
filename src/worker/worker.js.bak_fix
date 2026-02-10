import { db } from "../storage/db.js";
import { config } from "../runtime/config.js";
import { releaseDepositAddress } from "../wallets/addressPool.js";
import { checkPayment } from "./watchers/checkPayment.js";
import { sendVPC } from "./solana/sendVpc.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function markExpired() {
  const now = Date.now();
  db.prepare(`UPDATE orders SET status='EXPIRED' WHERE status='PENDING' AND expires_at < ?`).run(now);
}

function listPendingOrders(limit = 50) {
  return db
    .prepare(
      `SELECT * FROM orders
       WHERE status='PENDING'
         AND expires_at >= ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(Date.now(), limit);
}

function updateSeen(id, txid) {
  db.prepare(
    `UPDATE orders SET payment_seen=1, payment_txid=COALESCE(payment_txid, ?)
     WHERE id=?`
  ).run(txid || null, id);
}

function updateConfirmed(id, txid) {
  db.prepare(
    `UPDATE orders SET payment_seen=1, payment_confirmed=1, payment_txid=COALESCE(payment_txid, ?), status='PAID'
     WHERE id=?`
  ).run(txid || null, id);
}

function markFulfilled(id, sig) {
  db.prepare(`UPDATE orders SET status='FULFILLED', fulfill_tx_sig=? WHERE id=?`).run(sig, id);
}

export function startWorker() {
  (async () => {
    console.log("Worker started");
    while (true) {
      try {
        markExpired();
        releaseDepositAddress(db);

        const pending = listPendingOrders(10);
        for (const order of pending) {
          const current = db.prepare(`SELECT * FROM orders WHERE id=?`).get(order.id);
          if (!current || current.status !== "PENDING" || Number(current.expires_at || 0) < Date.now()) continue;

          let result;
          try {
            result = await checkPayment(current);
          } catch (e) {
            const msg = String(e?.message || e);
            console.error(`Order ${current.id} checkPayment error: ${msg}`);
            continue;
          }

          
          await sleep(250);
if (result.seen && !current.payment_seen) updateSeen(current.id, result.txid || null);

          if (result.confirmed && current.status === "PENDING") {
            updateConfirmed(current.id, result.txid || null);
            const fresh = db.prepare(`SELECT * FROM orders WHERE id=?`).get(current.id) || current;
            const expected = Number(fresh.expected_crypto_amount || 0);
            const received = Number(result.received || 0);

            let vpcToSend = Number(fresh.vpc_amount || 0);
            if (expected > 0 && received > 0) {
              const ratio = Math.min(1, received / expected);
              vpcToSend = Math.max(1, Math.floor(vpcToSend * ratio));
            }

            let sig;
            try {
              sig = await sendVPC({
              solanaRecipient: fresh.solana_address,
              vpcAmount: vpcToSend
            });
            } catch (e) {
              const msg = String(e?.message || e);
              console.error(`Order ${fresh.id} sendVPC error: ${msg}`);
              db.prepare("UPDATE orders SET status='FAILED' WHERE id=?").run(fresh.id);
              continue;
            }
            markFulfilled(fresh.id, sig);
            console.log(`FULFILLED order=${fresh.id} sig=${sig}`);
          }
        }
      } catch (e) {
        const msg = String(e?.message || e);
        console.error("Worker loop error:", msg);
        if (msg.includes("429")) {
          await sleep(15000);
        }
      }
      await sleep(config.WORKER_INTERVAL_MS);
    }
  })().catch((e) => console.error("Worker crashed:", e));
}
