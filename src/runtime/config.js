function first(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

export const config = {
  PORT: Number(process.env.PORT || 3000),

  // Keep both names for compatibility
  VPC_PRICE_USD: Number(process.env.VPC_PRICE_USD || process.env.VPC_PRICE || 0.0019),

  SOLANA_RPC_URL: first(process.env.SOLANA_RPC_URL, process.env.RPC_ENDPOINT) || "https://api.mainnet-beta.solana.com",
  VPC_MINT: first(process.env.VPC_MINT) || "ZDW8ru7pQnsNZaKb75291mrkeioHF1s1PSJtnW653qZ",
  VPC_DECIMALS: 6,

  // SPL USDT mint (mainnet)
  USDT_SOL_MINT: first(process.env.USDT_SOL_MINT) || "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",

  // EVM
  ETH_RPC_URL: first(process.env.ETH_RPC_URL),
  USDT_ERC20_CONTRACT: first(process.env.USDT_ERC20_CONTRACT) || "0xdAC17F958D2ee523a2206206994597C13D831ec7",

  // TRON (aliases)
  TRON_FULL_HOST: first(process.env.TRON_FULL_HOST, process.env.TRON_RPC_URL) || "https://api.trongrid.io",
  TRON_API_KEY: first(process.env.TRON_API_KEY),
  USDT_TRC20_CONTRACT: first(process.env.USDT_TRC20_CONTRACT) || "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",

  // BTC (Esplora)
  BTC_API_BASE: first(process.env.BTC_API_BASE) || "https://blockstream.info/api",

  WORKER_INTERVAL_MS: Number(process.env.WORKER_INTERVAL_MS || process.env.WORKER_INTERVAL || 20000),
  AMOUNT_TOLERANCE_PCT: Number(process.env.AMOUNT_TOLERANCE_PCT || 0.5),
};
