import { Hono } from "hono";
import { cors } from "hono/cors";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { HydraAgent, runningAgents } from "./hydra-agent.js";
import { getConnection, SPECIALIZATIONS } from "./config.js";
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
// API Routes
// ============================================================================

// Health check
app.get("/", (c) => {
  return c.json({
    name: "Hydra — Self-Replicating Agent Economy",
    version: "0.1.0",
    agents: runningAgents.size,
    endpoints: [
      "GET  /                  — This info",
      "GET  /agents            — All running agents",
      "GET  /agents/:wallet    — Agent details",
      "POST /service/:wallet   — Call agent service (paid)",
      "GET  /tree              — Agent lineage tree",
      "GET  /stats             — Economy stats",
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
    // Try query params
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

// ============================================================================
// Simulation endpoint (for demo: simulate traffic to trigger spawning)
// ============================================================================

app.post("/simulate", async (c) => {
  const { calls = 10, targetMint } = await c.req.json().catch(() => ({}));
  const results: any[] = [];
  const agents = Array.from(runningAgents.values());

  for (let i = 0; i < calls; i++) {
    // Pick a random agent
    const agent = agents[Math.floor(Math.random() * agents.length)];
    const info = agent.info;

    try {
      let params: Record<string, string> = {};
      if (info.specialization === "token-risk-analysis") {
        params = {
          mint: targetMint || "So11111111111111111111111111111111111111112",
        };
      } else if (info.specialization === "wallet-behavior-scoring") {
        params = {
          address:
            targetMint || "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg",
        };
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
  console.log(`\nStarting HTTP server on port ${PORT}...`);

  Bun.serve({
    port: PORT,
    fetch: app.fetch,
  });

  console.log(`\n✅ Hydra is alive at http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  http://localhost:${PORT}/agents    — List agents`);
  console.log(`  GET  http://localhost:${PORT}/tree      — Agent tree`);
  console.log(`  GET  http://localhost:${PORT}/stats     — Economy stats`);
  console.log(
    `  POST http://localhost:${PORT}/service/${rootAgent.publicKey.toBase58()} — Use service`
  );
  console.log(
    `  POST http://localhost:${PORT}/simulate  — Simulate traffic\n`
  );
}

main().catch(console.error);
