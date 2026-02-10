import { Hono } from "hono";
import { cors } from "hono/cors";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { HydraAgent, runningAgents } from "./hydra-agent.js";
import {
  getConnection,
  SPECIALIZATIONS,
  PROGRAM_ID,
  loadDeployKeypair,
} from "./config.js";
import {
  initializeRegistry,
  registerRootAgent,
  fetchRegistry,
  fetchAllAgentAccounts,
  recentTxSignatures,
} from "./anchor-client.js";
import * as fs from "fs";
import * as path from "path";

// Load environment
const envPath = path.resolve(import.meta.dir, "../../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...vals] = trimmed.split("=");
      process.env[key] = vals.join("=");
    }
  }
}

const app = new Hono();
app.use("/*", cors());

const PORT = parseInt(process.env.AGENT_PORT || "3100");
const ROOT_PORT = PORT;

// ============================================================================
// Initialize root agent
// ============================================================================

async function initRootAgent(): Promise<HydraAgent> {
  // Load or generate root keypair
  const keypairPath = path.resolve(import.meta.dir, "../../.hydra-root.json");
  let wallet: Keypair;

  if (fs.existsSync(keypairPath)) {
    const raw = fs.readFileSync(keypairPath, "utf-8");
    wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    console.log(`Loaded root agent wallet: ${wallet.publicKey.toBase58()}`);
  } else {
    wallet = Keypair.generate();
    fs.writeFileSync(keypairPath, JSON.stringify(Array.from(wallet.secretKey)));
    console.log(`Generated root agent wallet: ${wallet.publicKey.toBase58()}`);
  }

  // Check balance
  const connection = getConnection();
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Root agent balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  if (balance === 0) {
    console.log(
      `\n⚠️  Root agent needs SOL! Send devnet SOL to: ${wallet.publicKey.toBase58()}`
    );
    console.log(`   Run: solana airdrop 2 ${wallet.publicKey.toBase58()} --url devnet\n`);
  }

  const agent = new HydraAgent({
    wallet,
    specialization: "token-risk-analysis",
    name: "hydra-root",
    depth: 0,
    parentWallet: null,
    totalEarned: 0,
    serviceCallCount: 0,
    children: [],
    isRoot: true,
    port: ROOT_PORT,
  });

  runningAgents.set(wallet.publicKey.toBase58(), agent);
  return agent;
}

// ============================================================================
// On-chain initialization
// ============================================================================

async function initOnChain(rootWallet: PublicKey): Promise<void> {
  try {
    const deployKeypair = loadDeployKeypair();
    console.log(
      `Deploy authority: ${deployKeypair.publicKey.toBase58()}`
    );

    // Initialize registry (idempotent)
    await initializeRegistry(deployKeypair);
    console.log("✅ Registry initialized");

    // Register root agent (idempotent)
    await registerRootAgent(
      deployKeypair,
      rootWallet,
      "hydra-root",
      "token-risk-analysis"
    );
    console.log("✅ Root agent registered on-chain");
  } catch (err) {
    console.error(
      "⚠️  On-chain initialization failed (non-critical):",
      (err as Error).message
    );
  }
}

// ============================================================================
// API Routes
// ============================================================================

// Health check
app.get("/", (c) => {
  return c.json({
    name: "Hydra — Self-Replicating Agent Economy",
    version: "0.2.0",
    agents: runningAgents.size,
    programId: PROGRAM_ID.toBase58(),
    endpoints: [
      "GET  /                  — This info",
      "GET  /agents            — All running agents",
      "GET  /agents/:wallet    — Agent details",
      "POST /service/:wallet   — Call agent service (paid)",
      "GET  /tree              — Agent lineage tree",
      "GET  /stats             — Economy stats",
      "GET  /on-chain          — On-chain state from Solana",
      "POST /simulate          — Simulate traffic",
    ],
  });
});

// List all running agents
app.get("/agents", (c) => {
  const agents = Array.from(runningAgents.values()).map((a) => a.info);
  return c.json({ count: agents.length, agents });
});

