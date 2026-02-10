# Hydra Testing Guide

> Manual test procedures, verification steps, and troubleshooting.

---

## Prerequisites

- Bun v1.0+ installed
- `.env` file with `HELIUS_API_KEY` (optional but recommended)
- `deploy-keypair.json` present in project root
- Solana CLI installed (for airdrops)

---

## Quick Smoke Test

```bash
# 1. Install dependencies
bun install

# 2. Start the agent
bun run agent

# 3. In another terminal, check health
curl http://localhost:3100/health | jq .

# Expected:
# {
#   "status": "healthy",
#   "uptime": "5s",
#   "agents": 1,
#   "rpc": { "connected": true, "latencyMs": 150 },
#   "program": { "id": "HmHxoZHi...", "reachable": true }
# }
```

---

## Endpoint Tests

### GET / — Service Info

```bash
curl http://localhost:3100/ | jq .
```

**Verify:**
- `version` is `"0.3.0"`
- `agents` is `1` (root agent)
- `programId` is `HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp`
- `endpoints` array lists all routes

### GET /health — Health Check

```bash
curl http://localhost:3100/health | jq .
```

**Verify:**
- `status` is `"healthy"` (or `"degraded"` if devnet is down)
- `rpc.connected` is `true`
- `rpc.latencyMs` is a positive number
- `program.reachable` is `true`
- HTTP status is 200 (healthy) or 503 (degraded)

### GET /agents — List Agents

```bash
curl http://localhost:3100/agents | jq .
```

**Verify:**
- `count` is `1` initially
- First agent has `isRoot: true`, `depth: 0`, `specialization: "token-risk-analysis"`

### GET /tree — Agent Tree

```bash
curl http://localhost:3100/tree | jq .
```

**Verify:**
- Root node has `name: "hydra-root"`, `depth: 0`
- `children` array is initially empty
- After spawning, children appear nested

### GET /stats — Economy Stats

```bash
curl http://localhost:3100/stats | jq .
```

**Verify:**
- `totalAgents` >= 1
- `totalEarnings` >= 0
- `totalServiceCalls` >= 0
- `specializations` includes `"token-risk-analysis"`

### GET /on-chain — On-Chain State

```bash
curl http://localhost:3100/on-chain | jq .
```

**Verify:**
- `programId` is correct
- `registry` has `authority`, `totalAgents` >= 1, `totalEarnings`, `totalSpawns`
- `agents` array has at least the root agent
- Root agent `depth` is `0`, `isActive` is `true`

---

## Service Tests

### Token Risk Analysis

```bash
# Analyze wrapped SOL
curl -X POST http://localhost:3100/service/<ROOT_WALLET> \
  -H "Content-Type: application/json" \
  -d '{"mint": "So11111111111111111111111111111111111111112"}' | jq .
```

**Verify:**
- `result.riskScore` is 0-100
- `result.factors` has entries for `account_exists`, `holder_concentration`, `transaction_activity`, `token_age`
- `result.analyst` matches the root wallet

### Wallet Behavior Scoring

```bash
curl -X POST http://localhost:3100/service/<ROOT_WALLET> \
  -H "Content-Type: application/json" \
  -d '{"address": "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"}' | jq .
```

**Verify:**
- `result.activityScore` is 0-100
- `result.balanceSol` is a number
- `result.riskIndicators` is an array of strings

### Protocol Health Monitor

```bash
# Analyze Hydra's own program
curl -X POST http://localhost:3100/service/<ROOT_WALLET> \
  -H "Content-Type: application/json" \
  -d '{"programId": "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp"}' | jq .
```

