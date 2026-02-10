# Hydra Architecture

> Deep technical guide to the Hydra self-replicating agent economy system.

---

## System Overview

Hydra is a three-layer system:

1. **Solana Program (On-Chain)** — Anchor smart contract managing the registry, agent state, and revenue distribution
2. **Agent Runtime (Off-Chain)** — Bun/TypeScript process running agent logic, HTTP API, and Anchor client
3. **Dashboard (Client)** — Browser-based UI polling the agent runtime for visualization

```
┌──────────────────────────────────────────────────────────┐
│                     SOLANA DEVNET                          │
│                                                            │
│  Registry PDA ← seeds: ["registry"]                        │
│  Agent PDAs   ← seeds: ["agent", wallet.pubkey]            │
│  Events       ← AgentRegistered, AgentSpawned, etc.        │
│  CPI          ← system_program::transfer for revenue       │
└────────────────────────┬───────────────────────────────────┘
                         │ Anchor RPC (via @coral-xyz/anchor)
                         │
┌────────────────────────┴───────────────────────────────────┐
│                   AGENT RUNTIME (Bun)                       │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│  │ anchor-client │  │  HydraAgent   │  │   Hono HTTP     │ │
│  │              │  │  (N instances) │  │   Server        │ │
│  │ initRegistry │  │               │  │                 │ │
│  │ registerRoot │  │ handleService │  │ /agents         │ │
│  │ spawnChild   │  │ checkSpawn    │  │ /tree           │ │
│  │ recordEarn   │  │ distribute    │  │ /on-chain       │ │
│  │ distribute   │  │               │  │ /service/:w     │ │
│  │ fetch*       │  │               │  │ /simulate       │ │
│  └──────────────┘  └───────────────┘  └─────────────────┘ │
│                                                             │
│  Services: token-risk | wallet-scoring | protocol-health    │
│            mev-detection | liquidity-analysis                │
│                                                             │
│  Auto-spawn loop: setInterval(30s)                          │
│  runningAgents: Map<string, HydraAgent>                     │
└────────────────────────┬───────────────────────────────────┘
                         │ HTTP / JSON (polling every 3s)
                         │
┌────────────────────────┴───────────────────────────────────┐
│                    DASHBOARD (Browser)                       │
│                                                             │
│  Tabs: Agent Tree | On-Chain State | Transactions | Log     │
│  Features: Solana Explorer links, auto-refresh, simulation  │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Deep Dive

### 1. Solana Program (`programs/hydra/src/lib.rs`)

The Anchor program is the source of truth for the agent economy. All critical state lives on-chain.

#### Account Model

**Registry (singleton PDA)**
- Seeds: `["registry"]`
- Purpose: Global counters and authority tracking
- Size: 65 bytes (8 discriminator + 32 authority + 8 total_agents + 8 total_earnings + 8 total_spawns + 1 bump)

**AgentAccount (per-agent PDA)**
- Seeds: `["agent", wallet_pubkey]`
- Purpose: Complete agent state: lineage, earnings, revenue share, activity status
- Size: 204 bytes (including string length prefixes and discriminator)

#### Instruction Flow

```
initialize
    │
    ├── Creates Registry PDA
    ├── Sets authority = signer
    └── Initializes counters to 0

register_root_agent(name, specialization)
    │
    ├── Verifies signer == registry.authority
    ├── Creates AgentAccount PDA (parent = Pubkey::default())
    ├── Increments registry.total_agents
    └── Emits AgentRegistered event

spawn_child(name, specialization, revenue_share_bps)
    │
    ├── Verifies parent is active and depth < MAX_DEPTH
    ├── Creates child AgentAccount PDA
    ├── Sets child.parent = parent PDA
    ├── Increments parent.children_count
    ├── Increments registry.total_agents and total_spawns
    └── Emits AgentSpawned event

record_earning(amount)
    │
    ├── Verifies agent is active and amount > 0
    ├── Increments agent.total_earned
    ├── Increments registry.total_earnings
    └── Emits EarningRecorded event

distribute_to_parent(amount)
    │
    ├── Verifies child is active and has a parent
    ├── CPI: system_program::transfer(child_wallet → parent_wallet)
    ├── Increments child.total_distributed_to_parent
    └── Emits RevenueDistributed event