// Get specific agent
app.get("/agents/:wallet", (c) => {
  const wallet = c.req.param("wallet");
  const agent = runningAgents.get(wallet);
  if (!agent) return c.json({ error: "Agent not found" }, 404);
  return c.json(agent.info);
});

// Call agent service (the money-making endpoint)
app.post("/service/:wallet", async (c) => {
  const wallet = c.req.param("wallet");
  const agent = runningAgents.get(wallet);
  if (!agent) return c.json({ error: "Agent not found" }, 404);

  let params: Record<string, string>;
  try {
    params = await c.req.json();
  } catch {
    params = {};
    for (const [key, val] of Object.entries(c.req.query())) {
      if (val) params[key] = val;
    }
  }

  try {
    const result = await agent.handleServiceCall(params);
    return c.json({
      success: true,
      agent: agent.info,
      result,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Agent lineage tree
app.get("/tree", (c) => {
  const agents = Array.from(runningAgents.values()).map((a) => a.info);
  const root = agents.find((a) => a.isRoot);
  if (!root) return c.json({ error: "No root agent" }, 500);

  function buildTree(agentInfo: typeof root): any {
    return {
      name: agentInfo!.name,
      wallet: agentInfo!.wallet,
      specialization: agentInfo!.specialization,
      depth: agentInfo!.depth,
      totalEarned: agentInfo!.totalEarned,
      serviceCallCount: agentInfo!.serviceCallCount,
      parentWallet: agentInfo!.parentWallet,
      children: agentInfo!.children.map((child) => {
        const childAgent = agents.find((a) => a.wallet === child.wallet);
        if (childAgent) return buildTree(childAgent);
        return { ...child, children: [] };
      }),
    };
  }

  return c.json(buildTree(root));
});

// Economy-wide stats
app.get("/stats", (c) => {
  const agents = Array.from(runningAgents.values()).map((a) => a.info);
  const totalEarnings = agents.reduce((sum, a) => sum + a.totalEarned, 0);
  const totalCalls = agents.reduce((sum, a) => sum + a.serviceCallCount, 0);
  const totalChildren = agents.reduce((sum, a) => sum + a.childrenCount, 0);

  return c.json({
    totalAgents: agents.length,
    totalEarnings: totalEarnings / LAMPORTS_PER_SOL,
    totalServiceCalls: totalCalls,
    totalSpawns: totalChildren,
    maxDepth: Math.max(...agents.map((a) => a.depth)),
    specializations: [...new Set(agents.map((a) => a.specialization))],
    agentsByDepth: agents.reduce(
      (acc, a) => {
        acc[a.depth] = (acc[a.depth] || 0) + 1;
        return acc;
      },
      {} as Record<number, number>
    ),
  });
});

// On-chain state endpoint
app.get("/on-chain", async (c) => {
  try {
    const registry = await fetchRegistry();
    const agents = await fetchAllAgentAccounts();

    return c.json({
      programId: PROGRAM_ID.toBase58(),
      registry: registry
        ? {
            authority: registry.authority.toBase58(),
            totalAgents: registry.totalAgents.toNumber(),
            totalEarnings: registry.totalEarnings.toNumber() / LAMPORTS_PER_SOL,
            totalSpawns: registry.totalSpawns.toNumber(),
          }
        : null,
      agents: agents.map((a: any) => ({
        pda: a.publicKey.toBase58(),
        wallet: a.account.wallet.toBase58(),
        parent: a.account.parent.toBase58(),
        name: a.account.name,
        specialization: a.account.specialization,
        totalEarned: a.account.totalEarned.toNumber() / LAMPORTS_PER_SOL,
        totalDistributedToParent:
          a.account.totalDistributedToParent.toNumber() / LAMPORTS_PER_SOL,
        childrenCount: a.account.childrenCount.toNumber(),
        depth: a.account.depth,
        revenueShareBps: a.account.revenueShareBps,
        isActive: a.account.isActive,
        createdAt: a.account.createdAt.toNumber(),
      })),
      recentTransactions: recentTxSignatures.slice(0, 20),
    });
  } catch (err) {
    return c.json({
      programId: PROGRAM_ID.toBase58(),
      registry: null,
      agents: [],
      recentTransactions: recentTxSignatures.slice(0, 20),
      error: (err as Error).message,
    });
  }
});

// ============================================================================
// Simulation endpoint (for demo: simulate traffic to trigger spawning)
// ============================================================================

// Default params for each specialization in simulation mode
const SIMULATION_PARAMS: Record<string, Record<string, string>> = {
  "token-risk-analysis": {
    mint: "So11111111111111111111111111111111111111112",
  },
  "wallet-behavior-scoring": {
    address: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg",
  },
  "protocol-health-monitor": {
    programId: PROGRAM_ID.toBase58(),
  },
  "mev-detection": {
    address: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg",
  },
  "liquidity-analysis": {
    pool: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2", // SOL-USDC Raydium
  },
};

app.post("/simulate", async (c) => {
  const { calls = 10, targetMint } = await c.req.json().catch(() => ({}));
  const results: any[] = [];
  const agents = Array.from(runningAgents.values());

  for (let i = 0; i < calls; i++) {
    // Pick a random agent
    const agent = agents[Math.floor(Math.random() * agents.length)];
    const info = agent.info;

    try {
      let params: Record<string, string> =
        SIMULATION_PARAMS[info.specialization] || {};

      if (targetMint && info.specialization === "token-risk-analysis") {
        params = { mint: targetMint };
      }

      const result = await agent.handleServiceCall(params);
      results.push({
        agent: info.name,
        specialization: info.specialization,
        success: true,
      });
    } catch (err) {
      results.push({
        agent: info.name,
        specialization: info.specialization,
        error: (err as Error).message,
      });
    }

    // Small delay between calls
    await new Promise((r) => setTimeout(r, 200));
  }

  // Return updated state
  const agentsAfter = Array.from(runningAgents.values()).map((a) => a.info);
  return c.json({
    simulatedCalls: calls,
    results,
    agentsAfter: agentsAfter.length,
    tree: agentsAfter,
  });
});

// ============================================================================
// Background auto-spawn loop
// ============================================================================

function startAutoSpawnLoop() {
  setInterval(async () => {
    for (const agent of runningAgents.values()) {
      try {
        await agent.checkAndSpawn();
      } catch (err) {
        console.error(
          `[auto-spawn] Error checking ${agent.info.name}:`,
          (err as Error).message
        );
      }
    }
  }, 30_000);
  console.log("🔄 Auto-spawn loop started (every 30s)");
}

// ============================================================================
// Start
// ============================================================================

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  🐍 HYDRA — Self-Replicating Agent Economy");
  console.log("═══════════════════════════════════════════\n");

  const rootAgent = await initRootAgent();
  console.log(`\nRoot agent: ${rootAgent.info.name}`);
  console.log(`Specialization: ${rootAgent.info.specialization}`);
  console.log(`Wallet: ${rootAgent.publicKey.toBase58()}`);

  // On-chain initialization (best effort)
  console.log("\n--- On-Chain Initialization ---");
  await initOnChain(rootAgent.publicKey);

  console.log(`\nStarting HTTP server on port ${PORT}...`);

  Bun.serve({
    port: PORT,
    fetch: app.fetch,
  });

  // Start background auto-spawn loop
  startAutoSpawnLoop();

  console.log(`\n✅ Hydra is alive at http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  http://localhost:${PORT}/agents    — List agents`);
  console.log(`  GET  http://localhost:${PORT}/tree      — Agent tree`);
  console.log(`  GET  http://localhost:${PORT}/stats     — Economy stats`);
  console.log(`  GET  http://localhost:${PORT}/on-chain  — On-chain state`);
  console.log(
    `  POST http://localhost:${PORT}/service/${rootAgent.publicKey.toBase58()} — Use service`
  );
  console.log(
    `  POST http://localhost:${PORT}/simulate  — Simulate traffic\n`
  );
}

main().catch(console.error);
