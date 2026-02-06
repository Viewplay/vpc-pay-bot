import { config } from "../../../runtime/config.js";

export async function checkTRON(order) {
  try {
    const fullNode = String(config.TRON_FULL_NODE || "").trim();
    const solidityNode = String(config.TRON_SOLIDITY_NODE || fullNode).trim();
    const eventServer = String(config.TRON_EVENT_SERVER || fullNode).trim();

    // Pas configuré => on skip sans spam
    if (!fullNode || !/^https?:\/\//i.test(fullNode)) {
      return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
    }

    const mod = await import("tronweb");
    const TronWeb = mod?.default?.TronWeb || mod?.TronWeb || mod?.default || mod;

    if (typeof TronWeb !== "function") {
      return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
    }

    const tron = new TronWeb({ fullHost: fullNode, fullNode, solidityNode, eventServer });

    // TODO: implémentation TRC20 réelle plus tard
    // Pour l’instant: no-op propre (évite "TronWeb is not a constructor")
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  } catch {
    return { seen: false, confirmed: false, txid: null, received: 0, conf: 0 };
  }
}
