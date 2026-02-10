import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../../../runtime/config.js";
import { METHOD } from "../../../vpc/prices.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

function withinTolerance(received, expected) {
  const tol = expected * (config.AMOUNT_TOLERANCE_PCT / 100);
  return received + tol >= expected;
}

export async function checkSOL(order) {
  const conn = new Connection(config.SOLANA_RPC_URL, "confirmed");
  const deposit = new PublicKey(order.deposit_address);
  const expected = Number(order.expected_crypto_amount);

  if (order.pay_method === METHOD.SOL) {
    const sigs = await conn.getSignaturesForAddress(deposit, { limit: 30 }, "confirmed");
    for (const s of sigs) {
      const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
      if (!tx) continue;

      for (const ins of tx.transaction.message.instructions || []) {
        if (ins.program !== "system") continue;
        const info = ins.parsed?.info;
        if (!info) continue;
        if (info.destination !== deposit.toBase58()) continue;

        const lamports = Number(info.lamports || 0);
        const received = lamports / 1e9;
        if (!withinTolerance(received, expected)) continue;

        return {
          seen: true,
          confirmed: s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized",
          txid: s.signature,
          received,
          conf: 1
        };
      }
    }
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  const usdtMint = new PublicKey(config.USDT_SOL_MINT);
  const ata = getAssociatedTokenAddressSync(usdtMint, deposit, true);

  const sigs = await conn.getSignaturesForAddress(ata, { limit: 30 }, "confirmed");
  for (const s of sigs) {
    const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) continue;

    for (const ins of tx.transaction.message.instructions || []) {
      if (ins.program !== "spl-token") continue;
      const type = ins.parsed?.type;
      const info = ins.parsed?.info;
      if (!info) continue;

      const dest = info.destination || info.account;
      if (dest !== ata.toBase58()) continue;
      if (type !== "transfer" && type !== "transferChecked") continue;

      const amountStr = info.tokenAmount?.uiAmountString ?? info.amount;
      const received = Number(amountStr);
      if (!Number.isFinite(received)) continue;
      if (!withinTolerance(received, expected)) continue;

      return {
        seen: true,
        confirmed: s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized",
        txid: s.signature,
        received,
        conf: 1
      };
    }
  }

  return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
}
