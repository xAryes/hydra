import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  PROGRAM_ID,
  REVENUE_SHARE_BPS,
  SPAWN_THRESHOLD_LAMPORTS,
  SERVICE_PRICE_LAMPORTS,
  SPECIALIZATIONS,
  getConnection,
  getRegistryPda,
  getAgentPda,
  type Specialization,
} from "./config.js";
import { analyzeTokenRisk, type TokenRiskReport } from "./services/token-risk.js";
import { analyzeWallet, type WalletReport } from "./services/wallet-analysis.js";
import {
  analyzeProtocolHealth,
  type ProtocolHealthReport,
} from "./services/protocol-health.js";
import { detectMev, type MevReport } from "./services/mev-detection.js";
import {
  analyzeLiquidity,
  type LiquidityReport,
} from "./services/liquidity-analysis.js";
import {
  recordEarningOnChain as anchorRecordEarning,
  spawnChildOnChain,
  distributeToParent,
} from "./anchor-client.js";

/** Validate a base58 Solana address. Throws on invalid input. */
function validateAddress(address: string, label: string): void {
  if (!address || typeof address !== "string") {
    throw new Error(`Missing '${label}' parameter`);
  }
  try {
    new PublicKey(address);
  } catch {
    throw new Error(`Invalid Solana address for '${label}': ${address}`);
  }
}

export type ServiceResult =
  | TokenRiskReport
  | WalletReport
  | ProtocolHealthReport
  | MevReport
  | LiquidityReport;

export interface AgentState {
  wallet: Keypair;
  specialization: Specialization;
  name: string;
  depth: number;
  parentWallet: PublicKey | null;
  totalEarned: number;
  serviceCallCount: number;
  children: ChildAgent[];
  isRoot: boolean;
  port: number;
}

interface ChildAgent {
  wallet: PublicKey;
  name: string;
  specialization: Specialization;
  spawnedAt: number;
}

export class HydraAgent {
  private state: AgentState;
  private connection: Connection;
  private provider: AnchorProvider;

  constructor(state: AgentState) {
    this.state = state;
    this.connection = getConnection();
    const wallet = new Wallet(state.wallet);
    this.provider = new AnchorProvider(this.connection, wallet, {
      commitment: "confirmed",
    });
  }

  get publicKey(): PublicKey {
    return this.state.wallet.publicKey;
  }

  get info() {
    return {
      name: this.state.name,
      wallet: this.publicKey.toBase58(),
      specialization: this.state.specialization,
      depth: this.state.depth,
      totalEarned: this.state.totalEarned,
      serviceCallCount: this.state.serviceCallCount,
      childrenCount: this.state.children.length,
      children: this.state.children.map((c) => ({
        wallet: c.wallet.toBase58(),
        name: c.name,
        specialization: c.specialization,
        spawnedAt: c.spawnedAt,
      })),
      isRoot: this.state.isRoot,
      port: this.state.port,
      parentWallet: this.state.parentWallet?.toBase58() || null,
    };
  }

  /** Process a service request and record earnings */
  async handleServiceCall(
    params: Record<string, string>
  ): Promise<ServiceResult> {
    let result: ServiceResult;

    switch (this.state.specialization) {
      case "token-risk-analysis": {
        const mint = params.mint;
        validateAddress(mint, "mint");
        result = await analyzeTokenRisk(
          this.connection,
          mint,
          this.publicKey.toBase58()
        );
        break;
      }
      case "wallet-behavior-scoring": {
        const address = params.address;
        validateAddress(address, "address");
        result = await analyzeWallet(
          this.connection,
          address,
          this.publicKey.toBase58()
        );
        break;
      }
      case "protocol-health-monitor": {
        const programId = params.programId || params.program;
        validateAddress(programId, "programId");
        result = await analyzeProtocolHealth(
          this.connection,
          programId,
          this.publicKey.toBase58()
        );
        break;
      }
      case "mev-detection": {
        const target = params.address || params.target;
        validateAddress(target, "address");
        result = await detectMev(
          this.connection,
          target,
          this.publicKey.toBase58()
        );
        break;
      }
      case "liquidity-analysis": {
        const pool = params.pool || params.poolAddress;
        validateAddress(pool, "pool");
        result = await analyzeLiquidity(
          this.connection,
          pool,
          this.publicKey.toBase58()
        );
        break;
      }
      default:
        throw new Error(
          `Specialization '${this.state.specialization}' not yet implemented`
        );
    }

    // Record earning
    this.state.totalEarned += SERVICE_PRICE_LAMPORTS;
    this.state.serviceCallCount++;

    // Record on-chain (best effort)
    try {
      await anchorRecordEarning(
        this.state.wallet,
        new BN(SERVICE_PRICE_LAMPORTS)
      );
    } catch (err) {
      console.log(
        `[${this.state.name}] On-chain recording failed (non-critical):`,
        (err as Error).message
      );
    }

    // Distribute revenue to parent (best effort)
    try {
      await this.distributeRevenue(SERVICE_PRICE_LAMPORTS);
    } catch (err) {
      console.log(
        `[${this.state.name}] Revenue distribution failed (non-critical):`,
        (err as Error).message
      );
    }

    // Check if we should spawn
    await this.checkAndSpawn();

    return result;
  }

