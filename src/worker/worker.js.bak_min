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
       ORDER BY created_at ASC
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

        const pending = listPendingOrders(100);
        for (const order of pending) {
          const result = await checkPayment(order);

          if (result.seen && !order.payment_seen) updateSeen(order.id, result.txid || null);

          if (result.confirmed && order.status === "PENDING") {
            updateConfirmed(order.id, result.txid || null);
            const sig = await sendVPC({
              solanaRecipient: order.solana_address,
              vpcAmount: order.vpc_amount
            });
            markFulfilled(order.id, sig);
            console.log(`FULFILLED order=${order.id} sig=${sig}`);
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
