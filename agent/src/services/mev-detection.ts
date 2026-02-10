import { Connection, PublicKey } from "@solana/web3.js";

export interface MevReport {
  targetAddress: string;
  analyzedTxCount: number;
  suspiciousPatterns: MevPattern[];
  mevRiskScore: number; // 0-100
  timestamp: number;
  analyst: string;
}

interface MevPattern {
  type: "sandwich" | "frontrun" | "backrun" | "arbitrage";
  confidence: number; // 0-100
  detail: string;
  txSignatures: string[];
}

export async function detectMev(
  connection: Connection,
  targetAddress: string,
  analystWallet: string
): Promise<MevReport> {
  const pubkey = new PublicKey(targetAddress);
  const patterns: MevPattern[] = [];
  let analyzedTxCount = 0;

  try {
    const sigs = await connection.getSignaturesForAddress(pubkey, {
      limit: 50,
    });
    analyzedTxCount = sigs.length;

    if (sigs.length < 2) {
      return {
        targetAddress,
        analyzedTxCount,
        suspiciousPatterns: [],
        mevRiskScore: 0,
        timestamp: Date.now(),
        analyst: analystWallet,
      };
    }

    // Analyze transaction timing for rapid sequences (potential sandwich attacks)
    const withTime = sigs
      .filter((s) => s.blockTime)
      .sort((a, b) => a.blockTime! - b.blockTime!);

    // Check for rapid tx pairs in the same slot (sandwich indicator)
    const slotGroups = new Map<number, typeof sigs>();
    for (const sig of sigs) {
      if (!sig.slot) continue;
      const group = slotGroups.get(sig.slot) || [];
      group.push(sig);
      slotGroups.set(sig.slot, group);
    }

    for (const [slot, group] of slotGroups) {
      if (group.length >= 3) {
        patterns.push({
          type: "sandwich",
          confidence: Math.min(90, 40 + group.length * 15),
          detail: `${group.length} transactions in slot ${slot} — possible sandwich pattern`,
          txSignatures: group.map((s) => s.signature).slice(0, 3),
        });
      }
    }

    // Check for rapid consecutive transactions (frontrunning)
    for (let i = 1; i < withTime.length; i++) {
      const dt = withTime[i].blockTime! - withTime[i - 1].blockTime!;
      if (dt === 0 && withTime[i].slot !== withTime[i - 1].slot) {
        patterns.push({
          type: "frontrun",
          confidence: 55,
          detail: `Same-second transactions across slots — possible frontrun`,
          txSignatures: [
            withTime[i - 1].signature,
            withTime[i].signature,
          ],
        });
      }
    }

    // Check for high error rates (failed arbitrage attempts)
    const failedTxs = sigs.filter((s) => s.err !== null);
    if (failedTxs.length > sigs.length * 0.3 && failedTxs.length > 3) {
      patterns.push({
        type: "arbitrage",
        confidence: 45,
        detail: `${failedTxs.length}/${sigs.length} txs failed — possible failed arb attempts`,
        txSignatures: failedTxs.map((s) => s.signature).slice(0, 3),
      });
    }
  } catch (err) {
    console.error(`[mev-detection] Error analyzing ${targetAddress}:`, err);
  }

  const mevRiskScore =
    patterns.length === 0
      ? 5
      : Math.min(
          100,
          Math.round(
            patterns.reduce((sum, p) => sum + p.confidence, 0) /
              patterns.length
          )
        );

  return {
    targetAddress,
    analyzedTxCount,
    suspiciousPatterns: patterns,
    mevRiskScore,
    timestamp: Date.now(),
    analyst: analystWallet,
  };
}
