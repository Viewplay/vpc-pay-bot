// src/worker/watchers/chains/eth.js
import { config } from "../../../runtime/config.js";

function toWeiFromEthNumber(eth) {
  return BigInt(Math.round(Number(eth) * 1e18));
}

function pctTolerance(expectedWei, pct) {
  const p = Number.isFinite(pct) ? pct : 0.5;
  return (expectedWei * BigInt(Math.round(p * 100))) / BigInt(10000);
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  const t = await r.text();
  let j = {};
  try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return j;
}

export async function checkEthPayment({
  depositAddress,
  expectedEth,
  createdAtMs,
  minConfirmations = 1,
  tolerancePct = 0.5,
}) {
  const addr = String(depositAddress || "").trim();
  if (!addr || !addr.startsWith("0x")) {
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  const apiKey = (process.env.ETHERSCAN_API_KEY || "").trim();
  if (!apiKey) throw new Error("ETHERSCAN_API_KEY missing (required for ETH native detection).");

  const base = (process.env.ETHERSCAN_BASE || "https://api.etherscan.io/api").trim();
  const url =
    `${base}?module=account&action=txlist&address=${addr}` +
    `&startblock=0&endblock=99999999&sort=desc&apikey=${encodeURIComponent(apiKey)}`;

  const data = await fetchJson(url);
  if (data.status !== "1" && data.message !== "OK") {
    if (String(data.message || "").toLowerCase().includes("no transactions")) {
      return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
    }
    throw new Error(`Etherscan error: ${data.message || "unknown"}`);
  }

  const txs = Array.isArray(data.result) ? data.result : [];
  const expectedWei = toWeiFromEthNumber(expectedEth);
  const tolWei = pctTolerance(expectedWei, tolerancePct);
  const createdAtSec = Math.floor(Number(createdAtMs || 0) / 1000);

  for (const tx of txs) {
    const to = String(tx.to || "").toLowerCase();
    const isError = String(tx.isError || "0") === "1";
    const status = String(tx.txreceipt_status || "1");
    const timeSec = Number(tx.timeStamp || 0);

    if (to !== addr.toLowerCase()) continue;
    if (timeSec && createdAtSec && timeSec + 5 < createdAtSec) continue;
    if (isError || status === "0") continue;

    const valueWei = BigInt(String(tx.value || "0"));
    const diff = valueWei > expectedWei ? valueWei - expectedWei : expectedWei - valueWei;
    if (diff > tolWei) continue;

    const conf = Number(tx.confirmations || 0);
    const confirmed = conf >= Number(minConfirmations || 1);

    return {
      seen: true,
      confirmed,
      txid: String(tx.hash || null),
      received: Number(valueWei) / 1e18,
      conf,
    };
  }

  return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
}