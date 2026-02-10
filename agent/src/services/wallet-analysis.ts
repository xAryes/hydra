import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

export interface WalletReport {
  address: string;
  balanceSol: number;
  tokenAccounts: number;
  recentTxCount: number;
  activityScore: number; // 0-100
  riskIndicators: string[];
  timestamp: number;
  analyst: string;
}

export async function analyzeWallet(
  connection: Connection,
  address: string,
  analystWallet: string
): Promise<WalletReport> {
  const pubkey = new PublicKey(address);
  const riskIndicators: string[] = [];

  // Get balance
  const balance = await connection.getBalance(pubkey);
  const balanceSol = balance / LAMPORTS_PER_SOL;

  if (balanceSol === 0) riskIndicators.push("zero_balance");
  if (balanceSol > 10000) riskIndicators.push("whale_wallet");

  // Get token accounts
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  });

  if (tokenAccounts.value.length > 50) riskIndicators.push("many_token_accounts");
  if (tokenAccounts.value.length === 0) riskIndicators.push("no_tokens");

  // Get recent transactions
  const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 100 });
  const now = Date.now() / 1000;
  const last24h = sigs.filter((s) => s.blockTime && now - s.blockTime < 86400);
  const lastHour = sigs.filter((s) => s.blockTime && now - s.blockTime < 3600);

  if (lastHour.length > 50) riskIndicators.push("high_frequency_trading");
  if (last24h.length === 0 && sigs.length > 0) riskIndicators.push("inactive_24h");

  // Check for failed transactions
  const failedCount = sigs.filter((s) => s.err !== null).length;
  const failureRate = sigs.length > 0 ? failedCount / sigs.length : 0;
  if (failureRate > 0.5) riskIndicators.push("high_failure_rate");

  // Activity score: higher = more active and healthy
  let activityScore = 50;
  if (balanceSol > 0) activityScore += 10;
  if (tokenAccounts.value.length > 0) activityScore += 10;
  if (last24h.length > 5) activityScore += 15;
  if (failureRate < 0.1) activityScore += 10;
  if (riskIndicators.length === 0) activityScore += 5;
  activityScore = Math.min(100, Math.max(0, activityScore));

  return {
    address,
    balanceSol,
    tokenAccounts: tokenAccounts.value.length,
    recentTxCount: last24h.length,
    activityScore,
    riskIndicators,
    timestamp: Date.now(),
    analyst: analystWallet,
  };
}
