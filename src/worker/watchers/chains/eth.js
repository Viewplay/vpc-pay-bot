// src/worker/watchers/chains/eth.js
import { config } from "../../../runtime/config.js";
import { METHOD } from "../../../vpc/prices.js";

function withinTolerance(received, expected) {
  const tol = expected * (config.AMOUNT_TOLERANCE_PCT / 100);
  return received + tol >= expected;
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  const t = await r.text();
  let j = {};
  try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return j;
}

function getEtherscanBase() {
  return (process.env.ETHERSCAN_BASE || "https://api.etherscan.io/api").trim();
}

function getEtherscanKey() {
  const k = (process.env.ETHERSCAN_API_KEY || "").trim();
  if (!k) throw new Error("ETHERSCAN_API_KEY missing (required for ETH/USDT ERC20 detection).");
  return k;
}

/**
 * REQUIRED export for existing code:
 * checkPayment.js imports { checkETH } from "./chains/eth.js"
 */
export async function checkETH(order) {
  const method = String(order.pay_method || order.client_method || "").trim();
  const deposit = String(order.deposit_address || "").trim();
  const expected = Number(order.expected_crypto_amount);

  if (!deposit || !Number.isFinite(expected) || expected <= 0) {
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  const apiKey = getEtherscanKey();
  const base = getEtherscanBase();

  const createdAtMs = Number(order.created_at || 0);
  const createdAtSec = Math.floor(createdAtMs / 1000);

  // ========= Native ETH (txlist) =========
  if (method === METHOD.ETH || method === "ethereum") {
    const url =
      `${base}?module=account&action=txlist&address=${deposit}` +
      `&startblock=0&endblock=99999999&sort=desc&apikey=${encodeURIComponent(apiKey)}`;

    const data = await fetchJson(url);

    if (data.status !== "1" && data.message !== "OK") {
      const msg = String(data.message || "").toLowerCase();
      if (msg.includes("no transactions")) {
        return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
      }
      throw new Error(`Etherscan txlist error: ${data.message || "unknown"}`);
    }

    const txs = Array.isArray(data.result) ? data.result : [];
    const depLower = deposit.toLowerCase();

    for (const tx of txs) {
      const to = String(tx.to || "").toLowerCase();
      if (to !== depLower) continue;

      const isError = String(tx.isError || "0") === "1";
      const status = String(tx.txreceipt_status || "1");
      if (isError || status === "0") continue;

      const timeSec = Number(tx.timeStamp || 0);
      if (timeSec && createdAtSec && timeSec + 5 < createdAtSec) continue;

      const received = Number(tx.value || 0) / 1e18;
      if (!withinTolerance(received, expected)) continue;

      const conf = Number(tx.confirmations || 0);
      return {
        seen: true,
        confirmed: conf >= 1,
        txid: String(tx.hash || null),
        received,
        conf,
      };
    }

    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  // ========= USDT ERC20 (tokentx) =========
  if (method === METHOD.USDT_ERC20 || method === "usdt_erc20") {
    const contract = String(config.USDT_ERC20_CONTRACT || "").trim();
    if (!contract) throw new Error("USDT_ERC20_CONTRACT missing in config.");

    const url =
      `${base}?module=account&action=tokentx&contractaddress=${contract}` +
      `&address=${deposit}&page=1&offset=100&sort=desc&apikey=${encodeURIComponent(apiKey)}`;

    const data = await fetchJson(url);

    if (data.status !== "1" && data.message !== "OK") {
      const msg = String(data.message || "").toLowerCase();
      if (msg.includes("no transactions")) {
        return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
      }
      throw new Error(`Etherscan tokentx error: ${data.message || "unknown"}`);
    }

    const txs = Array.isArray(data.result) ? data.result : [];
    const depLower = deposit.toLowerCase();

    for (const tx of txs) {
      const to = String(tx.to || "").toLowerCase();
      if (to !== depLower) continue;

      const timeSec = Number(tx.timeStamp || 0);
      if (timeSec && createdAtSec && timeSec + 5 < createdAtSec) continue;

      const isError = String(tx.isError || "0") === "1";
      if (isError) continue;

      const decimals = Number(tx.tokenDecimal || 6);
      const received = Number(tx.value || 0) / Math.pow(10, decimals);
      if (!withinTolerance(received, expected)) continue;

      const conf = Number(tx.confirmations || 0);
      return {
        seen: true,
        confirmed: conf >= 1,
        txid: String(tx.hash || null),
        received,
        conf,
      };
    }

    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
}