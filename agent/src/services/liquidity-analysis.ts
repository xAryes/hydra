import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

export interface LiquidityReport {
  poolAddress: string;
  tokenA: string;
  tokenB: string;
  tvlEstimateSol: number;
  recentSwapCount: number;
  priceImpactScore: number; // 0-100 (lower = better liquidity)
  liquidityScore: number; // 0-100 (higher = better)
  factors: LiquidityFactor[];
  timestamp: number;
  analyst: string;
}

interface LiquidityFactor {
  name: string;
  score: number;
  detail: string;
}

// Known Raydium/Orca pool program IDs on devnet/mainnet
const DEX_PROGRAMS = [
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // Raydium AMM
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", // Orca Whirlpool
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", // Raydium CLMM
];

export async function analyzeLiquidity(
  connection: Connection,
  poolAddress: string,
  analystWallet: string
): Promise<LiquidityReport> {
  const poolPubkey = new PublicKey(poolAddress);
  const factors: LiquidityFactor[] = [];
  let tvlEstimateSol = 0;
  let recentSwapCount = 0;

  // Factor 1: Pool account existence and data
  try {
    const info = await connection.getAccountInfo(poolPubkey);
    if (!info) {
      factors.push({
        name: "pool_exists",
        score: 0,
        detail: "Pool account not found on-chain",
      });
    } else {
      const isKnownDex = DEX_PROGRAMS.includes(info.owner.toBase58());
      factors.push({
        name: "pool_exists",
        score: isKnownDex ? 100 : 60,
        detail: isKnownDex
          ? `Pool owned by known DEX program (${info.data.length} bytes)`
          : `Pool exists but unknown owner: ${info.owner.toBase58().slice(0, 8)}...`,
      });

      // Estimate TVL from SOL balance of the pool
      tvlEstimateSol = info.lamports / LAMPORTS_PER_SOL;
    }
  } catch {
    factors.push({
      name: "pool_exists",
      score: 0,
      detail: "Failed to fetch pool account",
    });
  }

  // Factor 2: TVL estimate
  {
    let score = 0;
    if (tvlEstimateSol > 1000) score = 100;
    else if (tvlEstimateSol > 100) score = 80;
    else if (tvlEstimateSol > 10) score = 50;
    else if (tvlEstimateSol > 1) score = 25;
    else if (tvlEstimateSol > 0) score = 10;

    factors.push({
      name: "tvl_estimate",
      score,
      detail: `Estimated pool TVL: ${tvlEstimateSol.toFixed(2)} SOL`,
    });
  }

  // Factor 3: Recent swap activity
  try {
    const sigs = await connection.getSignaturesForAddress(poolPubkey, {
      limit: 100,
    });
    const now = Date.now() / 1000;
    const last24h = sigs.filter(
      (s) => s.blockTime && now - s.blockTime < 86400
    );
    recentSwapCount = last24h.length;

    let score = 0;
    if (recentSwapCount > 50) score = 100;
    else if (recentSwapCount > 20) score = 75;
    else if (recentSwapCount > 5) score = 40;
    else if (recentSwapCount > 0) score = 15;

    factors.push({
      name: "swap_activity",
      score,
      detail: `${recentSwapCount} transactions in last 24h`,
    });
  } catch {
    factors.push({
      name: "swap_activity",
      score: 0,
      detail: "Could not fetch transaction history",
    });
  }

  // Factor 4: Token accounts associated with pool (depth of liquidity)
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      poolPubkey,
      {
        programId: new PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ),
      }
    );

    const count = tokenAccounts.value.length;
    let score = count >= 2 ? 80 : count === 1 ? 40 : 0;

    factors.push({
      name: "token_accounts",
      score,
      detail: `Pool holds ${count} token account(s)`,
    });
  } catch {
    factors.push({
      name: "token_accounts",
      score: 0,
      detail: "Could not enumerate pool token accounts",
    });
  }

  const liquidityScore = Math.round(
    factors.reduce((sum, f) => sum + f.score, 0) / factors.length
  );

  // Price impact is inverse of liquidity
  const priceImpactScore = Math.max(0, 100 - liquidityScore);

  return {
    poolAddress,
    tokenA: "unknown",
    tokenB: "unknown",
    tvlEstimateSol,
    recentSwapCount,
    priceImpactScore,
    liquidityScore,
    factors,
    timestamp: Date.now(),
    analyst: analystWallet,
  };
}
