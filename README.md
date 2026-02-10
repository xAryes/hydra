# HYDRA — Self-Replicating Agent Economy on Solana

An autonomous agent that earns by selling on-chain intelligence services, and **spawns new specialized child agents** when profitable — building a self-growing economy entirely on Solana.

## How It Works

```
Root Agent (token-risk-analysis)
  ├── Earns SOL by analyzing tokens for clients
  ├── When earnings hit threshold → spawns child
  │
  ├── Child 1 (wallet-behavior-scoring)
  │     ├── Earns by analyzing wallet behavior
  │     └── Revenue share: 20% flows back to parent
  │
  ├── Child 2 (protocol-health-monitor)
  │     └── ...spawns its own children at depth 2
  │
  └── Child 3 (mev-detection)
        └── ...
```

**One agent becomes many. Each earns. Revenue flows up. The economy grows autonomously.**

## Architecture

### Solana Program (Anchor)
- **Registry** — Tracks all agents, total earnings, spawn events
- **Agent Accounts (PDAs)** — Per-agent on-chain state: wallet, parent, specialization, earnings, children count, depth
- **Revenue Distribution** — SOL transfers from child to parent enforced on-chain
- **Spawn Events** — Parent registers child, creates PDA, funds operating wallet
- **Safety** — Max depth (5), checked arithmetic, signer validation on all mutations

### Agent Runtime (TypeScript/Bun)
- HTTP API serving paid intelligence services
- Each agent has its own Solana wallet
- Automatic spawn logic when earnings threshold is met
- In-process child agents (shared HTTP server)

### Services
| Specialization | Input | Output |
|---------------|-------|--------|
| `token-risk-analysis` | Token mint address | Risk score (0-100) + factor breakdown |
| `wallet-behavior-scoring` | Wallet address | Activity score, risk indicators, balance analysis |
| `protocol-health-monitor` | Protocol address | Health metrics (planned) |
| `mev-detection` | Block range | MEV activity analysis (planned) |
| `liquidity-analysis` | Pool address | Liquidity depth analysis (planned) |

### Dashboard
Real-time web UI showing:
- Agent lineage tree with live pulse indicators
- Economy stats (total agents, earnings, service calls, spawns)
- Activity log
- Simulation controls for demo

## Quick Start

```bash
# Install dependencies
bun install

# Start the agent (creates wallet on first run)
bun run agent

# In another terminal, start the dashboard
bun run dashboard

# Open http://localhost:3200 for the dashboard
# Agent API at http://localhost:3100
```

### Deploy Program to Devnet

```bash
# Airdrop SOL to deploy keypair
solana airdrop 5 $(solana-keygen pubkey deploy-keypair.json) --url devnet

# Deploy
anchor deploy --provider.cluster devnet
```

### API Endpoints

```
GET  /            — Service info
GET  /agents      — List all running agents
GET  /tree        — Agent lineage tree
GET  /stats       — Economy-wide stats
POST /service/:wallet — Call agent service (token analysis, wallet scoring)
POST /simulate    — Simulate traffic to trigger spawning
```

### Example: Analyze a Token

```bash
curl -X POST http://localhost:3100/service/<AGENT_WALLET> \
  -H "Content-Type: application/json" \
  -d '{"mint": "So11111111111111111111111111111111111111112"}'
```

## Solana Integration

- **Anchor program** deployed to devnet at `HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp`
- **PDAs** for agent registry and per-agent accounts
- **On-chain events** for agent registration, spawning, earnings, revenue distribution
- **System program CPI** for SOL transfers (revenue sharing)
- **Real RPC calls** to analyze tokens (supply, holders, transaction activity)
- **Wallet generation** — each spawned agent gets its own Solana keypair

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Program | Anchor 0.32.1 (Rust) |
| Runtime | Bun + TypeScript |
| HTTP | Hono |
| RPC | Helius (primary) / Solana devnet |
| Dashboard | Vanilla HTML/CSS/JS |

## Project Structure

```
├── programs/hydra/src/lib.rs   — Solana program (registry, spawn, earnings)
├── agent/src/
│   ├── index.ts                — HTTP server + API routes
│   ├── hydra-agent.ts          — Agent class (service handling, spawn logic)
│   ├── config.ts               — Program IDs, PDAs, connection
│   └── services/
│       ├── token-risk.ts       — Token risk analysis service
│       └── wallet-analysis.ts  — Wallet behavior scoring service
├── app/
│   ├── index.html              — Dashboard UI
│   └── server.ts               — Dashboard HTTP server
├── target/deploy/hydra.so      — Compiled program binary
└── Anchor.toml                 — Anchor configuration
```

## License

MIT