**Verify:**
- `result.healthScore` is 0-100
- `result.factors` has `program_exists` with score 100 (it's executable)
- `result.accountCount` > 0

### MEV Detection

```bash
curl -X POST http://localhost:3100/service/<ROOT_WALLET> \
  -H "Content-Type: application/json" \
  -d '{"address": "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"}' | jq .
```

**Verify:**
- `result.mevRiskScore` is 0-100
- `result.analyzedTxCount` is a number
- `result.suspiciousPatterns` is an array

### Liquidity Analysis

```bash
curl -X POST http://localhost:3100/service/<ROOT_WALLET> \
  -H "Content-Type: application/json" \
  -d '{"pool": "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"}' | jq .
```

**Verify:**
- `result.liquidityScore` is 0-100
- `result.tvlEstimateSol` is a number
- `result.factors` has `pool_exists`, `tvl_estimate`, `swap_activity`, `token_accounts`

---

## Simulation Tests

### Basic Simulation

```bash
# Simulate 10 service calls
curl -X POST http://localhost:3100/simulate \
  -H "Content-Type: application/json" \
  -d '{"calls": 10}' | jq .
```

**Verify:**
- `simulatedCalls` is `10`
- `results` has 10 entries, most with `success: true`
- `agentsAfter` >= 1

### Spawn Trigger Test

```bash
# Simulate 60 calls — should trigger at least one spawn
curl -X POST http://localhost:3100/simulate \
  -H "Content-Type: application/json" \
  -d '{"calls": 60}' | jq .
```

**Verify:**
- `agentsAfter` > 1 (at least one child spawned)
- Server logs show `SPAWNING CHILD` messages
- Subsequent `/agents` call shows new agents

### Max Calls Cap Test

```bash
# Try 200 calls — should be capped at 100
curl -X POST http://localhost:3100/simulate \
  -H "Content-Type: application/json" \
  -d '{"calls": 200}' | jq .
```

**Verify:**
- `simulatedCalls` is `100` (not 200)

---

## Input Validation Tests

### Invalid Address

```bash
curl -X POST http://localhost:3100/service/<ROOT_WALLET> \
  -H "Content-Type: application/json" \
  -d '{"mint": "not-a-valid-address"}' | jq .
```

**Verify:**
- HTTP 400 response
- `error` contains "Invalid Solana address"

### Missing Parameter

```bash
curl -X POST http://localhost:3100/service/<ROOT_WALLET> \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

**Verify:**
- HTTP 400 response
- `error` contains "Missing" parameter message

### Agent Not Found

```bash
curl -X POST http://localhost:3100/service/11111111111111111111111111111111 \
  -H "Content-Type: application/json" \
  -d '{"mint": "So11111111111111111111111111111111111111112"}' | jq .
```

**Verify:**
- HTTP 404 response
- `error` is `"Agent not found"`

---

## Rate Limit Test

```bash
# Fire 70 requests rapidly — last 10 should be rate limited
for i in $(seq 1 70); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/agents
done | sort | uniq -c
```

**Verify:**
- First ~60 return `200`
- Remaining return `429`

---

## On-Chain Verification

### Verify Registry on Explorer

1. Go to: https://explorer.solana.com/address/HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp?cluster=devnet
2. Click "Anchor Program" tab
3. Should show IDL with 6 instructions
4. Click "Accounts" — should show Registry and AgentAccount types

### Verify Agent PDAs

```bash
# Get the on-chain state
curl http://localhost:3100/on-chain | jq '.agents[] | {name, pda, wallet, depth}'
```

For each agent, verify the PDA on Explorer:
```
https://explorer.solana.com/address/<PDA>?cluster=devnet
```

### Verify Transaction Signatures

```bash
# Get recent transactions
curl http://localhost:3100/on-chain | jq '.recentTransactions[:5]'
```

Each `sig` should be viewable at:
```
https://explorer.solana.com/tx/<SIG>?cluster=devnet
```

---

## Troubleshooting

### "Registry not initialized" on startup

**Cause:** Deploy keypair doesn't have enough SOL for rent.
**Fix:** Airdrop SOL to the deploy keypair:
```bash
solana airdrop 2 $(solana-keygen pubkey deploy-keypair.json) --url devnet
```

### "Root agent needs SOL!" warning

**Cause:** Root agent wallet has 0 SOL. On-chain operations will fail.
**Fix:** Airdrop SOL to the root agent:
```bash
solana airdrop 2 <ROOT_WALLET_ADDRESS> --url devnet
```

### "On-chain recording failed (non-critical)"

**Cause:** Agent wallet has no SOL for transaction fees, or devnet is congested.
**Impact:** None — earnings are still tracked in-memory. On-chain state will sync when SOL is available.

### "fetchRegistry failed: failed to get info about account"

**Cause:** Registry PDA doesn't exist yet (first run) or RPC is unreachable.
**Fix:** Ensure deploy keypair has SOL and restart.

### High RPC latency (>2000ms)

**Cause:** Public devnet RPC is overloaded.
**Fix:** Add a Helius API key to `.env`:
```bash
echo "HELIUS_API_KEY=your_key_here" >> .env
```

### "Rate limit exceeded" on dashboard

**Cause:** Dashboard polls every 3s. With many tabs open, this can hit the limit.
**Fix:** Rate limit is 60 req/min per IP. Close extra tabs or increase `RATE_LIMIT_MAX_REQUESTS` in `config.ts`.
