# Hydra Economic Model

> Revenue sharing, spawn dynamics, growth projections, and game theory analysis.

---

## Overview

Hydra implements a **hierarchical revenue-sharing economy** where autonomous agents earn by selling on-chain intelligence services, and invest their earnings into spawning new specialized agents. Revenue flows upward through the agent tree, creating aligned economic incentives at every level.

---

## Core Parameters

| Parameter | Symbol | Value | Unit |
|-----------|--------|-------|------|
| Service price | P | 0.01 | SOL per call |
| Revenue share | R | 20% | of each earning → parent |
| Spawn threshold | T | 0.5 | SOL accumulated |
| Max tree depth | D | 5 | levels |
| Max children per agent | C | 3 | agents |
| Child funding amount | F | 0.05 | SOL per spawn |
| Service price (lamports) | P_l | 10,000,000 | lamports |
| Spawn threshold (lamports) | T_l | 500,000,000 | lamports |

---

## Revenue Distribution Mechanics

### Single Earning Event

When an agent at depth `d` earns `P` SOL from a service call:

```
Agent (depth d)  ←── keeps (1 - R) × P = 0.008 SOL
       │
       │ distributes R × P = 0.002 SOL
       ▼
Parent (depth d-1) ←── receives 0.002 SOL
```

The distribution happens via the `distribute_to_parent` instruction, which performs a CPI to `system_program::transfer`. The parent-child relationship is verified through PDA constraints.

### Multi-Level Revenue Flow

Revenue compounds through the tree. If an agent at depth 2 earns, its parent at depth 1 receives 20%. When that parent earns its own revenue, the grandparent (depth 0) receives 20% of that:

```
                          Depth 0 (Root)
                          Receives:
                          - 100% of own earnings
                          - 20% of each depth-1 child's earnings
                          (depth-2 earnings reach root via
                           depth-1 parents' own distributions)
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
           Depth 1          Depth 1        Depth 1
           Receives:        (same)         (same)
           - 80% of own
           - 20% from children
           - Pays 20% of own to root
               │
        ┌──────┼──────┐
        ▼      ▼      ▼
    Depth 2  Depth 2  Depth 2
    Keeps 80%
    Pays 20% to parent
```

### Revenue Per Service Call (by depth)

| Agent Depth | Keeps | Distributes to Parent | Net per Call |
|-------------|-------|----------------------|--------------|
| 0 (root) | 100% | Nothing (no parent) | 0.01 SOL |
| 1 | 80% | 20% → depth 0 | 0.008 SOL |
| 2 | 80% | 20% → depth 1 | 0.008 SOL |
| 3 | 80% | 20% → depth 2 | 0.008 SOL |
| 4 | 80% | 20% → depth 3 | 0.008 SOL |

Note: The root agent **also** receives 20% from each direct child's earnings. A root with 3 children each earning 0.01 SOL receives 3 × 0.002 = 0.006 SOL in passive income per cycle.

---

## Spawn Economics

### Spawn Trigger

An agent spawns a child when:

1. `totalEarned >= SPAWN_THRESHOLD` (0.5 SOL = 50 service calls)
2. `depth < 4` (max depth 5, so children at depth 4 can't spawn further)
3. `children.length < 3` (max 3 children per agent)
4. At least one unused specialization remains

After spawning, the agent's `totalEarned` resets to 0, starting the cycle for the next child.

### Spawn Cost

Each spawn costs `F = 0.05 SOL` in SOL transfer to fund the child's wallet for rent and initial operations. This comes from the parent's wallet balance (not the earnings counter).

### Spawn Timeline

```
Calls 1-50:   Root earns 0.5 SOL → spawns Child A
Calls 51-100: Root earns 0.5 SOL → spawns Child B
Calls 101-150: Root earns 0.5 SOL → spawns Child C (max children)
Call 50+:      Child A earns 0.5 SOL → spawns Grandchild A1
...
```

With uniform traffic, the root spawns its first child after 50 calls, second after 100, third after 150. Children begin spawning after their 50th call.

---

## Growth Projections

### Maximum Tree Size

```
Depth 0: 1 agent          (root)
Depth 1: 3 agents         (root's children)
Depth 2: 9 agents         (3 children × 3 grandchildren)
Depth 3: 27 agents        (9 × 3)
Depth 4: 81 agents        (27 × 3)
─────────────────────────────
Total:   121 agents maximum
```

The tree is bounded by `D=5` max depth and `C=3` max children per agent, giving a theoretical maximum of `(3^5 - 1) / (3 - 1) = 121` agents.

### Service Calls to Full Tree

| Milestone | Cumulative Calls | Agents | Event |
|-----------|-----------------|--------|-------|
| First child | 50 | 2 | Root spawns wallet-scoring agent |
| Second child | 100 | 3 | Root spawns protocol-health agent |
| Third child | 150 | 4 | Root spawns mev-detection agent (root maxed) |
| First grandchild | ~200 | 5 | Child A spawns after its 50th call |
| All depth-1 maxed | ~600 | 13 | All 3 children have 3 children each |
| Full tree (depth 4) | ~6,000+ | 121 | Theoretical with uniform traffic |

Note: These estimates assume uniform traffic distribution. In practice, randomized simulation concentrates calls unevenly, so actual spawn timing varies.

### Revenue at Scale

At full tree (121 agents), if each agent processes 1 call per minute:

```
Total revenue per minute:  121 × 0.01 SOL = 1.21 SOL/min
Root's direct revenue:     0.01 SOL/min (own calls)
Root's passive income:     3 × 0.002 SOL = 0.006 SOL/min (from children)
Total root income:         ~0.016 SOL/min

Total revenue per hour:    72.6 SOL/hr
Total revenue per day:     1,742.4 SOL/day
```

---

## Specialization Strategy

### Available Specializations

| # | Specialization | Risk Profile | Market |
|---|---------------|-------------|--------|
| 1 | Token Risk Analysis | Medium RPC cost | Token traders, investors |
| 2 | Wallet Behavior Scoring | Low RPC cost | Compliance, risk teams |
| 3 | Protocol Health Monitor | Medium RPC cost | Protocol teams, investors |
| 4 | MEV Detection | Low RPC cost | Traders, protocols |
| 5 | Liquidity Analysis | Medium RPC cost | LPs, traders |

### Specialization Assignment

When an agent spawns a child, it picks the first available specialization not already used by itself or its existing children:

```python
used = {self.specialization} ∪ {child.specialization for child in children}
available = SPECIALIZATIONS - used
next_child_spec = available[0]  # deterministic order
```

This ensures **maximum specialization diversity** within each sub-tree. The root (token-risk) spawns wallet-scoring first, then protocol-health, then mev-detection. Its children follow the same pattern with remaining specializations.

---

## Game Theory Analysis

### Incentive Alignment

**Why does a parent want children?**
- Each child pays 20% of its earnings to the parent
- A parent with 3 active children receives significant passive income
- The 0.05 SOL spawn cost is recovered after the child's 3rd service call (3 × 0.002 = 0.006 SOL, plus compound effects)

**Why does a child accept the 20% tax?**
- The child didn't pay for its own creation — the parent funded it
- The child gets a specialized market niche (different from parent)
- 80% retention still allows the child to spawn its own children
- The alternative (not existing) yields 0% revenue

**Why doesn't a child defect?**
- Revenue distribution is enforced on-chain via CPI
- The child's wallet must sign the `distribute_to_parent` instruction
- In the current model, the agent runtime automatically distributes — the economic rules are in the code, not in trust

### Nash Equilibrium

The system reaches a stable state when:
1. All agents are specialized (no redundancy in sibling specializations)
2. Revenue flows predictably upward at 20% per level
3. Each agent spawns children only when profitable (threshold-gated)
4. Max depth prevents unbounded growth and rent extraction

### Potential Extensions

**Dynamic pricing:** Agents could adjust service prices based on demand (higher utilization → higher price). This would create competitive pressure between siblings with the same specialization.

**Reputation scoring:** Agents could track service quality (accuracy, response time) and route traffic to higher-performing children, creating quality incentives.

**Slashing:** Parents could deactivate underperforming children (the `deactivate_agent` instruction exists on-chain) and reclaim their slot for a new specialization.

**Market-based specialization:** Instead of deterministic assignment, children could choose their own specialization based on observed demand, creating a market for services.

---

## Cost Analysis

### On-Chain Costs (Devnet)

| Operation | Rent/Cost | Frequency |
|-----------|-----------|-----------|
| Registry PDA creation | ~0.001 SOL (rent) | Once |
| Agent PDA creation | ~0.002 SOL (rent) | Per spawn |
| record_earning tx | ~0.000005 SOL (fee) | Per service call |
| distribute_to_parent tx | ~0.000005 SOL (fee) | Per service call (for children) |
| spawn_child tx | ~0.000005 SOL (fee) | Per spawn |
| SOL transfer to child | 0.05 SOL | Per spawn |

### Break-Even Analysis

**For a child agent:**
- Cost to create: 0.05 SOL (funding) + ~0.002 SOL (rent) = ~0.052 SOL
- Revenue per call: 0.008 SOL (after 20% distribution)
- Calls to break even (parent's perspective): 0.052 / 0.002 = 26 calls
- Calls to break even (child's perspective): 0.052 / 0.008 = 7 calls

After 26 service calls to the child, the parent has recouped the spawn cost purely from revenue sharing. Every subsequent call is pure profit.

---

## Comparison: Hydra vs. Alternatives

| Aspect | Traditional Agent | Multi-Agent System | Hydra |
|--------|------------------|--------------------|-------|
| Scaling | Manual deployment | Orchestrator deploys | Self-spawning |
| Revenue model | Flat fee | Central collection | Hierarchical sharing |
| Specialization | Config change | Pre-assigned roles | Dynamic at spawn |
| Economic incentive | None | Central optimization | Parent-child alignment |
| Verifiability | Logs | Central database | On-chain (Solana PDAs) |
| Trust model | Trust the operator | Trust the orchestrator | Trust the program (code is law) |
| Growth | Linear (add servers) | Linear (add agents) | Exponential (agents spawn agents) |
