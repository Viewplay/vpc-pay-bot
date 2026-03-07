export const METHOD = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT_TRC20: "usdt_trc20",
  USDT_ERC20: "usdt_erc20",
  USDT_SOL: "usdt_sol"
};

export function priceForMethodUSD(method) {
  switch (method) {
    case METHOD.BTC:
      return { coingeckoId: "bitcoin", currencyLabel: "BTC" };
    case METHOD.ETH:
      return { coingeckoId: "ethereum", currencyLabel: "ETH" };
    case METHOD.SOL:
      return { coingeckoId: "solana", currencyLabel: "SOL" };
    case METHOD.USDT_TRC20:
    case METHOD.USDT_ERC20:
    case METHOD.USDT_SOL:
      return { coingeckoId: "tether", currencyLabel: "USDT" };
    default:
      throw new Error(`Unknown method ${method}`);
  }
}
