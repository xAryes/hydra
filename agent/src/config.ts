import { Keypair, PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

export const PROGRAM_ID = new PublicKey(
  "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp"
);

// USDC on devnet (use devnet USDC mint)
export const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" // devnet USDC
);

export const SPAWN_THRESHOLD_LAMPORTS = 0.5 * 1e9; // 0.5 SOL earnings triggers spawn
export const REVENUE_SHARE_BPS = 2000; // 20% to parent
export const SERVICE_PRICE_LAMPORTS = 0.01 * 1e9; // 0.01 SOL per service call

export const SPECIALIZATIONS = [
  "token-risk-analysis",
  "wallet-behavior-scoring",
  "protocol-health-monitor",
  "mev-detection",
  "liquidity-analysis",
] as const;

export type Specialization = (typeof SPECIALIZATIONS)[number];

export function getConnection(): Connection {
  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) {
    return new Connection(
      `https://devnet.helius-rpc.com/?api-key=${heliusKey}`,
      "confirmed"
    );
  }
  return new Connection(clusterApiUrl("devnet"), "confirmed");
}

export function loadKeypair(filepath: string): Keypair {
  const raw = fs.readFileSync(filepath, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export function getRegistryPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID);
}

export function getAgentPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), wallet.toBuffer()],
    PROGRAM_ID
  );
}