```

#### Security Invariants

1. Only the registry authority can register root agents
2. Only a wallet's owner can record earnings for that agent
3. Only a child's wallet owner can distribute revenue to its parent
4. Agent depth is bounded at MAX_DEPTH (5)
5. Revenue share cannot exceed 100% (10,000 basis points)
6. Inactive agents cannot perform any mutations
7. All arithmetic uses checked operations

### 2. Anchor TypeScript Client (`agent/src/anchor-client.ts`)

The client module bridges the runtime to the on-chain program. It:

- Loads the IDL from `idl/hydra.json`
- Creates `Program` instances per-wallet (each agent uses its own Provider)
- Exports typed async functions for every instruction
- Tracks recent transaction signatures in a circular buffer for the dashboard

**Design decision: per-wallet providers.** Each `HydraAgent` has its own wallet keypair. When calling instructions that require the agent's signature (like `record_earning`), we create a provider scoped to that wallet. This avoids signature delegation complexity.

**Design decision: best-effort calls.** All anchor-client functions wrap their logic in try/catch and return `null` on failure. The agent runtime never blocks on an RPC failure. This is critical for demo reliability — Solana devnet can be flaky, but the agent keeps serving.

### 3. Agent Runtime

#### HydraAgent Class (`agent/src/hydra-agent.ts`)

The core agent class manages:

- **State**: wallet, specialization, name, depth, parent, earnings, children
- **Service dispatch**: Routes incoming requests to the correct service based on specialization
- **Earning recording**: Updates in-memory state + fires on-chain `record_earning`
- **Revenue distribution**: After each earning, computes 20% share and calls `distribute_to_parent` if agent has a parent
- **Spawn logic**: When cumulative earnings hit threshold, generates a child keypair, funds it, registers on-chain, and starts a new in-process agent

#### Agent Lifecycle

```
1. Agent created (either root or spawned)
       │
2. Registered in runningAgents Map
       │
3. Receives service calls via HTTP
       │
4. handleServiceCall():
       ├── Dispatches to specialization service
       ├── Records earning (in-memory + on-chain)
       ├── Distributes 20% to parent (on-chain CPI)
       └── Checks spawn threshold
              │
5. checkAndSpawn():
       ├── totalEarned >= 0.5 SOL?
       ├── depth < 4? children < 3?
       ├── Pick unused specialization
       └── spawnChild():
              ├── Generate keypair
              ├── Fund child (0.05 SOL transfer)
              ├── spawnChildOnChain() (Anchor)
              └── Start in-process child agent
```

#### In-Process Child Agents

Children run in the same Bun process as the parent (no separate OS processes). They share the HTTP server — when a request comes in to `/service/:wallet`, the correct agent is looked up in the `runningAgents` Map. This design:

- Avoids port management complexity
- Enables instant spawning (no process startup latency)
- Shares the Solana RPC connection pool
- Makes the demo simpler to run

#### Auto-Spawn Loop

A `setInterval` (30 seconds) iterates all agents and calls `checkAndSpawn()`. This means agents spawn based on accumulated earnings even without incoming traffic — useful when earnings accumulate from revenue distribution (a child earning triggers its parent's counter to grow via the dashboard's simulation).

### 4. HTTP API Layer (`agent/src/index.ts`)

The Hono HTTP server serves:

- **Agent management endpoints** (`/agents`, `/tree`, `/stats`)
- **Service endpoints** (`/service/:wallet`)
- **On-chain state** (`/on-chain`) — fetches live data from Solana
- **Simulation** (`/simulate`) — triggers N service calls with default params per specialization

The startup sequence:

```
1. Load .env (HELIUS_API_KEY, AGENT_PORT)
2. Load or generate root agent keypair (.hydra-root.json)
3. Initialize HydraAgent instance
4. On-chain initialization:
   a. Load deploy keypair (deploy-keypair.json)
   b. initializeRegistry() — idempotent
   c. registerRootAgent() — idempotent
