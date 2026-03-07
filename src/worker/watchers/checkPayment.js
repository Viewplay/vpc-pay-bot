import { METHOD } from "../../vpc/prices.js";
import { checkBTC } from "./chains/btc.js";
import { checkETH } from "./chains/eth.js";
import { checkSOL } from "./chains/sol.js";
import { checkTRON } from "./chains/tron.js";

export async function checkPayment(order) {
  switch (order.pay_method) {
    case METHOD.BTC:
      return checkBTC(order);
    case METHOD.ETH:
    case METHOD.USDT_ERC20:
      return checkETH(order);
    case METHOD.SOL:
    case METHOD.USDT_SOL:
      return checkSOL(order);
    case METHOD.USDT_TRC20:
      return checkTRON(order);
    default:
      throw new Error(`Unknown pay_method ${order.pay_method}`);
  }
}