  /** Distribute revenue share to parent agent */
  private async distributeRevenue(earningAmount: number): Promise<void> {
    if (!this.state.parentWallet) return; // Root agents have no parent

    const shareAmount = Math.floor(
      (earningAmount * REVENUE_SHARE_BPS) / 10000
    );
    if (shareAmount === 0) return;

    console.log(
      `[${this.state.name}] Distributing ${shareAmount / LAMPORTS_PER_SOL} SOL (${REVENUE_SHARE_BPS / 100}%) to parent`
    );

    await distributeToParent(
      this.state.wallet,
      this.state.parentWallet,
      new BN(shareAmount)
    );
  }

  /** Check earnings threshold and spawn a child if ready */
  async checkAndSpawn(): Promise<void> {
    if (this.state.totalEarned < SPAWN_THRESHOLD_LAMPORTS) return;
    if (this.state.depth >= 4) return; // Max depth safety
    if (this.state.children.length >= 3) return; // Max 3 children per agent

    // Pick a specialization the parent doesn't already have covered
    const usedSpecs = new Set(this.state.children.map((c) => c.specialization));
    usedSpecs.add(this.state.specialization);
    const available = SPECIALIZATIONS.filter((s) => !usedSpecs.has(s));
    if (available.length === 0) return;

    const childSpec = available[0];
    const childName = `hydra-${childSpec.split("-")[0]}-d${this.state.depth + 1}`;

    console.log(
      `\n🧬 [${this.state.name}] SPAWNING CHILD: ${childName} (${childSpec})`
    );
    console.log(
      `   Earned ${this.state.totalEarned / LAMPORTS_PER_SOL} SOL — threshold reached!`
    );

    try {
      const child = await this.spawnChild(childName, childSpec);
      this.state.children.push(child);
      // Reset earnings counter for next spawn
      this.state.totalEarned = 0;
      console.log(
        `✅ [${this.state.name}] Child spawned: ${child.wallet.toBase58()}`
      );
    } catch (err) {
      console.error(
        `❌ [${this.state.name}] Spawn failed:`,
        (err as Error).message
      );
    }
  }

  /** Create a new child agent: generate keypair, fund it, register on-chain */
  private async spawnChild(
    name: string,
    specialization: Specialization
  ): Promise<ChildAgent> {
    const childKeypair = Keypair.generate();

    // Fund child with SOL for rent + operations (if we have on-chain funds)
    const fundingAmount = 0.05 * LAMPORTS_PER_SOL;
    try {
      const balance = await this.connection.getBalance(this.publicKey);
      if (balance >= fundingAmount + 0.01 * LAMPORTS_PER_SOL) {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: this.publicKey,
            toPubkey: childKeypair.publicKey,
            lamports: fundingAmount,
          })
        );
        await sendAndConfirmTransaction(this.connection, tx, [this.state.wallet]);
        console.log(
          `   Funded child ${childKeypair.publicKey.toBase58()} with ${fundingAmount / LAMPORTS_PER_SOL} SOL`
        );
      } else {
        console.log(
          `   Child ${childKeypair.publicKey.toBase58()} spawned (unfunded — needs SOL for on-chain ops)`
        );
      }
    } catch (err) {
      console.log(`   Funding skipped: ${(err as Error).message}`);
    }

    // Register on-chain via Anchor (best effort)
    try {
      await spawnChildOnChain(
        this.state.wallet,
        childKeypair.publicKey,
        name,
        specialization,
        REVENUE_SHARE_BPS
      );
    } catch (err) {
      console.log(
        `   On-chain registration pending: ${(err as Error).message}`
      );
    }

    // Start the child agent as a new in-process service
    const childPort = this.state.port + this.state.children.length + 1;
    startChildAgent({
      wallet: childKeypair,
      specialization,
      name,
      depth: this.state.depth + 1,
      parentWallet: this.publicKey,
      totalEarned: 0,
      serviceCallCount: 0,
      children: [],
      isRoot: false,
      port: childPort,
    });

    return {
      wallet: childKeypair.publicKey,
      name,
      specialization,
      spawnedAt: Date.now(),
    };
  }
}

// Global registry of running agents
export const runningAgents: Map<string, HydraAgent> = new Map();

/** Start a child agent on a new port */
function startChildAgent(state: AgentState): void {
  const agent = new HydraAgent(state);
  runningAgents.set(agent.publicKey.toBase58(), agent);
  console.log(
    `   Child agent ${state.name} running (in-process, port shared with parent)`
  );
}
