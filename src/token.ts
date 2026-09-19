/** The only place to change the coin. Do this before `npm run create`. */

export const TOKEN = {
  name: "Pinch",
  symbol: "PINCH",
  decimals: 6,
  /** Whole coins. Not the tiny on-chain units. */
  supply: 1_000_000_000n,
  description:
    "A fair crab coin. One billion coins exist. Nobody can print more, freeze a wallet, or rename it. A meme, not a promise.",
  /**
   * Picture + description file. Stays valid once this repo's main branch has the file.
   * On-chain name and symbol do not depend on this link.
   */
  uri: "https://raw.githubusercontent.com/aithx/pinch-token/main/metadata/pinch.json",
} as const;

const U64_MAX = 18446744073709551615n;

export function assertTokenConfig(token: typeof TOKEN = TOKEN): void {
  if (token.name.length < 1 || token.name.length > 32) {
    throw new Error("Name must be 1 to 32 characters.");
  }
  if (token.symbol.length < 1 || token.symbol.length > 10) {
    throw new Error("Symbol must be 1 to 10 characters.");
  }
  if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 9) {
    throw new Error("Decimals must be a whole number from 0 to 9.");
  }
  if (token.supply <= 0n) {
    throw new Error("Supply must be at least 1.");
  }
  if (token.uri.length > 200) {
    throw new Error("Metadata link must be 200 characters or fewer.");
  }
  const raw = rawSupply(token.supply, token.decimals);
  if (raw > U64_MAX) {
    throw new Error("Supply is too big for Solana.");
  }
}

export function rawSupply(supply = TOKEN.supply, decimals = TOKEN.decimals): bigint {
  return supply * 10n ** BigInt(decimals);
}
