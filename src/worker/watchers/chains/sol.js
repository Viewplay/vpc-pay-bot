/**
 * Solana payment watcher.
 * - SOL: detects inbound SOL by scanning recent txs and checking balance delta
 * - USDT (SOL): detects inbound SPL-Token (USDT mint) by scanning token balance delta
 */
import { config } from "../../../runtime/config.js";
import { METHOD } from "../../../vpc/prices.js";

const RPC_URL = config.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const LAMPORTS_PER_SOL = 1_000_000_000;

function withinTolerance(received, expected) {
  const tol = expected * (config.AMOUNT_TOLERANCE_PCT / 100);
  return received + tol >= expected;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function solRpc(method, params) {
  let delay = 500;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "vpc", method, params }),
    });

    const txt = await res.text();

    if (res.status === 429) {
      await sleep(delay);
      delay = Math.min(delay * 2, 8000);
      continue;
    }

    let json;
    try {
      json = txt ? JSON.parse(txt) : {};
    } catch {
      throw new Error(`SOL RPC bad JSON: ${txt?.slice?.(0, 120) || ""}`);
    }

    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${txt}`);
    if (json?.error) {
      const msg = typeof json.error === "string" ? json.error : JSON.stringify(json.error);
      if (msg.includes("429")) {
        await sleep(delay);
        delay = Math.min(delay * 2, 8000);
        continue;
      }
      throw new Error(`SOL RPC error: ${msg}`);
    }
    return json.result;
  }
  throw new Error("SOL RPC: too many 429 retries");
}

function keyToString(k) {
  if (!k) return "";
  if (typeof k === "string") return k;
  if (typeof k === "object") return String(k.pubkey || k.toString?.() || "");
  return String(k);
}

function findIndex(accountKeys, address) {
  for (let i = 0; i < accountKeys.length; i++) {
    if (keyToString(accountKeys[i]) === address) return i;
  }
  return -1;
}

function tokenDeltaForOwnerMint(meta, owner, mint) {
  const pre = Array.isArray(meta?.preTokenBalances) ? meta.preTokenBalances : [];
  const post = Array.isArray(meta?.postTokenBalances) ? meta.postTokenBalances : [];

  const sum = (arr) =>
    arr
      .filter((b) => String(b?.owner || "") === owner && String(b?.mint || "") === mint)
      .reduce((acc, b) => acc + Number(b?.uiTokenAmount?.uiAmount || 0), 0);

  return sum(post) - sum(pre);
}

/** Return: { seen:boolean, confirmed:boolean, received:number, txid:string|null } */
export async function checkSOL(order) {
  const address = String(order.deposit_address || "").trim();
  if (!address) return { seen: false, confirmed: false, received: 0, txid: null };

  const createdAtSec = Math.floor(Number(order.created_at || order.createdAt || 0) / 1000);
  const minSlot = order.start_block != null ? Number(order.start_block) : null;

  // recent sigs for the owner address
  const sigs = await solRpc("getSignaturesForAddress", [
    address,
    { limit: 15, commitment: "confirmed" },
  ]);

  // USDT (SPL) mode
  if (order.pay_method === METHOD.USDT_SOL) {
    const mint = String(config.USDT_SOL_MINT || "").trim();
    const expected = Number(order.expected_crypto_amount || 0);

    if (!mint || !Number.isFinite(expected) || expected <= 0) {
      return { seen: false, confirmed: false, received: 0, txid: null };
    }

    for (const s of sigs || []) {
      if (!s || s.err) continue;

      if (
        Number.isFinite(createdAtSec) &&
        createdAtSec > 0 &&
        Number.isFinite(s.blockTime) &&
        s.blockTime < createdAtSec
      ) {
        continue;
      }
      if (minSlot != null && Number.isFinite(minSlot) && s.slot != null && s.slot < minSlot) break;

      const tx = await solRpc("getTransaction", [
        s.signature,
        { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
      ]);

      const delta = tokenDeltaForOwnerMint(tx?.meta, address, mint);
      if (!Number.isFinite(delta) || delta <= 0) continue;

      const received = delta;
      return {
        seen: true,
        confirmed: withinTolerance(received, expected),
        received,
        txid: s.signature,
      };
    }

    return { seen: false, confirmed: false, received: 0, txid: null };
  }

  // SOL native mode
  const expectedSol = Number(order.expected_crypto_amount || 0);
  const expectedLamports = Math.max(1, Math.round(expectedSol * LAMPORTS_PER_SOL));

  for (const s of sigs || []) {
    if (!s || s.err) continue;

    if (
      Number.isFinite(createdAtSec) &&
      createdAtSec > 0 &&
      Number.isFinite(s.blockTime) &&
      s.blockTime < createdAtSec
    ) {
      continue;
    }
    if (minSlot != null && Number.isFinite(minSlot) && s.slot != null && s.slot < minSlot) break;

    const tx = await solRpc("getTransaction", [
      s.signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]);

    const pre = tx?.meta?.preBalances;
    const post = tx?.meta?.postBalances;
    const keys = tx?.transaction?.message?.accountKeys || [];

    if (!Array.isArray(pre) || !Array.isArray(post) || pre.length !== post.length) continue;

    const idx = findIndex(keys, address);
    if (idx < 0 || idx >= pre.length) continue;

    const diffLamports = Number(post[idx]) - Number(pre[idx]);
    if (!Number.isFinite(diffLamports) || diffLamports <= 0) continue;

    const received = diffLamports / LAMPORTS_PER_SOL;

    return {
      seen: true,
      confirmed: diffLamports >= expectedLamports,
      received,
      txid: s.signature,
    };
  }

  return { seen: false, confirmed: false, received: 0, txid: null };
}
