import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import {
  PROGRAM_ID,
  getConnection,
  getRegistryPda,
  getAgentPda,
} from "./config.js";

// Track recent transaction signatures for the dashboard
export const recentTxSignatures: { sig: string; type: string; ts: number }[] =
  [];
function trackTx(sig: string, type: string) {
  recentTxSignatures.unshift({ sig, type, ts: Date.now() });
  if (recentTxSignatures.length > 50) recentTxSignatures.pop();
}

/** Retry an async function with exponential backoff */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(
          `[anchor] ${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// Load IDL
const idlPath = path.resolve(import.meta.dir, "../../idl/hydra.json");
const IDL = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

function getProvider(wallet: Keypair): AnchorProvider {
  const connection = getConnection();
  return new AnchorProvider(connection, new Wallet(wallet), {
    commitment: "confirmed",
  });
}

function getProgram(wallet: Keypair): Program {
  const provider = getProvider(wallet);
  return new Program(IDL, provider);
}

/** Initialize the Hydra registry (idempotent — skips if already exists) */
export async function initializeRegistry(
  authority: Keypair
): Promise<string | null> {
  try {
    const program = getProgram(authority);
    const [registryPda] = getRegistryPda();

    // Check if already initialized
    try {
      const existing = await program.account.registry.fetch(registryPda);
      if (existing) {
        console.log("[anchor] Registry already initialized");
        return null;
      }
    } catch {
      // Not found — proceed to initialize
    }

    const tx = await withRetry(
      () =>
        program.methods
          .initialize()
          .accounts({ authority: authority.publicKey })
          .signers([authority])
          .rpc(),
      "initializeRegistry"
    );

    console.log(`[anchor] Registry initialized: ${tx}`);
    trackTx(tx, "initialize");
    return tx;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("already in use") || msg.includes("custom program error: 0x0")) {
      console.log("[anchor] Registry already initialized (caught error)");
      return null;
    }
    console.error("[anchor] initializeRegistry failed:", msg);
    return null;
  }
}

/** Register the root agent on-chain (idempotent) */
export async function registerRootAgent(
  authority: Keypair,
  wallet: PublicKey,
  name: string,
  specialization: string
): Promise<string | null> {
  try {
    const program = getProgram(authority);
    const [agentPda] = getAgentPda(wallet);

    // Check if already registered
    try {
      const existing = await program.account.agentAccount.fetch(agentPda);
      if (existing) {
        console.log(`[anchor] Root agent already registered: ${wallet.toBase58()}`);
        return null;
      }
    } catch {
      // Not found — proceed
    }

    const tx = await withRetry(
      () =>
        program.methods
          .registerRootAgent(name, specialization)
          .accounts({ wallet, authority: authority.publicKey })
          .signers([authority])
          .rpc(),
      "registerRootAgent"
    );

    console.log(`[anchor] Root agent registered: ${tx}`);
    trackTx(tx, "register_root_agent");
    return tx;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("already in use")) {
      console.log("[anchor] Root agent already registered (caught error)");
      return null;
    }
    console.error("[anchor] registerRootAgent failed:", msg);
    return null;
  }
}

/** Spawn a child agent on-chain */
export async function spawnChildOnChain(
  parentWallet: Keypair,
  childWallet: PublicKey,
  name: string,
  specialization: string,
  revShareBps: number
): Promise<string | null> {
  try {
    const program = getProgram(parentWallet);

    const tx = await withRetry(
      () =>
        program.methods
          .spawnChild(name, specialization, revShareBps)
          .accounts({ parentWallet: parentWallet.publicKey, childWallet })
          .signers([parentWallet])
          .rpc(),
      "spawnChild"
    );

    console.log(`[anchor] Child spawned on-chain: ${tx}`);
    trackTx(tx, "spawn_child");
    return tx;
  } catch (err) {
    console.error("[anchor] spawnChildOnChain failed:", (err as Error).message);
    return null;
  }
}

/** Record an earning on-chain */
export async function recordEarningOnChain(
  wallet: Keypair,
  amount: BN
): Promise<string | null> {
  try {
    const program = getProgram(wallet);

    const tx = await withRetry(
      () =>
        program.methods
          .recordEarning(amount)
          .accounts({ wallet: wallet.publicKey })
          .signers([wallet])
          .rpc(),
      "recordEarning"
    );

    console.log(
      `[anchor] Earning recorded: ${amount.toNumber() / LAMPORTS_PER_SOL} SOL — ${tx}`
    );
    trackTx(tx, "record_earning");
    return tx;
  } catch (err) {
    console.error("[anchor] recordEarningOnChain failed:", (err as Error).message);
    return null;
  }
}

/** Distribute revenue from child to parent on-chain */
export async function distributeToParent(
  childWallet: Keypair,
  parentWallet: PublicKey,
  amount: BN
): Promise<string | null> {
  try {
    const program = getProgram(childWallet);

    const tx = await withRetry(
      () =>
        program.methods
          .distributeToParent(amount)
          .accounts({ childWallet: childWallet.publicKey, parentWallet })
          .signers([childWallet])
          .rpc(),
      "distributeToParent"
    );

    console.log(
      `[anchor] Revenue distributed to parent: ${amount.toNumber() / LAMPORTS_PER_SOL} SOL — ${tx}`
    );
    trackTx(tx, "distribute_to_parent");
    return tx;
  } catch (err) {
    console.error("[anchor] distributeToParent failed:", (err as Error).message);
    return null;
  }
}

/** Fetch the on-chain registry state */
export async function fetchRegistry(): Promise<any | null> {
  try {
    const connection = getConnection();
    const dummyKeypair = Keypair.generate();
    const program = getProgram(dummyKeypair);
    const [registryPda] = getRegistryPda();
    return await program.account.registry.fetch(registryPda);
  } catch (err) {
    console.error("[anchor] fetchRegistry failed:", (err as Error).message);
    return null;
  }
}

/** Fetch an on-chain agent account */
export async function fetchAgentAccount(
  wallet: PublicKey
): Promise<any | null> {
  try {
    const dummyKeypair = Keypair.generate();
    const program = getProgram(dummyKeypair);
    const [agentPda] = getAgentPda(wallet);
    return await program.account.agentAccount.fetch(agentPda);
  } catch {
    return null;
  }
}

/** Fetch all on-chain agent accounts */
export async function fetchAllAgentAccounts(): Promise<any[]> {
  try {
    const dummyKeypair = Keypair.generate();
    const program = getProgram(dummyKeypair);
    return await program.account.agentAccount.all();
  } catch (err) {
    console.error("[anchor] fetchAllAgentAccounts failed:", (err as Error).message);
    return [];
  }
}
