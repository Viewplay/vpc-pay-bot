import fetch from "node-fetch";
import TronWeb from "tronweb";
import { config } from "../../../runtime/config.js";

function withinTolerance(received, expected) {
  const tol = expected * (config.AMOUNT_TOLERANCE_PCT / 100);
  return received + tol >= expected;
}

export async function checkTRON(order) {
  const tron = new TronWeb({
    fullHost: config.TRON_FULL_HOST,
    headers: config.TRON_API_KEY ? { "TRON-PRO-API-KEY": config.TRON_API_KEY } : undefined
  });

  const toAddr = order.deposit_address;
  const expected = Number(order.expected_crypto_amount);

  const url = `${config.TRON_FULL_HOST}/v1/contracts/${config.USDT_TRC20_CONTRACT}/events?event_name=Transfer&only_confirmed=true&limit=50`;
  const r = await fetch(url, {
    headers: config.TRON_API_KEY ? { "TRON-PRO-API-KEY": config.TRON_API_KEY } : undefined
  });

  if (!r.ok) throw new Error(`TRON API HTTP ${r.status}`);
  const data = await r.json();
  const events = data?.data || [];

  for (const ev of events) {
    const result = ev?.result || {};
    if (!result.to) continue;

    const toBase58 = tron.address.fromHex(result.to);
    if (toBase58 !== toAddr) continue;

    const raw = Number(result.value || 0);
    const received = raw / 1e6;
    if (!withinTolerance(received, expected)) continue;

    return {
      seen: true,
      confirmed: true,
      txid: ev?.transaction_id || null,
      received,
      conf: 1
    };
  }

  return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
}
