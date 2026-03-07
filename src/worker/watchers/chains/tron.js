import { config } from "../../../runtime/config.js";

function withinTolerance(received, expected) {
  const tol = expected * (config.AMOUNT_TOLERANCE_PCT / 100);
  return received + tol >= expected;
}

/**
 * TRON / TRC20 watcher (USDT).
 * Uses TronGrid REST API:
 *   GET /v1/accounts/{address}/transactions/trc20?only_confirmed=true&limit=20
 * Requires TRON_FULL_HOST (default: https://api.trongrid.io)
 * Optional: TRON_API_KEY (TronGrid API key) => header "TRON-PRO-API-KEY"
 */
export async function checkTRON(order) {
  const host =
    String(config.TRON_FULL_HOST || process.env.TRON_RPC_URL || "").trim() ||
    "https://api.trongrid.io";

  if (!/^https?:\/\//i.test(host)) {
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  const address = String(order.deposit_address || "").trim();
  const expected = Number(order.expected_crypto_amount || 0);
  if (!address || !Number.isFinite(expected) || expected <= 0) {
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  const contract = String(config.USDT_TRC20_CONTRACT || "").trim();
  if (!contract) {
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  const url = `${host.replace(/\/$/, "")}/v1/accounts/${encodeURIComponent(
    address
  )}/transactions/trc20?only_confirmed=true&limit=20`;

  const headers = { accept: "application/json" };
  const apiKey = String(config.TRON_API_KEY || "").trim();
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  let data;
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`TRON HTTP ${r.status}`);
    data = await r.json();
  } catch {
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  const txs = Array.isArray(data?.data) ? data.data : [];
  for (const tx of txs) {
    const tokenInfo = tx?.token_info || {};
    const tokenAddr = String(tokenInfo?.address || "").trim();
    if (!tokenAddr) continue;

    // TronGrid can return hex or base58; accept both by comparing lowercase includes
    const want = contract.toLowerCase();
    const got = tokenAddr.toLowerCase();
    if (got !== want) continue;

    const to = String(tx?.to || "").trim();
    if (!to || to !== address) continue;

    const decimals = Number(tokenInfo?.decimals);
    const dec = Number.isFinite(decimals) ? decimals : 6;

    const raw = tx?.value;
    const rawNum = typeof raw === "string" ? Number(raw) : Number(raw || 0);
    if (!Number.isFinite(rawNum) || rawNum <= 0) continue;

    const received = rawNum / 10 ** dec;
    if (!withinTolerance(received, expected)) continue;

    return {
      seen: true,
      confirmed: true,
      txid: tx?.transaction_id || tx?.transactionId || null,
      received,
      conf: 1
    };
  }

  return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
}
