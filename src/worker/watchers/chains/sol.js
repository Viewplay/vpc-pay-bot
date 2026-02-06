/**
 * Solana payment watcher (low-RPC, reliable).
 * Detects inbound SOL by scanning recent txs and checking balance delta
 * for the deposit address in the transaction meta (post - pre).
 */
const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.RPC_ENDPOINT ||
  "https://api.mainnet-beta.solana.com";

const LAMPORTS_PER_SOL = 1_000_000_000;

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

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}: ${txt}`);
    }
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

/** Return: { seen:boolean, confirmed:boolean, received:number, txid:string|null } */
export async function checkSOL(order) {
  const address = String(order.deposit_address || "").trim();
  const expectedSol = Number(order.expected_crypto_amount || 0);
  const expectedLamports = Math.max(1, Math.round(expectedSol * LAMPORTS_PER_SOL));
  const minSlot = order.start_block != null ? Number(order.start_block) : null;

  if (!address) return { seen: false, confirmed: false, received: 0, txid: null };

  const sigs = await solRpc("getSignaturesForAddress", [
    address,
    { limit: 10, commitment: "confirmed" },
  ]);

  for (const s of sigs || []) {
    if (!s || s.err) continue;
    if (minSlot != null && Number.isFinite(minSlot) && s.slot != null && s.slot < minSlot) {
      break;
    }

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