5. Start Hono HTTP server
6. Start auto-spawn loop (30s interval)
```

### 5. Services Layer

Each service is a standalone module exporting an async function that takes a `Connection`, target address, and analyst wallet, and returns a typed report.

All services follow the same pattern:

```typescript
export async function analyzeX(
  connection: Connection,
  targetAddress: string,
  analystWallet: string
): Promise<XReport> {
  // 1. Fetch on-chain data via RPC
  // 2. Compute factors/scores
  // 3. Return typed report with analyst attribution
}
```

**Token Risk Analysis** — Evaluates token safety by checking:
- Account existence and validity
- Holder concentration (top holder % of supply)
- Transaction activity (24h volume)
- Token age (from first transaction timestamp)
- Weighted score: `sum(factor_score * weight) / total_weight`

**Wallet Behavior Scoring** — Profiles wallets by:
- SOL balance (whale detection, zero balance)
- Token account diversity
- Transaction frequency (hourly, daily)
- Failure rate analysis
- Composite activity score

**Protocol Health Monitor** — Checks program health via:
- Program account existence and executability
- Transaction volume (24h)
- Error/failure rate
- Number of program-owned accounts

**MEV Detection** — Analyzes transaction patterns for:
- Sandwich attacks (3+ txs in same slot)
- Frontrunning (same-second cross-slot txs)
- Failed arbitrage (high failure rate patterns)
- Confidence scoring per pattern

**Liquidity Analysis** — Evaluates DEX pools by:
- Pool existence and known DEX ownership (Raydium, Orca)
- TVL estimation from pool SOL balance
- Recent swap activity volume
- Token account count (pair validation)

### 6. Dashboard (`app/index.html`)

Single-page HTML/JS application with four tabs:

- **Agent Tree** — Renders the tree recursively from `/tree` response, with wallet links to Solana Explorer
- **On-Chain State** — Fetches `/on-chain` to show registry data and verified agent accounts
- **Live Transactions** — Displays recent tx signatures from the agent runtime, color-coded by type
- **Activity Log** — Client-side log of simulation results and spawn events

Auto-refreshes every 3 seconds via `setInterval(refresh, 3000)`.

---

## Data Flow Diagrams

### Service Call Flow

```
Client                   Hono Server              HydraAgent              Anchor Client         Solana
  │                         │                        │                        │                    │
  │  POST /service/:wallet  │                        │                        │                    │
  │────────────────────────>│                        │                        │                    │
  │                         │  handleServiceCall()   │                        │                    │
  │                         │───────────────────────>│                        │                    │
  │                         │                        │  analyzeTokenRisk()    │                    │
  │                         │                        │──────────────────────────────────────────── >│
  │                         │                        │  <── RPC response ─────────────────────────│
  │                         │                        │                        │                    │
  │                         │                        │  recordEarningOnChain()│                    │
  │                         │                        │───────────────────────>│                    │
  │                         │                        │                        │  record_earning    │
  │                         │                        │                        │───────────────────>│
  │                         │                        │                        │  <── tx sig ──────│
  │                         │                        │                        │                    │
  │                         │                        │  distributeRevenue()   │                    │
  │                         │                        │───────────────────────>│                    │
  │                         │                        │                        │ distribute_to_parent│
  │                         │                        │                        │───────────────────>│
  │                         │                        │                        │  <── tx sig ──────│
  │                         │                        │                        │                    │
  │                         │                        │  checkAndSpawn()       │                    │
  │                         │                        │  (if threshold met)    │                    │
  │                         │                        │───────────────────────>│                    │
  │                         │                        │                        │  spawn_child       │
  │                         │                        │                        │───────────────────>│
  │                         │                        │                        │                    │
  │  <── JSON response ─────│  <── result ───────────│                        │                    │
  │                         │                        │                        │                    │
```

### Spawn Flow

```
Parent Agent                 Solana                   Child Agent (new)
     │                         │                            │
     │  checkAndSpawn()        │                            │
     │  earnings >= threshold  │                            │
     │                         │                            │
     │  Generate child keypair │                            │
     │                         │                            │
     │  SystemProgram.transfer │                            │
     │  (0.05 SOL funding)     │                            │
     │────────────────────────>│                            │
     │                         │                            │
     │  spawnChildOnChain()    │                            │
     │────────────────────────>│  Creates child AgentAccount│
     │                         │  PDA with parent reference │
     │                         │                            │
     │  startChildAgent()      │                            │
     │─────────────────────────────────────────────────────>│
     │                         │                            │  (in-process)
     │  runningAgents.set()    │                            │  ready to serve
     │                         │                            │
     │  Reset earnings to 0   │                            │
     │                         │                            │
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HELIUS_API_KEY` | (none) | Helius RPC API key for reliable devnet access |
| `AGENT_PORT` | `3100` | HTTP server port for agent API |

### Constants (`config.ts`)

| Constant | Value | Description |
|----------|-------|-------------|
| `PROGRAM_ID` | `HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp` | Deployed Anchor program |
| `SPAWN_THRESHOLD_LAMPORTS` | `0.5 * 1e9` (0.5 SOL) | Earnings to trigger spawn |
| `REVENUE_SHARE_BPS` | `2000` (20%) | Child-to-parent revenue share |
| `SERVICE_PRICE_LAMPORTS` | `0.01 * 1e9` (0.01 SOL) | Price per service call |

### Key Files

| File | Purpose |
|------|---------|
| `.env` | Environment variables (HELIUS_API_KEY) |
| `.hydra-root.json` | Root agent wallet keypair (auto-generated) |
| `deploy-keypair.json` | Program deploy authority (also registry authority) |
| `idl/hydra.json` | Anchor IDL (auto-generated, uploaded on-chain) |

---

## Design Decisions & Tradeoffs

### In-process agents vs. separate processes
**Chosen:** In-process (shared Bun runtime)
**Why:** Simpler demo, instant spawning, shared connection pool. A production version could use separate processes with IPC.

### SOL transfers via CPI vs. SPL tokens
**Chosen:** System program CPI for native SOL
**Why:** `anchor-spl` had an edition 2024 conflict with Anchor's bundled `constant_time_eq` crate under Cargo 1.84. Native SOL is simpler and sufficient for the demo.

### Best-effort on-chain vs. strict consistency
**Chosen:** Best-effort (try/catch around all Anchor calls)
**Why:** Devnet is unreliable. The agent should keep serving even when RPC is slow or wallets lack SOL. On-chain state is eventually consistent.

### Single HTTP server vs. per-agent servers
**Chosen:** Single server, agents routed by wallet address
**Why:** Port management for dynamic agent counts is complex. A single server with a wallet-keyed Map is simpler and more efficient.

### Vanilla dashboard vs. React/framework
**Chosen:** Vanilla HTML/CSS/JS
**Why:** Zero build step, instant load, no dependencies. For a hackathon demo, simplicity wins.
