import { Connection, PublicKey } from "@solana/web3.js";

export interface TokenRiskReport {
  mint: string;
  name: string;
  symbol: string;
  riskScore: number; // 0-100, higher = riskier
  factors: RiskFactor[];
  timestamp: number;
  analyst: string; // agent wallet pubkey
}

interface RiskFactor {
  name: string;
  score: number; // 0-100
  weight: number;
  detail: string;
}

export async function analyzeTokenRisk(
  connection: Connection,
  mintAddress: string,
  analystWallet: string
): Promise<TokenRiskReport> {
  const mint = new PublicKey(mintAddress);
  const factors: RiskFactor[] = [];

  // Factor 1: Account existence and validity
  try {
    const accountInfo = await connection.getAccountInfo(mint);
    if (!accountInfo) {
      factors.push({
        name: "account_exists",
        score: 100,
        weight: 0.3,
        detail: "Token mint account does not exist",
      });
    } else {
      factors.push({
        name: "account_exists",
        score: 0,
        weight: 0.3,
        detail: `Mint account found, ${accountInfo.lamports / 1e9} SOL rent`,
      });
    }
  } catch {
    factors.push({
      name: "account_exists",
      score: 80,
      weight: 0.3,
      detail: "Failed to fetch mint account",
    });
  }

  // Factor 2: Token supply concentration
  try {
    const supply = await connection.getTokenSupply(mint);
    const decimals = supply.value.decimals;
    const totalSupply = Number(supply.value.amount);

    // Get largest holders
    const largest = await connection.getTokenLargestAccounts(mint);
    if (largest.value.length > 0) {
      const topHolder = Number(largest.value[0].amount);
      const concentration =
        totalSupply > 0 ? (topHolder / totalSupply) * 100 : 100;

      let score = 0;
      let detail = "";
      if (concentration > 90) {
        score = 95;
        detail = `Top holder owns ${concentration.toFixed(1)}% — extreme concentration`;
      } else if (concentration > 50) {
        score = 70;
        detail = `Top holder owns ${concentration.toFixed(1)}% — high concentration`;
      } else if (concentration > 20) {
        score = 30;
        detail = `Top holder owns ${concentration.toFixed(1)}% — moderate distribution`;
      } else {
        score = 10;
        detail = `Top holder owns ${concentration.toFixed(1)}% — well distributed`;
      }

      factors.push({
        name: "holder_concentration",
        score,
        weight: 0.35,
        detail,
      });
    }
  } catch {
    factors.push({
      name: "holder_concentration",
      score: 50,
      weight: 0.35,
      detail: "Could not analyze holder distribution",
    });
  }

  // Factor 3: Recent transaction activity
  try {
    const sigs = await connection.getSignaturesForAddress(mint, { limit: 100 });
    const now = Date.now() / 1000;
    const recentCount = sigs.filter(
      (s) => s.blockTime && now - s.blockTime < 86400
    ).length;

    let score = 0;
    let detail = "";
    if (recentCount === 0) {
      score = 60;
      detail = "No transactions in last 24h — possibly abandoned";
    } else if (recentCount < 5) {
      score = 40;
      detail = `${recentCount} transactions in last 24h — low activity`;
    } else if (recentCount < 50) {
      score = 15;
      detail = `${recentCount} transactions in last 24h — moderate activity`;
    } else {
      score = 5;
      detail = `${recentCount} transactions in last 24h — high activity`;
    }

    factors.push({
      name: "transaction_activity",
      score,
      weight: 0.2,
      detail,
    });
  } catch {
    factors.push({
      name: "transaction_activity",
      score: 50,
      weight: 0.2,
      detail: "Could not analyze transaction activity",
    });
  }

  // Factor 4: Account age (based on recent signatures)
  try {
    const sigs = await connection.getSignaturesForAddress(mint, { limit: 1 });
    if (sigs.length > 0 && sigs[0].blockTime) {
      const ageHours = (Date.now() / 1000 - sigs[0].blockTime) / 3600;
      let score = 0;
      let detail = "";
      if (ageHours < 1) {
        score = 80;
        detail = "Token is less than 1 hour old — very new";
      } else if (ageHours < 24) {
        score = 50;
        detail = "Token is less than 24 hours old";
      } else if (ageHours < 168) {
        score = 20;
        detail = "Token is less than 1 week old";
      } else {
        score = 5;
        detail = `Token has been active for ${Math.floor(ageHours / 24)} days`;
      }

      factors.push({
        name: "token_age",
        score,
        weight: 0.15,
        detail,
      });
    }
  } catch {
    factors.push({
      name: "token_age",
      score: 50,
      weight: 0.15,
      detail: "Could not determine token age",
    });
  }

  // Calculate weighted risk score
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const riskScore = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight
  );

  return {
    mint: mintAddress,
    name: "Unknown", // Would need metadata lookup
    symbol: "???",
    riskScore,
    factors,
    timestamp: Date.now(),
    analyst: analystWallet,
  };
}
