// src/worker/worker.js
import { db } from "../storage/db.js";
import { config } from "../runtime/config.js";
import { releaseDepositAddress } from "../wallets/addressPool.js";
import { checkPayment } from "./watchers/checkPayment.js";
import { sendVPC } from "./solana/sendVpc.js";

import { sendTelegramMessage } from "../services/telegram.js";
import { getPromoInfo } from "../services/promoRegistry.js";

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

function formatUsd(n) {
  const x = Number(n || 0);
  return `$${x.toFixed(2)}`;
}

async function notifyTelegram({ order, vpcSent }) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const adminChatId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
  if (!token || !adminChatId) return;

  const promoCode = String(order.promo_code || "").trim();
  const promo = promoCode ? getPromoInfo(promoCode) : null;

  const adminMsg = [
    "✅ New VPC purchase",
    `Order: ${order.id}`,
    `USD: ${formatUsd(order.usd)}`,
    `VPC: ${Number(vpcSent || 0).toLocaleString()}`,
    `Method: ${order.pay_method}`,
    promoCode ? `Promo: ${promoCode} (${promo?.name || "Unknown"})` : "Promo: none",
    order.payment_txid ? `PayTx: ${order.payment_txid}` : null,
    order.fulfill_tx_sig ? `VPC Tx: ${order.fulfill_tx_sig}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await sendTelegramMessage({ token, chatId: adminChatId, text: adminMsg });

  if (promo?.chatId && promo.chatId !== "0") {
    const refMsg = [
      "🎉 Your referral purchased VPC!",
      `Name: ${promo.name}`,
      `Promo: ${promo.code}`,
      `USD: ${formatUsd(order.usd)}`,
      `VPC: ${Number(vpcSent || 0).toLocaleString()}`,
      `Method: ${order.pay_method}`,
    ].join("\n");

    await sendTelegramMessage({ token, chatId: promo.chatId, text: refMsg });
  }
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
                vpcAmount: vpcToSend,
              });
            } catch (e) {
              const msg = String(e?.message || e);
              console.error(`Order ${fresh.id} sendVPC error: ${msg}`);
              db.prepare("UPDATE orders SET status='FAILED' WHERE id=?").run(fresh.id);
              continue;
            }

            markFulfilled(fresh.id, sig);

            const done = db.prepare(`SELECT * FROM orders WHERE id=?`).get(fresh.id) || fresh;

            console.log(`FULFILLED order=${done.id} sig=${sig}`);

            try {
              await notifyTelegram({ order: done, vpcSent: vpcToSend });
            } catch (e) {
              console.error("Telegram notify error:", String(e?.message || e));
            }
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
