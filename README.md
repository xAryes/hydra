<p align="center">
  <img src="https://img.shields.io/badge/Solana-Devnet-blue?style=for-the-badge&logo=solana" alt="Solana Devnet" />
  <img src="https://img.shields.io/badge/Anchor-0.32.1-purple?style=for-the-badge" alt="Anchor" />
  <img src="https://img.shields.io/badge/Runtime-Bun-orange?style=for-the-badge&logo=bun" alt="Bun" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT" />
</p>

# HYDRA — Self-Replicating Agent Economy on Solana

> **One agent starts. It earns. It spawns children. They earn. Revenue flows upward. The economy grows autonomously — all verified on-chain.**

Hydra is a **self-replicating autonomous agent economy** built on Solana. A single root agent sells on-chain intelligence services (token risk analysis, wallet scoring, MEV detection, etc.), accumulates earnings, and when profitable enough, **spawns new specialized child agents** — each with its own Solana wallet, its own specialization, and a revenue-sharing agreement enforced by the on-chain program. Children can spawn their own children, creating an **autonomous, self-growing economic tree** with verifiable on-chain state.

**Program ID:** [`HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp`](https://explorer.solana.com/address/HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp?cluster=devnet)

---

## Table of Contents

- [Why Hydra?](#why-hydra)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Services](#services)
- [Economic Model](#economic-model)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [On-Chain Program](#on-chain-program)
- [Dashboard](#dashboard)
- [Project Structure](#project-structure)
- [Technical Deep Dives](#technical-deep-dives)
- [Security](#security)
- [Tech Stack](#tech-stack)
- [Documentation](#documentation)
- [License](#license)

---

## Why Hydra?

Most AI agents are centralized — a single process, a single wallet, a single point of failure. Hydra explores a fundamentally different model:

| Traditional Agent | Hydra |
|---|---|
| Single monolithic process | Self-replicating tree of specialized agents |
| One wallet | Each agent has its own Solana keypair |
| No economic incentive structure | On-chain revenue sharing (20% parent cut) |
| State lives in memory | State verified on Solana (PDAs, events, CPI) |
| Manual scaling | Autonomous spawning when profitable |
| Black box economics | Transparent earnings, distributions, lineage on Explorer |

**The key insight:** If an agent can earn money, it can decide when to invest in creating a more specialized version of itself — and take a cut of that child's future earnings. This creates a **self-funding, self-scaling, economically-aligned agent network**.

---

## How It Works

```
                        ┌─────────────────────────────┐
                        │       HYDRA ROOT AGENT       │
                        │    token-risk-analysis        │
                        │    Wallet: 84wE...CRCq        │
                        │    Depth: 0                    │
                        │    Earnings: 0.5+ SOL         │
                        └───────┬─────────┬─────────────┘
                  Spawn trigger │         │ Spawn trigger
              (0.5 SOL earned)  │         │ (earnings reset, repeat)
                    ┌───────────┘         └───────────┐
                    ▼                                   ▼
      ┌──────────────────────┐          ┌──────────────────────┐
      │  CHILD AGENT #1       │          │  CHILD AGENT #2       │
      │  wallet-scoring        │          │  protocol-health      │
      │  Depth: 1              │          │  Depth: 1              │
      │  20% revenue → parent  │          │  20% revenue → parent  │
      └──────────┬─────────────┘          └────────────────────────┘
                 │ Spawn trigger
                 ▼
   ┌──────────────────────┐
   │  GRANDCHILD AGENT     │
   │  mev-detection         │
   │  Depth: 2              │
   │  20% revenue → parent  │
   └────────────────────────┘
```

### Lifecycle

1. **Boot** — Root agent starts, initializes the on-chain registry, registers itself via the Anchor program
2. **Serve** — Agent receives service requests (token analysis, wallet scoring, etc.) via HTTP API
3. **Earn** — Each service call records 0.01 SOL of earnings both in-memory and on-chain (`record_earning` instruction)
4. **Distribute** — After each earning, 20% is distributed to the parent agent via on-chain CPI (`distribute_to_parent`)
5. **Spawn** — When cumulative earnings hit 0.5 SOL (50 calls), the agent spawns a new child with a different specialization
6. **Register** — Child is registered on-chain via `spawn_child`, creating a new PDA with lineage metadata
7. **Repeat** — Child begins earning, distributing, and eventually spawning its own children (up to depth 5)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        SOLANA DEVNET                          │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Registry    │  │ Agent PDA    │  │ Agent PDA    │  ...   │
│  │  (PDA)       │  │ (root)       │  │ (child)      │        │
│  │              │  │              │  │              │        │
│  │ authority    │  │ wallet       │  │ wallet       │        │
│  │ total_agents │  │ parent       │  │ parent ──────┼──┐     │
│  │ total_earn   │  │ name         │  │ name         │  │     │
│  │ total_spawns │  │ spec         │  │ spec         │  │     │
│  │ bump         │  │ total_earned │  │ total_earned │  │     │
│  └──────────────┘  │ depth: 0     │  │ depth: 1     │  │     │
│                     │ children: 2  │  │ rev_share    │  │     │
│                     │ bump         │◄─┘ bump         │  │     │
│                     └──────────────┘  └──────────────┘        │
│                                                               │
│  Instructions: initialize | register_root_agent | spawn_child │
│                record_earning | distribute_to_parent           │
│                deactivate_agent                                │
│                                                               │
│  Events: AgentRegistered | AgentSpawned | EarningRecorded     │
│          RevenueDistributed | AgentDeactivated                 │
└──────────────────────────────────────────────────────────────┘
                              │
                    Anchor RPC calls
                              │
┌──────────────────────────────────────────────────────────────┐
│                     AGENT RUNTIME (Bun)                       │
│                                                               │
│  ┌─────────────────┐                                         │
│  │  anchor-client   │ ← Typed wrappers for all instructions  │
│  └────────┬─────────┘                                         │
│           │                                                   │
│  ┌────────┴─────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   HydraAgent      │  │ HydraAgent   │  │ HydraAgent   │   │
│  │   (root)          │  │ (child 1)    │  │ (child 2)    │   │
│  │                   │  │              │  │              │   │
│  │ handleServiceCall │  │ wallet-score │  │ proto-health │   │
│  │ checkAndSpawn     │  │              │  │              │   │
│  │ distributeRevenue │  │              │  │              │   │
│  └───────────────────┘  └──────────────┘  └──────────────┘   │
│           │                                                   │
│  ┌────────┴──────────────────────────────┐                   │
│  │            Hono HTTP Server            │                   │
│  │  /agents  /tree  /stats  /on-chain     │                   │
│  │  /service/:wallet  /simulate           │                   │
│  └────────────────────────────────────────┘                   │
│                                                               │
│  Auto-spawn loop (30s) — checks all agents for spawn triggers │
└──────────────────────────────────────────────────────────────┘
                              │
                         HTTP / JSON
                              │
┌──────────────────────────────────────────────────────────────┐
│                      DASHBOARD (HTML/JS)                      │
│                                                               │
│  Tabs: Agent Tree | On-Chain State | Live Transactions | Log  │
│  Features: Solana Explorer links, revenue flow visualization  │
│  Auto-refresh: 3-second polling                               │
└──────────────────────────────────────────────────────────────┘
```

For a deeper dive, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Services

Hydra agents sell **5 distinct on-chain intelligence services**, each backed by real Solana RPC queries:

| # | Specialization | What It Does | Input | Key Output |
|---|---------------|-------------|-------|------------|
| 1 | **Token Risk Analysis** | Evaluates a token's risk by checking mint validity, holder concentration, transaction activity, and token age | Token mint address | Risk score (0-100), weighted factor breakdown |
| 2 | **Wallet Behavior Scoring** | Profiles a wallet's activity: balance, token holdings, transaction frequency, failure rates, risk indicators | Wallet address | Activity score (0-100), risk indicator flags |
| 3 | **Protocol Health Monitor** | Checks a program's on-chain health: existence, transaction volume, error rate, account count | Program ID | Health score (0-100), factor analysis |
| 4 | **MEV Detection** | Analyzes recent transactions for sandwich attacks, frontrunning, and failed arbitrage patterns | Target address | MEV risk score (0-100), suspicious pattern list |
| 5 | **Liquidity Analysis** | Evaluates a DEX pool: TVL estimation, swap volume, token accounts, price impact | Pool address | Liquidity score (0-100), TVL estimate |

All services make **real on-chain RPC calls** — they query actual Solana state (account info, token supply, transaction histories, program accounts). No mock data.

---

## Economic Model

### Revenue Flow

```
Service Client
      │
      │ pays 0.01 SOL per call
      ▼
┌─────────────┐
│ Child Agent   │ ─── keeps 80% (0.008 SOL)
│ depth: 2      │
└──────┬────────┘
       │ 20% (0.002 SOL) via distribute_to_parent CPI
       ▼
┌─────────────┐
│ Parent Agent  │ ─── keeps 80% of its own earnings
│ depth: 1      │     + receives 20% from each child
└──────┬────────┘
       │ 20% of own earnings → grandparent
       ▼
┌─────────────┐
│ Root Agent    │ ─── accumulates revenue from entire tree
│ depth: 0      │
└───────────────┘
```

### Key Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `SERVICE_PRICE_LAMPORTS` | 10,000,000 (0.01 SOL) | Price per service call |
| `REVENUE_SHARE_BPS` | 2,000 (20%) | Revenue share from child to parent |
| `SPAWN_THRESHOLD_LAMPORTS` | 500,000,000 (0.5 SOL) | Earnings needed to trigger spawn |
| `MAX_DEPTH` | 5 | Maximum depth of the agent tree |
| Max children per agent | 3 | Maximum children any agent can spawn |

### Growth Dynamics

- **Spawn trigger:** 50 service calls (50 x 0.01 SOL = 0.5 SOL)
- **Max tree size:** 1 root + 3 children + 9 grandchildren + 27 great-grandchildren + 81 at depth 4 = **121 agents**
- **Revenue compound:** Root agent earns from its own services + 20% of each child's earnings + 20% of grandchildren's earnings (via intermediate parents)
- **Self-funding:** Spawning is funded from earnings — the parent transfers 0.05 SOL to the child for rent + operating costs

For the full economic model with game theory analysis, see [docs/ECONOMIC-MODEL.md](docs/ECONOMIC-MODEL.md).

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (for airdrops)
- [Anchor](https://www.anchor-lang.com/docs/installation) (only if rebuilding the program)

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

```bash
# Create .env with your Helius API key (recommended for reliable RPC)
echo "HELIUS_API_KEY=your_key_here" > .env
```

### 3. Start the Agent

```bash
bun run agent
```

You should see:

```
═══════════════════════════════════════════
  HYDRA — Self-Replicating Agent Economy
═══════════════════════════════════════════

Loaded root agent wallet: 84wE...CRCq
Root agent balance: 0 SOL

--- On-Chain Initialization ---
Deploy authority: 2Rha...6dUP
[anchor] Registry already initialized
[anchor] Root agent already registered
Registry initialized
Root agent registered on-chain

Starting HTTP server on port 3100...
Auto-spawn loop started (every 30s)

Hydra is alive at http://localhost:3100
```

### 4. Open the Dashboard

Open `app/index.html` in your browser (or serve it):

```bash
bun run dashboard
# Opens at http://localhost:3200
```

### 5. Simulate Traffic

Either use the dashboard buttons or curl:

```bash
# Simulate 50 service calls to trigger spawning
curl -X POST http://localhost:3100/simulate \
  -H "Content-Type: application/json" \
  -d '{"calls": 50}'
```

After 50 calls, you should see a child agent spawn:

```
[hydra-root] SPAWNING CHILD: hydra-wallet-d1 (wallet-behavior-scoring)
   Earned 0.5 SOL — threshold reached!
[anchor] Child spawned on-chain: 4xK2...
Child spawned: 7nBp...
```

### 6. Verify On-Chain

```bash
# Check on-chain state
curl http://localhost:3100/on-chain | jq .

# Or view in Solana Explorer
# https://explorer.solana.com/address/HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp?cluster=devnet
```

---

## API Reference

Base URL: `http://localhost:3100`

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Service info and available endpoints |
| `GET` | `/health` | Health check: RPC connectivity, program reachability, uptime |
| `GET` | `/agents` | List all running agents with their state |
| `GET` | `/agents/:wallet` | Get specific agent by wallet address |
| `GET` | `/tree` | Agent lineage tree (nested structure) |
| `GET` | `/stats` | Economy-wide aggregate statistics |
| `GET` | `/on-chain` | Fetch live on-chain state from Solana devnet |
| `POST` | `/service/:wallet` | Call an agent's intelligence service |
| `POST` | `/simulate` | Simulate N service calls for demo purposes |

### Example: Call a Service

```bash
# Token risk analysis
curl -X POST http://localhost:3100/service/<WALLET> \
  -H "Content-Type: application/json" \
  -d '{"mint": "So11111111111111111111111111111111111111112"}'

# Wallet behavior scoring
curl -X POST http://localhost:3100/service/<WALLET> \
  -H "Content-Type: application/json" \
  -d '{"address": "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"}'

# Protocol health check (analyze Hydra's own program!)
curl -X POST http://localhost:3100/service/<WALLET> \
  -H "Content-Type: application/json" \
  -d '{"programId": "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp"}'
```

### Example: On-Chain State Response

```json
{
  "programId": "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp",
  "registry": {
    "authority": "2Rha...6dUP",
    "totalAgents": 3,
    "totalEarnings": 1.5,
    "totalSpawns": 2
  },
  "agents": [
    {
      "pda": "Fk3j...8nQp",
      "wallet": "84wE...CRCq",
      "parent": "1111...1111",
      "name": "hydra-root",
      "specialization": "token-risk-analysis",
      "totalEarned": 0.5,
      "totalDistributedToParent": 0,
      "childrenCount": 2,
      "depth": 0,
      "revenueShareBps": 0,
      "isActive": true
    }
  ],
  "recentTransactions": [
    { "sig": "45KY...aDG", "type": "initialize", "ts": 1707580000000 },
    { "sig": "SaiV...fSY", "type": "register_root_agent", "ts": 1707580001000 }
  ]
}
```

For complete API documentation with all response schemas, see [docs/API.md](docs/API.md).

---

## On-Chain Program

The Hydra Anchor program manages the agent economy's state on Solana. Every agent registration, earning, spawn, and revenue distribution is a verifiable on-chain transaction.

### Instructions

| Instruction | Signer | Description |
|-------------|--------|-------------|
| `initialize` | Authority | Creates the global Registry PDA (one-time) |
| `register_root_agent` | Authority | Registers the root agent (no parent, depth 0) |
| `spawn_child` | Parent wallet | Parent creates a child agent PDA, increments counters |
| `record_earning` | Agent wallet | Records earnings on the agent's PDA and global registry |
| `distribute_to_parent` | Child wallet | CPI: transfers SOL from child to parent wallet |
| `deactivate_agent` | Authority | Marks an agent as inactive |

### PDA Derivation

```
Registry PDA:  seeds = ["registry"]
Agent PDA:     seeds = ["agent", wallet_pubkey]
```

### Account Schemas

**Registry** (65 bytes):
```
authority:     Pubkey (32)
total_agents:  u64    (8)
total_earnings: u64   (8)
total_spawns:  u64    (8)
bump:          u8     (1)
```

**AgentAccount** (204 bytes):
```
wallet:                      Pubkey  (32)
parent:                      Pubkey  (32)
name:                        String  (4 + 32)
specialization:              String  (4 + 64)
total_earned:                u64     (8)
total_distributed_to_parent: u64     (8)
children_count:              u64     (8)
depth:                       u8      (1)
revenue_share_bps:           u16     (2)
is_active:                   bool    (1)
created_at:                  i64     (8)
bump:                        u8      (1)
```

### Events

All state mutations emit events for off-chain indexing:

- `AgentRegistered` — New agent joins the network
- `AgentSpawned` — Parent creates child agent
- `EarningRecorded` — Agent records service revenue
- `RevenueDistributed` — SOL transferred from child to parent
- `AgentDeactivated` — Agent marked inactive

For complete program documentation, see [docs/PROGRAM.md](docs/PROGRAM.md).

---

## Dashboard

The real-time web dashboard provides four views:

### Agent Tree
Visual representation of the agent lineage tree with live pulse indicators, wallet addresses (linked to Solana Explorer), earnings, service call counts, and revenue flow arrows showing the 20% distribution.

### On-Chain State
Live data fetched directly from Solana devnet: registry statistics (total agents, total earnings, total spawns), and a list of all verified on-chain agent accounts with their PDAs, wallets, and earnings.

### Live Transactions
Feed of recent on-chain transaction signatures, color-coded by type (initialize, register, spawn, earn, distribute), each linking directly to Solana Explorer.

### Activity Log
Real-time activity stream showing service calls, spawn events, and errors.

---

## Project Structure

```
hydra/
├── programs/hydra/
│   └── src/lib.rs              Anchor program: registry, agents, spawning, revenue
│
├── agent/src/
│   ├── index.ts                HTTP server, API routes, on-chain init, auto-spawn loop
│   ├── hydra-agent.ts          Agent class: service dispatch, spawning, revenue distribution
│   ├── anchor-client.ts        Typed Anchor RPC wrappers for all instructions
│   ├── config.ts               Program IDs, PDA helpers, connection, keypair loaders
│   └── services/
│       ├── token-risk.ts       Token risk analysis (supply, holders, activity, age)
│       ├── wallet-analysis.ts  Wallet behavior scoring (balance, tokens, tx patterns)
│       ├── protocol-health.ts  Protocol health monitoring (existence, volume, errors)
│       ├── mev-detection.ts    MEV pattern detection (sandwich, frontrun, arb)
│       └── liquidity-analysis.ts  Liquidity analysis (TVL, swaps, price impact)
│
├── app/
│   ├── index.html              Dashboard v2: tabs, on-chain state, explorer links
│   └── server.ts               Dashboard HTTP server
│
├── idl/hydra.json              Anchor IDL (auto-generated, uploaded on-chain)
├── target/deploy/hydra.so      Compiled BPF program binary (273KB)
├── deploy-keypair.json         Program deploy authority keypair
├── Anchor.toml                 Anchor configuration (devnet)
├── Cargo.toml                  Rust workspace configuration
├── package.json                Node/Bun dependencies
│
└── docs/
    ├── ARCHITECTURE.md         Deep technical architecture guide
    ├── API.md                  Complete API reference with schemas
    ├── ECONOMIC-MODEL.md       Economic model, game theory, growth analysis
    ├── PROGRAM.md              Solana program reference
    ├── SECURITY.md             Threat model, controls, known limitations
    └── TESTING.md              Manual test procedures and troubleshooting
```

---

## Technical Deep Dives

### Why Anchor PDAs for Agent State?

Every agent in the Hydra tree has a **Program Derived Address** (PDA) seeded by `["agent", wallet_pubkey]`. This design guarantees:

1. **Uniqueness** — One PDA per wallet, enforced by Solana runtime
2. **Discoverability** — Any client can compute an agent's PDA from its wallet address
3. **Verifiability** — All agent state (lineage, earnings, revenue share) is on-chain and auditable
4. **Composability** — Other programs can read Hydra agent state via CPI

### Revenue Distribution via CPI

Revenue sharing is enforced by the program, not the agent runtime:

```rust
system_program::transfer(
    CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.child_wallet.to_account_info(),
            to: ctx.accounts.parent_wallet.to_account_info(),
        },
    ),
    amount,
)?;
```

The child wallet must **sign** the `distribute_to_parent` instruction, and the program verifies the parent-child relationship through PDA constraints. This means:
- A child cannot avoid paying its parent
- A parent cannot extract more than agreed
- All distributions are visible on-chain

### Best-Effort On-Chain Integration

All on-chain calls are wrapped in try/catch with logging. The agent continues operating even if Solana is slow or the wallet lacks SOL for rent. This pragmatic approach means:
- The demo works even without devnet SOL
- On-chain state is always eventually consistent
- No single RPC failure kills the agent

---

## Security

### On-Chain Safety

- **Checked arithmetic** — All counter increments use `checked_add().unwrap()` to prevent overflow
- **PDA validation** — Agent PDAs are derived from wallet pubkeys and verified by Anchor constraints
- **Signer checks** — Every mutation requires the appropriate signer (authority for registry ops, wallet for agent ops)
- **Authority constraints** — `has_one = authority` on registry operations
- **Depth limits** — `MAX_DEPTH = 5` prevents unbounded tree growth
- **Input validation** — Name and specialization lengths are bounded (32 and 64 bytes)
- **Revenue share bounds** — `revenue_share_bps <= 10_000` enforced on-chain
- **Active check** — Inactive agents cannot record earnings or distribute revenue

### Runtime Safety (v0.3.0)

- **Rate limiting** — Per-IP sliding window (60 req/min), prevents DoS
- **CORS restriction** — Origin whitelist (localhost only), not wildcard
- **Security headers** — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy
- **Input validation** — All Solana addresses validated before use, simulate calls capped at 100
- **XSS prevention** — All user-controlled strings HTML-escaped in dashboard
- **Retry with backoff** — Exponential backoff on RPC failures (3 attempts, 500ms base)
- **Keypair isolation** — Each agent has its own keypair, generated at spawn time
- **Best-effort RPC** — All on-chain calls are non-blocking and failure-tolerant
- **No secret exposure** — Keypairs are stored locally, never sent over HTTP
- **Graceful shutdown** — Clean SIGINT/SIGTERM handling
- **Connection pooling** — Singleton RPC connection avoids socket exhaustion

For the full security analysis and known limitations, see [docs/SECURITY.md](docs/SECURITY.md).

---

## Tech Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| On-chain program | Anchor (Rust) | 0.32.1 | Type-safe Solana development, PDA management, CPI, IDL generation |
| Agent runtime | Bun | 1.2+ | Fastest JS runtime, native TS, built-in HTTP server, 3x faster startup than Node |
| HTTP framework | Hono | 4.7+ | Ultra-lightweight (14KB), edge-ready, middleware stack, Bun-optimized |
| Solana SDK | @solana/web3.js | 1.98+ | Standard Solana JavaScript SDK for RPC and transactions |
| Anchor SDK | @coral-xyz/anchor | 0.32+ | TypeScript bindings for Anchor programs, IDL-driven client generation |
| RPC provider | Helius | — | Premium devnet RPC with higher rate limits, WebSocket support |
| Dashboard | Vanilla HTML/CSS/JS | — | Zero build step, instant load, no framework overhead |
| Security | Rate limiting + CORS + headers | v0.3.0 | Per-IP sliding window, origin whitelist, XSS/clickjack protection |
| Program binary | BPF `.so` | 273KB | Deployed to Solana devnet, IDL uploaded on-chain |

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, data flow, component interaction |
| [docs/API.md](docs/API.md) | Complete HTTP API reference with request/response schemas |
| [docs/ECONOMIC-MODEL.md](docs/ECONOMIC-MODEL.md) | Economic model, revenue math, game theory, growth projections |
| [docs/PROGRAM.md](docs/PROGRAM.md) | Solana program reference: instructions, accounts, PDAs, events, errors |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, security controls, known limitations |
| [docs/TESTING.md](docs/TESTING.md) | Manual test procedures, verification steps, troubleshooting |

---

## Colosseum Hackathon

Built for the [Colosseum Agent Hackathon](https://www.colosseum.org) (February 2026).

**Category:** Autonomous Agent Economy on Solana

**What makes Hydra unique:**
- Agents that **create other agents** — not just a single bot
- Revenue sharing **enforced on-chain** via Anchor CPI — not just a promise
- Real Solana RPC queries for all 5 services — not mock data
- Every agent, earning, spawn, and distribution is **verifiable on Solana Explorer**
- Self-funding growth — spawning is paid from accumulated earnings

---

## License

MIT
