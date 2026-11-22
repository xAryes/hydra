import { describe, expect, test, beforeAll } from "bun:test";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../idl/hydra.json";

// Runs against the validator started by `anchor test` (or ANCHOR_PROVIDER_URL).
const connection = new anchor.web3.Connection(
  process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899",
  "confirmed"
);
const authority = Keypair.generate();
const stranger = Keypair.generate();
const rootWallet = Keypair.generate();

const programFor = (kp: Keypair) =>
  new anchor.Program(
    idl as anchor.Idl,
    new anchor.AnchorProvider(connection, new anchor.Wallet(kp), { commitment: "confirmed" })
  );

const pda = (...seeds: Buffer[]) =>
  PublicKey.findProgramAddressSync(seeds, new PublicKey(idl.address))[0];
const registry = pda(Buffer.from("registry"));
const rootAgent = pda(Buffer.from("agent"), rootWallet.publicKey.toBuffer());

async function airdrop(pk: PublicKey) {
  const sig = await connection.requestAirdrop(pk, 2 * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
}

describe("deactivate_agent", () => {
  beforeAll(async () => {
    await airdrop(authority.publicKey);
    await airdrop(stranger.publicKey);
    const program = programFor(authority);
    await program.methods
      .initialize()
      .accounts({ registry, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    await program.methods
      .registerRootAgent("root", "coordination")
      .accounts({
        registry,
        agent: rootAgent,
        wallet: rootWallet.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  test("rejects a signer that is not the registry authority", async () => {
    let error: unknown = null;
    try {
      await programFor(stranger)
        .methods.deactivateAgent()
        .accountsStrict({ registry, agent: rootAgent, authority: stranger.publicKey })
        .rpc();
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();
    expect(String(error)).toContain("Unauthorized");
    const agent = await (programFor(authority).account as any).agentAccount.fetch(rootAgent);
    expect(agent.isActive).toBe(true);
  });

  test("lets the registry authority deactivate an agent", async () => {
    await programFor(authority)
      .methods.deactivateAgent()
      .accountsStrict({ registry, agent: rootAgent, authority: authority.publicKey })
      .rpc();
    const agent = await (programFor(authority).account as any).agentAccount.fetch(rootAgent);
    expect(agent.isActive).toBe(false);
  });
});
