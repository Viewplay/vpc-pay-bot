export const config = {
  PORT: Number(process.env.PORT || 3000),

  VPC_PRICE_USD: Number(process.env.VPC_PRICE_USD || 0.0019),

  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  VPC_MINT: process.env.VPC_MINT || "ZDW8ru7pQnsNZaKb75291mrkeioHF1s1PSJtnW653qZ",
  VPC_DECIMALS: 6,

  USDT_SOL_MINT: process.env.USDT_SOL_MINT || "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",

  ETH_RPC_URL: process.env.ETH_RPC_URL || "",
  USDT_ERC20_CONTRACT: process.env.USDT_ERC20_CONTRACT || "0xdAC17F958D2ee523a2206206994597C13D831ec7",

  TRON_FULL_HOST: process.env.TRON_FULL_HOST || "https://api.trongrid.io",
  TRON_API_KEY: process.env.TRON_API_KEY || "",
  USDT_TRC20_CONTRACT: process.env.USDT_TRC20_CONTRACT || "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",

  BTC_API_BASE: process.env.BTC_API_BASE || "https://blockstream.info/api",

  WORKER_INTERVAL_MS: Number(process.env.WORKER_INTERVAL_MS || 20000),
  AMOUNT_TOLERANCE_PCT: Number(process.env.AMOUNT_TOLERANCE_PCT || 0.5)
};
