// src/worker/watchers/chains/btc.js
import fetch from "node-fetch";
import { config } from "../../../runtime/config.js";

function withinTolerance(received, expected) {
  const tol = expected * (config.AMOUNT_TOLERANCE_PCT / 100);
  return received + tol >= expected;
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  const t = await r.text();
  let j = {};
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    j = { raw: t };
  }
  if (!r.ok) throw new Error(`BTC API HTTP ${r.status}`);
  return j;
}

async function getTipHeight() {
  const base = String(config.BTC_API_BASE || "https://blockstream.info/api").replace(/\/+$/, "");
  const r = await fetch(`${base}/blocks/tip/height`, { cache: "no-store" });
  const t = await r.text();
  const h = Number(t);
  if (!Number.isFinite(h) || h <= 0) throw new Error("BTC tip height unavailable");
  return h;
}

export async function checkBTC(order) {
  const address = String(order.deposit_address || "").trim();
  const expected = Number(order.expected_crypto_amount);

  if (!address || !Number.isFinite(expected) || expected <= 0) {
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  const createdAtMs = Number(order.created_at || 0);
  const createdAtSec = Math.floor(createdAtMs / 1000);

  const base = String(config.BTC_API_BASE || "https://blockstream.info/api").replace(/\/+$/, "");
  const url = `${base}/address/${address}/txs`;

  const txs = await fetchJson(url);

  // Tip height for confirmations (best-effort)
  let tipHeight = 0;
  try {
    tipHeight = await getTipHeight();
  } catch {
    tipHeight = 0;
  }

  for (const tx of Array.isArray(txs) ? txs : []) {
    let receivedSats = 0;
    for (const vout of tx.vout || []) {
      if (vout?.scriptpubkey_address === address) receivedSats += Number(vout.value || 0);
    }
    const received = receivedSats / 1e8;
    if (received <= 0) continue;
    if (!withinTolerance(received, expected)) continue;

    const status = tx?.status || {};
    const confirmed = Boolean(status.confirmed);

    // ✅ IMPORTANT: ignore any confirmed tx that happened BEFORE the order was created
    // Blockstream has block_time (seconds) when confirmed
    const blockTimeSec = Number(status.block_time || 0);
    if (confirmed && createdAtSec && blockTimeSec && blockTimeSec + 5 < createdAtSec) {
      continue;
    }

    // For mempool txs (not confirmed), we accept "seen" only.
    let conf = 0;
    const blockHeight = Number(status.block_height || 0);
    if (confirmed && tipHeight > 0 && blockHeight > 0) {
      conf = Math.max(0, tipHeight - blockHeight + 1);
    } else if (confirmed) {
      conf = 1;
    }

    return {
      seen: true,
      confirmed,
      txid: tx?.txid || null,
      received,
      conf,
    };
  }

  return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
}