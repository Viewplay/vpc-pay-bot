import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../../../runtime/config.js";
import { METHOD } from "../../../vpc/prices.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

function withinTolerance(received, expected) {
  const tol = expected * (config.AMOUNT_TOLERANCE_PCT / 100);
  return received + tol >= expected;
}

function pickCommitment(status) {
  if (status === "finalized") return "finalized";
  return "confirmed";
}

function calcSolReceivedFromBalances(tx, depositBase58) {
  const keys = tx?.transaction?.message?.accountKeys || [];
  const idx = keys.findIndex((k) => {
    const keyStr = typeof k === "string" ? k : (k?.pubkey?.toBase58?.() ?? k?.toBase58?.());
    return keyStr === depositBase58;
  });
  if (idx < 0) return 0;

  const pre = tx?.meta?.preBalances?.[idx] ?? 0;
  const post = tx?.meta?.postBalances?.[idx] ?? 0;
  const diff = Number(post) - Number(pre);
  return diff > 0 ? diff / 1e9 : 0;
}

export async function checkSOL(order) {
  if (!config.SOLANA_RPC_URL) throw new Error("Missing SOLANA_RPC_URL");

  const conn = new Connection(config.SOLANA_RPC_URL, "confirmed");
  const deposit = new PublicKey(order.deposit_address);
  const deposit58 = deposit.toBase58();
  const expected = Number(order.expected_crypto_amount);

  // -------- SOL native --------
  if (order.pay_method === METHOD.SOL) {
    const sigs = await conn.getSignaturesForAddress(deposit, { limit: 50 }, "confirmed");

    for (const s of sigs) {
      const commitment = pickCommitment(s.confirmationStatus);

      const tx = await conn.getTransaction(s.signature, {
        commitment,
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) continue;

      const received = calcSolReceivedFromBalances(tx, deposit58);
      if (!withinTolerance(received, expected)) continue;

      return {
        seen: true,
        confirmed: commitment === "confirmed" || commitment === "finalized",
        txid: s.signature,
        received,
        conf: 1,
      };
    }

    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  // -------- USDT on Solana (SPL token) --------
  const usdtMint = new PublicKey(config.USDT_SOL_MINT);
  const ata = getAssociatedTokenAddressSync(usdtMint, deposit, true);
  const ata58 = ata.toBase58();

  const sigs = await conn.getSignaturesForAddress(ata, { limit: 50 }, "confirmed");
  for (const s of sigs) {
    const commitment = pickCommitment(s.confirmationStatus);

    const tx = await conn.getParsedTransaction(s.signature, {
      commitment,
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;

    const insAll = [
      ...(tx.transaction.message.instructions || []),
      ...((tx.meta?.innerInstructions || []).flatMap((x) => x.instructions || [])),
    ];

    for (const ins of insAll) {
      if (ins.program !== "spl-token") continue;

      const type = ins.parsed?.type;
      const info = ins.parsed?.info;
      if (!info) continue;

      const dest = info.destination || info.account;
      if (dest !== ata58) continue;
      if (type !== "transfer" && type !== "transferChecked") continue;

      const amountStr = info.tokenAmount?.uiAmountString ?? info.amount;
      const received = Number(amountStr);
      if (!Number.isFinite(received)) continue;
      if (!withinTolerance(received, expected)) continue;

      return {
        seen: true,
        confirmed: commitment === "confirmed" || commitment === "finalized",
        txid: s.signature,
        received,
        conf: 1,
      };
    }
  }

  return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
}
