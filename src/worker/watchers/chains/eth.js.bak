import { ethers } from "ethers";
import { config } from "../../../runtime/config.js";
import { METHOD } from "../../../vpc/prices.js";
import { db } from "../../../storage/db.js";

function withinTolerance(received, expected) {
  const tol = expected * (config.AMOUNT_TOLERANCE_PCT / 100);
  return received + tol >= expected;
}

async function ensureStartBlock(order, provider) {
  if (order.start_block != null) return order.start_block;
  const current = await provider.getBlockNumber();
  const start = Math.max(current - 2000, 0);
  db.prepare("UPDATE orders SET start_block=? WHERE id=?").run(start, order.id);
  order.start_block = start;
  return start;
}

export async function checkETH(order) {
  if (!config.ETH_RPC_URL) throw new Error("Missing ETH_RPC_URL");
  const provider = new ethers.JsonRpcProvider(config.ETH_RPC_URL);

  const address = ethers.getAddress(order.deposit_address);
  const expected = Number(order.expected_crypto_amount);

  const startBlock = await ensureStartBlock(order, provider);
  const latest = await provider.getBlockNumber();

  if (order.pay_method === METHOD.ETH) {
    const window = 200;
    const from = Math.max(latest - window, startBlock);

    for (let b = latest; b >= from; b--) {
      const blk = await provider.getBlock(b, true);
      for (const tx of blk.transactions || []) {
        if (!tx.to) continue;
        if (ethers.getAddress(tx.to) !== address) continue;

        const received = Number(ethers.formatEther(tx.value));
        if (!withinTolerance(received, expected)) continue;

        const receipt = await provider.getTransactionReceipt(tx.hash);
        const conf = latest - b + 1;

        return {
          seen: true,
          confirmed: receipt?.status === 1 && conf >= 1,
          txid: tx.hash,
          received,
          conf
        };
      }
    }
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }

  const usdt = ethers.getAddress(config.USDT_ERC20_CONTRACT);
  const iface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
  const topic0 = iface.getEvent("Transfer").topicHash;

  const filter = {
    address: usdt,
    fromBlock: startBlock,
    toBlock: latest,
    topics: [topic0, null, ethers.zeroPadValue(address, 32)]
  };

  const logs = await provider.getLogs(filter);

  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    const parsed = iface.parseLog(log);
    const raw = parsed.args.value;
    const received = Number(ethers.formatUnits(raw, 6));
    if (!withinTolerance(received, expected)) continue;

    const receipt = await provider.getTransactionReceipt(log.transactionHash);
    const conf = latest - log.blockNumber + 1;

    return {
      seen: true,
      confirmed: receipt?.status === 1 && conf >= 1,
      txid: log.transactionHash,
      received,
      conf
    };
  }

  return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
}
