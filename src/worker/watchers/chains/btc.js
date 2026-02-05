import fetch from "node-fetch";
import { config } from "../../../runtime/config.js";

function withinTolerance(received, expected) {
  const tol = expected * (config.AMOUNT_TOLERANCE_PCT / 100);
  return received + tol >= expected;
}

export async function checkBTC(order) {
  const address = order.deposit_address;
  const expected = Number(order.expected_crypto_amount);

  const url = `${config.BTC_API_BASE}/address/${address}/txs`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`BTC API HTTP ${r.status}`);
  const txs = await r.json();

  for (const tx of txs) {
    let receivedSats = 0;
    for (const vout of tx.vout || []) {
      if (vout?.scriptpubkey_address === address) receivedSats += Number(vout.value || 0);
    }
    const received = receivedSats / 1e8;
    if (received <= 0) continue;

    const confirmed = Boolean(tx?.status?.confirmed);
    if (!withinTolerance(received, expected)) continue;

    return {
      seen: true,
      confirmed,
      txid: tx?.txid || null,
      received,
      conf: confirmed ? 1 : 0
    };
  }

  return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
}
