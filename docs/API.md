# Hydra API Reference

> Complete HTTP API documentation for the Hydra agent runtime.

**Base URL:** `http://localhost:3100`

---

## Table of Contents

- [Overview](#overview)
- [Endpoints](#endpoints)
  - [GET /](#get-)
  - [GET /agents](#get-agents)
  - [GET /agents/:wallet](#get-agentswallet)
  - [GET /tree](#get-tree)
  - [GET /stats](#get-stats)
  - [GET /on-chain](#get-on-chain)
  - [POST /service/:wallet](#post-servicewallet)
  - [POST /simulate](#post-simulate)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

---

## Overview

The Hydra agent runtime exposes a RESTful JSON API via Hono on Bun. All responses are `application/json`. CORS is enabled for all origins.

### Authentication

No authentication is required. The API is designed for local development and demo purposes.

### Common Headers

```
Content-Type: application/json
```

---

## Endpoints

### GET /

Service information and available endpoints.

**Response:**

```json
{
  "name": "Hydra — Self-Replicating Agent Economy",
  "version": "0.2.0",
  "agents": 3,
  "programId": "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp",
  "endpoints": [
    "GET  /                  — This info",
    "GET  /agents            — All running agents",
    "GET  /agents/:wallet    — Agent details",
    "POST /service/:wallet   — Call agent service (paid)",
    "GET  /tree              — Agent lineage tree",
    "GET  /stats             — Economy stats",
    "GET  /on-chain          — On-chain state from Solana",
    "POST /simulate          — Simulate traffic"
  ]
}
```

---

### GET /agents

List all running agents with their current state.

**Response:**

```json
{
  "count": 3,
  "agents": [
    {
      "name": "hydra-root",
      "wallet": "84wE1CjBEo3d5CN6XtBGCXxrwwx9toEh3FUeUcCmCRCQ",
      "specialization": "token-risk-analysis",
      "depth": 0,
      "totalEarned": 500000000,
      "serviceCallCount": 50,
      "childrenCount": 2,
      "children": [
        {
          "wallet": "7nBpJ...",
          "name": "hydra-wallet-d1",
          "specialization": "wallet-behavior-scoring",
          "spawnedAt": 1707580000000
        }
      ],
      "isRoot": true,
      "port": 3100,
      "parentWallet": null
    }
  ]
}
```

**Agent Object Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable agent name |
| `wallet` | string | Solana wallet address (base58) |
| `specialization` | string | Service type this agent provides |
| `depth` | number | Tree depth (0 = root, 1 = child, etc.) |
| `totalEarned` | number | Cumulative earnings in lamports |
| `serviceCallCount` | number | Number of service calls processed |
| `childrenCount` | number | Number of spawned children |
| `children` | ChildAgent[] | Array of child agent references |
| `isRoot` | boolean | Whether this is the root agent |
| `port` | number | Assigned port number |
| `parentWallet` | string \| null | Parent's wallet address (null for root) |

---

### GET /agents/:wallet

Get a specific agent by wallet address.

**Parameters:**

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `wallet` | path | string | Agent's Solana wallet address (base58) |

**Response (200):**

```json
{
  "name": "hydra-root",
  "wallet": "84wE1CjBEo3d5CN6XtBGCXxrwwx9toEh3FUeUcCmCRCQ",
  "specialization": "token-risk-analysis",
  "depth": 0,
  "totalEarned": 500000000,
  "serviceCallCount": 50,
  "childrenCount": 1,
  "children": [],
  "isRoot": true,
  "port": 3100,
  "parentWallet": null
}
```

**Response (404):**

```json
{
  "error": "Agent not found"
}
```

---

### GET /tree

Get the agent lineage tree as a nested structure. Starts from the root agent and recursively includes all descendants.

**Response:**

```json
{
  "name": "hydra-root",
  "wallet": "84wE1CjBEo3d5CN6XtBGCXxrwwx9toEh3FUeUcCmCRCQ",
  "specialization": "token-risk-analysis",
  "depth": 0,
  "totalEarned": 0,
  "serviceCallCount": 55,
  "parentWallet": null,
  "children": [
    {
      "name": "hydra-wallet-d1",
      "wallet": "7nBpJ...",
      "specialization": "wallet-behavior-scoring",
      "depth": 1,
      "totalEarned": 100000000,
      "serviceCallCount": 10,
      "parentWallet": "84wE1CjBEo3d5CN6XtBGCXxrwwx9toEh3FUeUcCmCRCQ",
      "children": []
    }
  ]
}
```

Note: Root agent's `totalEarned` resets to 0 after spawning a child. The historical earnings are tracked on-chain.

---

### GET /stats

Economy-wide aggregate statistics across all running agents.

**Response:**

```json
{
  "totalAgents": 3,
  "totalEarnings": 0.65,
  "totalServiceCalls": 65,
  "totalSpawns": 2,
  "maxDepth": 1,
  "specializations": [
    "token-risk-analysis",
    "wallet-behavior-scoring",
    "protocol-health-monitor"
  ],
  "agentsByDepth": {
    "0": 1,
    "1": 2
  }
}
```

**Stats Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `totalAgents` | number | Total number of running agents |
| `totalEarnings` | number | Sum of all agents' earnings (SOL) |
| `totalServiceCalls` | number | Sum of all service calls processed |
| `totalSpawns` | number | Total number of spawn events |
| `maxDepth` | number | Maximum depth in the agent tree |
| `specializations` | string[] | Unique specializations in use |
| `agentsByDepth` | Record<number, number> | Agent count at each depth level |

---

### GET /on-chain

Fetch live on-chain state directly from Solana devnet. This endpoint queries the Hydra program's Registry PDA and all AgentAccount PDAs.

**Response:**

```json
{
  "programId": "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp",
  "registry": {
    "authority": "2RhasxcihNfT34TxD3GnZGTkPMrjVtyTJ9SkjhrT6dUP",
    "totalAgents": 3,
    "totalEarnings": 0.65,
    "totalSpawns": 2
  },
  "agents": [
    {
      "pda": "Fk3jV8nQp...",
      "wallet": "84wE1CjBEo3d5CN6XtBGCXxrwwx9toEh3FUeUcCmCRCQ",
      "parent": "11111111111111111111111111111111",
      "name": "hydra-root",
      "specialization": "token-risk-analysis",
      "totalEarned": 0.5,
      "totalDistributedToParent": 0,
      "childrenCount": 2,
      "depth": 0,
      "revenueShareBps": 0,
      "isActive": true,
      "createdAt": 1707580000
    }
  ],
  "recentTransactions": [
    {
      "sig": "45KYWpqJegD6maker6KJ...",
      "type": "initialize",
      "ts": 1707580000000
    },
    {
      "sig": "SaiVmTSKS9qqFm7uB93...",
      "type": "register_root_agent",
      "ts": 1707580001000
    }
  ]
}
```

**On-Chain Agent Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `pda` | string | Program Derived Address for this agent |
| `wallet` | string | Agent's operating wallet (base58) |
| `parent` | string | Parent agent's PDA (default pubkey if root) |
| `name` | string | Agent name (on-chain) |
| `specialization` | string | Service specialization (on-chain) |
| `totalEarned` | number | Cumulative on-chain earnings (SOL) |
| `totalDistributedToParent` | number | Total SOL distributed to parent (SOL) |
| `childrenCount` | number | Number of children spawned |
| `depth` | number | Tree depth |
| `revenueShareBps` | number | Revenue share in basis points (0-10000) |
| `isActive` | boolean | Whether agent is active |
| `createdAt` | number | Unix timestamp of creation |

**Transaction Entry Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `sig` | string | Solana transaction signature |
| `type` | string | One of: `initialize`, `register_root_agent`, `spawn_child`, `record_earning`, `distribute_to_parent` |
| `ts` | number | Timestamp (milliseconds) when the runtime tracked this tx |

**Error Response (on-chain unavailable):**

```json
{
  "programId": "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp",
  "registry": null,
  "agents": [],
  "recentTransactions": [],
  "error": "fetch failed"
}
```

---

### POST /service/:wallet

Call an agent's intelligence service. The agent processes the request based on its specialization, records earnings (in-memory and on-chain), distributes revenue to its parent, and checks spawn threshold.

**Parameters:**

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `wallet` | path | string | Target agent's wallet address |

**Request body varies by specialization:**

#### Token Risk Analysis

```json
{
  "mint": "So11111111111111111111111111111111111111112"
}
```

**Response:**

```json
{
  "success": true,
  "agent": { "...agent info..." },
  "result": {
    "mint": "So11111111111111111111111111111111111111112",
    "name": "Unknown",
    "symbol": "???",
    "riskScore": 23,
    "factors": [
      {
        "name": "account_exists",
        "score": 0,
        "weight": 0.3,
        "detail": "Mint account found, 0.00114 SOL rent"
      },
      {
        "name": "holder_concentration",
        "score": 30,
        "weight": 0.35,
        "detail": "Top holder owns 45.2% — moderate distribution"
      },
      {
        "name": "transaction_activity",
        "score": 5,
        "weight": 0.2,
        "detail": "87 transactions in last 24h — high activity"
      },
      {
        "name": "token_age",
        "score": 5,
        "weight": 0.15,
        "detail": "Token has been active for 450 days"
      }
    ],
    "timestamp": 1707580000000,
    "analyst": "84wE1CjBEo3d5CN6XtBGCXxrwwx9toEh3FUeUcCmCRCQ"
  }
}
```

#### Wallet Behavior Scoring

```json
{
  "address": "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"
}
```

**Response result:**

```json
{
  "address": "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg",
  "balanceSol": 12.5,
  "tokenAccounts": 8,
  "recentTxCount": 23,
  "activityScore": 85,
  "riskIndicators": [],
  "timestamp": 1707580000000,
  "analyst": "7nBpJ..."
}
```

#### Protocol Health Monitor

```json
{
  "programId": "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp"
}
```

**Response result:**

```json
{
  "programId": "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp",
  "accountCount": 4,
  "recentTxVolume": 12,
  "errorRate": 0.08,
  "healthScore": 68,
  "factors": [
    { "name": "program_exists", "score": 100, "detail": "Executable program found, 273124 bytes" },
    { "name": "tx_volume", "score": 50, "detail": "12 transactions in last 24h (45 total recent)" },
    { "name": "error_rate", "score": 70, "detail": "8.0% transaction failure rate" },
    { "name": "account_count", "score": 25, "detail": "4 program-owned accounts" }
  ],
  "timestamp": 1707580000000,
  "analyst": "9xKf..."
}
```

#### MEV Detection

```json
{
  "address": "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"
}
```

**Response result:**

```json
{
  "targetAddress": "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg",
  "analyzedTxCount": 50,
  "suspiciousPatterns": [
    {
      "type": "sandwich",
      "confidence": 70,
      "detail": "4 transactions in slot 312456789 — possible sandwich pattern",
      "txSignatures": ["5xK2...", "3nFg...", "9pQw..."]
    }
  ],
  "mevRiskScore": 70,
  "timestamp": 1707580000000,
  "analyst": "2mNp..."
}
```

#### Liquidity Analysis

```json
{
  "pool": "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"
}
```

**Response result:**

```json
{
  "poolAddress": "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
  "tokenA": "unknown",
  "tokenB": "unknown",
  "tvlEstimateSol": 145.67,
  "recentSwapCount": 34,
  "priceImpactScore": 25,
  "liquidityScore": 75,
  "factors": [
    { "name": "pool_exists", "score": 100, "detail": "Pool owned by known DEX program (1024 bytes)" },
    { "name": "tvl_estimate", "score": 80, "detail": "Estimated pool TVL: 145.67 SOL" },
    { "name": "swap_activity", "score": 75, "detail": "34 transactions in last 24h" },
    { "name": "token_accounts", "score": 80, "detail": "Pool holds 2 token account(s)" }
  ],
  "timestamp": 1707580000000,
  "analyst": "4kRt..."
}
```

**Error Response (400):**

```json
{
  "error": "Missing 'mint' parameter"
}
```

**Error Response (404):**

```json
{
  "error": "Agent not found"
}
```

---

### POST /simulate

Simulate N service calls across all running agents. Useful for demos — triggers earning accumulation, spawning, and revenue distribution.

**Request:**

```json
{
  "calls": 50,
  "targetMint": "So11111111111111111111111111111111111111112"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `calls` | number | 10 | Number of service calls to simulate |
| `targetMint` | string | (varies) | Override token mint for token-risk agents |

Each call picks a random agent and uses default parameters for that agent's specialization:

| Specialization | Default Params |
|---------------|---------------|
| token-risk-analysis | `{"mint": "So11111111111111111111111111111111111111112"}` (wrapped SOL) |
| wallet-behavior-scoring | `{"address": "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"}` |
| protocol-health-monitor | `{"programId": "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp"}` |
| mev-detection | `{"address": "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"}` |
| liquidity-analysis | `{"pool": "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"}` |

**Response:**

```json
{
  "simulatedCalls": 50,
  "results": [
    { "agent": "hydra-root", "specialization": "token-risk-analysis", "success": true },
    { "agent": "hydra-wallet-d1", "specialization": "wallet-behavior-scoring", "success": true },
    { "agent": "hydra-root", "specialization": "token-risk-analysis", "error": "RPC timeout" }
  ],
  "agentsAfter": 3,
  "tree": [ "...agent info array..." ]
}
```

**Timing:** Each call has a 200ms delay between requests. Simulating 50 calls takes ~10 seconds.

---

## Data Types

### Specialization

One of:
- `"token-risk-analysis"`
- `"wallet-behavior-scoring"`
- `"protocol-health-monitor"`
- `"mev-detection"`
- `"liquidity-analysis"`

### Lamports vs SOL

- Internal API values (totalEarned, etc.) are in **lamports** (1 SOL = 1,000,000,000 lamports)
- `/stats` endpoint returns `totalEarnings` in **SOL** for readability
- `/on-chain` endpoint returns earnings in **SOL**
- Service prices: 10,000,000 lamports (0.01 SOL) per call

---

## Error Handling

All errors return JSON with an `error` field:

| Status | Meaning | Example |
|--------|---------|---------|
| 400 | Bad request (missing params) | `{"error": "Missing 'mint' parameter"}` |
| 404 | Agent not found | `{"error": "Agent not found"}` |
| 500 | Internal server error | `{"error": "No root agent"}` |

On-chain errors are non-fatal — the API returns success even if the on-chain recording fails. On-chain failures are logged server-side.
