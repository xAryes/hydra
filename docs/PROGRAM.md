# Hydra Solana Program Reference

> Complete technical reference for the Hydra Anchor program deployed on Solana devnet.

---

## Program Identity

| Field | Value |
|-------|-------|
| **Program ID** | `HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp` |
| **Cluster** | Solana Devnet |
| **Framework** | Anchor 0.32.1 |
| **Binary size** | 273 KB (.so) |
| **IDL** | Uploaded on-chain, also at `idl/hydra.json` |
| **Explorer** | [View on Solana Explorer](https://explorer.solana.com/address/HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp?cluster=devnet) |

---

## Table of Contents

- [Account Schemas](#account-schemas)
- [PDA Derivation](#pda-derivation)
- [Instructions](#instructions)
- [Events](#events)
- [Error Codes](#error-codes)
- [Constants](#constants)
- [Security Model](#security-model)
- [Account Size Calculations](#account-size-calculations)

---

## Account Schemas

### Registry

Global singleton account tracking the entire agent economy.

```rust
pub struct Registry {
    pub authority: Pubkey,        // 32 bytes — who can register root agents
    pub total_agents: u64,        //  8 bytes — count of all registered agents
    pub total_earnings: u64,      //  8 bytes — sum of all recorded earnings (lamports)
    pub total_spawns: u64,        //  8 bytes — count of all spawn events
    pub bump: u8,                 //  1 byte  — PDA bump seed
}
```

**Total size:** 8 (discriminator) + 32 + 8 + 8 + 8 + 1 = **65 bytes**

**PDA:** `["registry"]` — only one exists per program deployment.

### AgentAccount

Per-agent account storing complete agent state.

```rust
pub struct AgentAccount {
    pub wallet: Pubkey,                      // 32 bytes — agent's operating wallet
    pub parent: Pubkey,                      // 32 bytes — parent agent PDA (default if root)
    pub name: String,                        // 4 + 32 bytes max — human-readable name
    pub specialization: String,              // 4 + 64 bytes max — service type
    pub total_earned: u64,                   //  8 bytes — cumulative earnings (lamports)
    pub total_distributed_to_parent: u64,    //  8 bytes — total revenue shared (lamports)
    pub children_count: u64,                 //  8 bytes — number of spawned children
    pub depth: u8,                           //  1 byte  — tree depth (0 = root)
    pub revenue_share_bps: u16,              //  2 bytes — share to parent (basis points)
    pub is_active: bool,                     //  1 byte  — active/deactivated flag
    pub created_at: i64,                     //  8 bytes — Unix timestamp of creation
    pub bump: u8,                            //  1 byte  — PDA bump seed
}
```

**Total size:** 8 (discriminator) + 32 + 32 + 36 + 68 + 8 + 8 + 8 + 1 + 2 + 1 + 8 + 1 = **213 bytes**

**PDA:** `["agent", wallet_pubkey]` — one per agent wallet.

---

## PDA Derivation

### Registry PDA

```
seeds = [b"registry"]
program_id = HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp
```

TypeScript:
```typescript
const [registryPda, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("registry")],
  PROGRAM_ID
);
```

### Agent PDA

```
seeds = [b"agent", wallet_pubkey.as_ref()]
program_id = HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp
```

TypeScript:
```typescript
const [agentPda, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("agent"), walletPubkey.toBuffer()],
  PROGRAM_ID
);
```

Any client can compute an agent's PDA from its wallet address, enabling permissionless state lookups.

---

## Instructions

### initialize

Creates the global Registry PDA. Called once per program deployment.

**Signers:** Authority (pays rent)

**Accounts:**

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `registry` | Yes | No | PDA: `["registry"]`, init |
| `authority` | Yes | Yes | Registry authority, pays rent |
| `system_program` | No | No | System program |

**Arguments:** None

**Effects:**
- Creates Registry account with `authority = signer`
- Initializes all counters to 0

**Errors:**
- Fails if Registry PDA already exists (Anchor `init` constraint)

---

### register_root_agent

Registers the first agent in the economy. Only callable by the registry authority.

**Signers:** Authority (must match `registry.authority`)

**Accounts:**

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `registry` | Yes | No | PDA: `["registry"]`, has_one = authority |
| `agent` | Yes | No | PDA: `["agent", wallet.key()]`, init |
| `wallet` | No | No | Agent's operating wallet (UncheckedAccount) |
| `authority` | Yes | Yes | Must match registry.authority |
| `system_program` | No | No | System program |

**Arguments:**

| Argument | Type | Constraints | Description |
|----------|------|-------------|-------------|
| `name` | String | len <= 32 | Agent name |
| `specialization` | String | len <= 64 | Service specialization |

**Effects:**
- Creates AgentAccount with `parent = Pubkey::default()`, `depth = 0`, `revenue_share_bps = 0`
- Increments `registry.total_agents`
- Emits `AgentRegistered` event

**Errors:**
- `NameTooLong` — name > 32 characters
- `SpecTooLong` — specialization > 64 characters
- `ConstraintHasOne` — signer != registry.authority

---

### spawn_child

Parent agent spawns a new child agent. The parent wallet signs and pays rent.

**Signers:** Parent wallet

**Accounts:**

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `registry` | Yes | No | PDA: `["registry"]` |
| `parent_agent` | Yes | No | PDA: `["agent", parent_wallet.key()]` |
| `child_agent` | Yes | No | PDA: `["agent", child_wallet.key()]`, init |
| `parent_wallet` | Yes | Yes | Parent's wallet, pays rent |
| `child_wallet` | No | No | Child's wallet (UncheckedAccount) |
| `system_program` | No | No | System program |

**Arguments:**

| Argument | Type | Constraints | Description |
|----------|------|-------------|-------------|
| `name` | String | len <= 32 | Child agent name |
| `specialization` | String | len <= 64 | Child's service specialization |
| `revenue_share_bps` | u16 | <= 10,000 | Revenue share from child to parent |

**Effects:**
- Creates child AgentAccount with `parent = parent_agent PDA`, `depth = parent.depth + 1`
- Increments `parent_agent.children_count`
- Increments `registry.total_agents` and `registry.total_spawns`
- Emits `AgentSpawned` event

**Errors:**
- `NameTooLong` — name > 32 characters
- `SpecTooLong` — specialization > 64 characters
- `InvalidRevenueShare` — revenue_share_bps > 10,000
- `AgentInactive` — parent agent is deactivated
- `MaxDepthReached` — parent.depth >= MAX_DEPTH (5)

---

### record_earning

Records a service earning for an agent. The agent's own wallet must sign.

**Signers:** Agent wallet

**Accounts:**

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `registry` | Yes | No | PDA: `["registry"]` |
| `agent` | Yes | No | PDA: `["agent", wallet.key()]` |
| `wallet` | No | Yes | Agent's wallet (signer proof) |

**Arguments:**

| Argument | Type | Constraints | Description |
|----------|------|-------------|-------------|
| `amount` | u64 | > 0 | Earning amount in lamports |

**Effects:**
- Increments `agent.total_earned` by `amount`
- Increments `registry.total_earnings` by `amount`
- Emits `EarningRecorded` event

**Errors:**
- `ZeroAmount` — amount == 0
- `AgentInactive` — agent is deactivated

---

### distribute_to_parent

Transfers SOL from a child agent's wallet to its parent's wallet. Uses system program CPI for the actual transfer.

**Signers:** Child wallet

**Accounts:**

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `child_agent` | Yes | No | PDA: `["agent", child_wallet.key()]` |
| `parent_agent` | No | No | PDA: `["agent", parent_wallet.key()]` |
| `child_wallet` | Yes | Yes | Child's wallet (signer, source of funds) |
| `parent_wallet` | Yes | No | Parent's wallet (destination, UncheckedAccount) |
| `system_program` | No | No | System program |

**Arguments:**

| Argument | Type | Constraints | Description |
|----------|------|-------------|-------------|
| `amount` | u64 | > 0 | Distribution amount in lamports |

**Effects:**
- Transfers `amount` lamports from child_wallet to parent_wallet via CPI
- Increments `child_agent.total_distributed_to_parent` by `amount`
- Emits `RevenueDistributed` event

**Errors:**
- `ZeroAmount` — amount == 0
- `AgentInactive` — child agent is deactivated
- `NoParentAgent` — child's parent == Pubkey::default()
- Insufficient funds (system program error)

---

### deactivate_agent

Marks an agent as inactive. Inactive agents cannot record earnings or distribute revenue.

**Signers:** Authority

**Accounts:**

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `registry` | No | No | PDA: `["registry"]` |
| `agent` | Yes | No | PDA: `["agent", agent.wallet]` |
| `authority` | No | Yes | Must be authorized |

**Arguments:** None

**Effects:**
- Sets `agent.is_active = false`
- Emits `AgentDeactivated` event

---

## Events

All state-mutating instructions emit events for off-chain indexing and monitoring.

### AgentRegistered

Emitted when a root agent is registered.

```rust
pub struct AgentRegistered {
    pub agent: Pubkey,          // Agent PDA
    pub wallet: Pubkey,         // Agent's wallet
    pub parent: Pubkey,         // Pubkey::default() for root
    pub name: String,
    pub specialization: String,
    pub depth: u8,              // Always 0 for root
}
```

### AgentSpawned

Emitted when a parent spawns a child.

```rust
pub struct AgentSpawned {
    pub child: Pubkey,            // Child agent PDA
    pub parent: Pubkey,           // Parent agent PDA
    pub child_wallet: Pubkey,     // Child's operating wallet
    pub name: String,
    pub specialization: String,
    pub depth: u8,                // Child's depth
    pub revenue_share_bps: u16,   // Revenue share percentage
}
```

### EarningRecorded

Emitted on every service earning.

```rust
pub struct EarningRecorded {
    pub agent: Pubkey,       // Agent PDA
    pub amount: u64,         // Earning amount (lamports)
    pub total_earned: u64,   // New cumulative total (lamports)
}
```

### RevenueDistributed

Emitted on every revenue distribution from child to parent.

```rust
pub struct RevenueDistributed {
    pub child: Pubkey,            // Child agent PDA
    pub parent: Pubkey,           // Parent agent PDA
    pub amount: u64,              // Distribution amount (lamports)
    pub total_distributed: u64,   // New cumulative total (lamports)
}
```

### AgentDeactivated

Emitted when an agent is deactivated.

```rust
pub struct AgentDeactivated {
    pub agent: Pubkey,    // Agent PDA
    pub wallet: Pubkey,   // Agent's wallet
}
```

---

## Error Codes

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| 6000 | `NameTooLong` | Agent name exceeds maximum length | name.len() > 32 |
| 6001 | `SpecTooLong` | Specialization exceeds maximum length | spec.len() > 64 |
| 6002 | `InvalidRevenueShare` | Revenue share basis points must be <= 10000 | bps > 10,000 |
| 6003 | `AgentInactive` | Agent is not active | is_active == false |
| 6004 | `MaxDepthReached` | Maximum agent tree depth reached | depth >= 5 |
| 6005 | `ZeroAmount` | Amount must be greater than zero | amount == 0 |
| 6006 | `NoParentAgent` | Agent has no parent | parent == default |

---

## Constants

```rust
const MAX_DEPTH: u8 = 5;          // Maximum tree depth
const MAX_NAME_LEN: usize = 32;   // Maximum name string length
const MAX_SPEC_LEN: usize = 64;   // Maximum specialization string length
```

---

## Security Model

### Access Control Matrix

| Instruction | Who Can Call | Verification |
|-------------|-------------|--------------|
| `initialize` | Anyone (first caller becomes authority) | PDA init constraint |
| `register_root_agent` | Registry authority only | `has_one = authority` |
| `spawn_child` | Parent agent's wallet | PDA seed verification |
| `record_earning` | Agent's own wallet | PDA seed verification (wallet as signer) |
| `distribute_to_parent` | Child agent's wallet | PDA seed verification |
| `deactivate_agent` | Authority | Signer check |

### PDA Constraints

Every instruction validates accounts through Anchor's PDA constraints:

```rust
// Example: record_earning verifies the agent PDA matches the wallet
#[account(
    mut,
    seeds = [b"agent", wallet.key().as_ref()],
    bump = agent.bump,
)]
pub agent: Account<'info, AgentAccount>,
pub wallet: Signer<'info>,
```

This guarantees that only the wallet owner can record earnings for their agent, and prevents spoofing.

### Arithmetic Safety

All counter increments use `checked_add().unwrap()`:

```rust
registry.total_agents = registry.total_agents.checked_add(1).unwrap();
agent.total_earned = agent.total_earned.checked_add(amount).unwrap();
```

This prevents integer overflow, though `unwrap()` will panic on overflow rather than returning an error. In practice, u64 overflow requires >18 quintillion lamports, which exceeds the total SOL supply.

### CPI Safety

The `distribute_to_parent` instruction uses a CPI to the system program for SOL transfer:

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

The child wallet must be a signer, preventing unauthorized withdrawals. The parent wallet is validated as an `UncheckedAccount` because it's the destination (not a PDA-controlled account).

### Invariants

1. **Agent uniqueness:** One AgentAccount per wallet (PDA seed prevents duplicates)
2. **Depth bound:** No agent at depth >= MAX_DEPTH can spawn children
3. **Revenue share bound:** revenue_share_bps <= 10,000 (100%)
4. **Active check:** Inactive agents cannot earn or distribute
5. **Parent existence:** distribute_to_parent requires parent != Pubkey::default()
6. **Authority check:** Only registry authority can register root agents

---

## Account Size Calculations

### Registry

```
Discriminator:    8 bytes
authority:       32 bytes (Pubkey)
total_agents:     8 bytes (u64)
total_earnings:   8 bytes (u64)
total_spawns:     8 bytes (u64)
bump:             1 byte  (u8)
─────────────────────────
Total:           65 bytes
Rent:            ~0.001 SOL
```

### AgentAccount

```
Discriminator:                 8 bytes
wallet:                       32 bytes (Pubkey)
parent:                       32 bytes (Pubkey)
name:                  4 + 32 = 36 bytes (String: len prefix + max content)
specialization:        4 + 64 = 68 bytes (String: len prefix + max content)
total_earned:                  8 bytes (u64)
total_distributed_to_parent:   8 bytes (u64)
children_count:                8 bytes (u64)
depth:                         1 byte  (u8)
revenue_share_bps:             2 bytes (u16)
is_active:                     1 byte  (bool)
created_at:                    8 bytes (i64)
bump:                          1 byte  (u8)
──────────────────────────────────────
Total:                       213 bytes
Rent:                        ~0.002 SOL
```

---

## IDL Location

The IDL (Interface Description Language) is available in two places:

1. **Local file:** `idl/hydra.json` — used by the TypeScript client
2. **On-chain:** Uploaded via `anchor idl init` — queryable by any client

The on-chain IDL enables any developer to interact with the Hydra program without needing the source code.
