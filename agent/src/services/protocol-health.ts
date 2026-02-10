import { Connection, PublicKey } from "@solana/web3.js";

export interface ProtocolHealthReport {
  programId: string;
  accountCount: number;
  recentTxVolume: number; // txs in last 24h
  errorRate: number; // 0-1
  healthScore: number; // 0-100
  factors: HealthFactor[];
  timestamp: number;
  analyst: string;
}

interface HealthFactor {
  name: string;
  score: number;
  detail: string;
}

export async function analyzeProtocolHealth(
  connection: Connection,
  programAddress: string,
  analystWallet: string
): Promise<ProtocolHealthReport> {
  const programId = new PublicKey(programAddress);
  const factors: HealthFactor[] = [];
  let accountCount = 0;
  let recentTxVolume = 0;
  let errorRate = 0;

  // Factor 1: Program existence
  try {
    const info = await connection.getAccountInfo(programId);
    if (!info) {
      factors.push({
        name: "program_exists",
        score: 0,
        detail: "Program account not found on-chain",
      });
    } else if (!info.executable) {
      factors.push({
        name: "program_exists",
        score: 30,
        detail: "Account exists but is not executable",
      });
    } else {
      factors.push({
        name: "program_exists",
        score: 100,
        detail: `Executable program found, ${info.data.length} bytes`,
      });
    }
  } catch {
    factors.push({
      name: "program_exists",
      score: 0,
      detail: "Failed to fetch program account",
    });
  }

  // Factor 2: Recent transaction volume
  try {
    const sigs = await connection.getSignaturesForAddress(programId, {
      limit: 100,
    });
    const now = Date.now() / 1000;
    const last24h = sigs.filter(
      (s) => s.blockTime && now - s.blockTime < 86400
    );
    recentTxVolume = last24h.length;

    const failed = sigs.filter((s) => s.err !== null);
    errorRate = sigs.length > 0 ? failed.length / sigs.length : 0;

    let score = 0;
    if (recentTxVolume > 50) score = 100;
    else if (recentTxVolume > 20) score = 80;
    else if (recentTxVolume > 5) score = 50;
    else if (recentTxVolume > 0) score = 25;

    factors.push({
      name: "tx_volume",
      score,
      detail: `${recentTxVolume} transactions in last 24h (${sigs.length} total recent)`,
    });
  } catch {
    factors.push({
      name: "tx_volume",
      score: 0,
      detail: "Could not fetch transaction history",
    });
  }

  // Factor 3: Error rate
  {
    let score = 100;
    if (errorRate > 0.5) score = 10;
    else if (errorRate > 0.2) score = 40;
    else if (errorRate > 0.05) score = 70;

    factors.push({
      name: "error_rate",
      score,
      detail: `${(errorRate * 100).toFixed(1)}% transaction failure rate`,
    });
  }

  // Factor 4: Program accounts (use getProgramAccounts with dataSize filter)
  try {
    // Fetch a small sample to estimate account count
    const accounts = await connection.getProgramAccounts(programId, {
      dataSlice: { offset: 0, length: 0 },
    });
    accountCount = accounts.length;

    let score = 0;
    if (accountCount > 100) score = 100;
    else if (accountCount > 20) score = 75;
    else if (accountCount > 5) score = 50;
    else if (accountCount > 0) score = 25;

    factors.push({
      name: "account_count",
      score,
      detail: `${accountCount} program-owned accounts`,
    });
  } catch {
    factors.push({
      name: "account_count",
      score: 0,
      detail: "Could not enumerate program accounts",
    });
  }

  const healthScore = Math.round(
    factors.reduce((sum, f) => sum + f.score, 0) / factors.length
  );

  return {
    programId: programAddress,
    accountCount,
    recentTxVolume,
    errorRate,
    healthScore,
    factors,
    timestamp: Date.now(),
    analyst: analystWallet,
  };
}
