# Hydra Security Model

> Threat model, security controls, known limitations, and hardening measures.

---

## Threat Model

Hydra operates in three trust domains:

| Domain | Trust Level | Threats |
|--------|------------|---------|
| On-chain program | Trustless (code is law) | Logic bugs, integer overflow, PDA collisions |
| Agent runtime | Trusted operator | RPC injection, keypair theft, DoS |
| Dashboard client | Untrusted browser | XSS, CSRF, data exfiltration |

### Adversary Profiles

1. **Malicious RPC consumer** — Sends crafted requests to the agent HTTP API to trigger errors, DoS, or exfiltrate data
2. **Rogue child agent** — A spawned agent (in a future multi-process model) that tries to avoid revenue distribution
3. **On-chain attacker** — Sends malicious instructions directly to the Solana program to steal funds or corrupt state

---

## On-Chain Security Controls

### PDA Constraint Verification

Every instruction validates accounts through Anchor's PDA constraints:

```rust
#[account(
    mut,
    seeds = [b"agent", wallet.key().as_ref()],
    bump = agent.bump,
)]
pub agent: Account<'info, AgentAccount>,
pub wallet: Signer<'info>,
```

This guarantees that:
- Only the wallet owner can record earnings for their agent
- Only a parent can spawn children from its own PDA
- Only the registry authority can register root agents

### Checked Arithmetic

All counter increments use `checked_add().unwrap()`:

```rust
registry.total_agents = registry.total_agents.checked_add(1).unwrap();
agent.total_earned = agent.total_earned.checked_add(amount).unwrap();
```

While `unwrap()` panics on overflow, u64 overflow requires >18 quintillion lamports (more than total SOL supply).

### Revenue Share Bounds

```rust
require!(revenue_share_bps <= 10_000, HydraError::InvalidRevenueShare);
```

Prevents setting revenue share above 100%.

### Depth Limits

```rust
require!(parent_agent.depth < MAX_DEPTH as u8, HydraError::MaxDepthReached);
```

`MAX_DEPTH = 5` prevents unbounded tree growth and associated rent costs.

### Active Agent Checks

```rust
require!(agent.is_active, HydraError::AgentInactive);
```

Deactivated agents cannot earn, distribute, or spawn.

---

## Runtime Security Controls

### Rate Limiting (v0.3.0)

Per-IP sliding window rate limiter:
- 60 requests per minute across all endpoints
- Returns HTTP 429 with retry guidance
- Stale entries pruned every 5 minutes
- Prevents DoS via unlimited simulate requests

### CORS Restriction (v0.3.0)

Restricted to specific origins instead of wildcard `*`:
- `http://localhost:3100` (agent API self)
- `http://localhost:3000` (dev server)
- `http://127.0.0.1:3100` / `http://127.0.0.1:3000`

### Security Headers (v0.3.0)

All responses include:
- `X-Content-Type-Options: nosniff` — Prevents MIME sniffing
- `X-Frame-Options: DENY` — Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` — Legacy XSS filter
- `Referrer-Policy: strict-origin-when-cross-origin` — Limits referrer leakage

### Input Validation

- **Solana addresses**: Validated via `new PublicKey(address)` before use
- **Simulate calls**: Capped at 100 maximum, floor/ceil enforced
- **Request bodies**: Typed parsing with fallback to empty objects
- **String lengths**: `targetMint` capped at 64 characters

### XSS Prevention (Dashboard)

All user-controlled strings in the dashboard are escaped via `escapeHtml()`:

```javascript
function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

Applied to: agent names, wallet addresses, specialization names, error messages, transaction signatures.

### Retry Logic with Backoff (v0.3.0)

All Anchor RPC calls use exponential backoff (3 attempts, 500ms base):
- Prevents transient devnet failures from killing operations
- Avoids thundering herd on RPC provider

### Graceful Shutdown (v0.3.0)

SIGINT/SIGTERM handlers cleanly stop the HTTP server and log agent count.

### Connection Singleton (v0.3.0)

Single `Connection` instance shared across all agents, avoiding WebSocket exhaustion.

---

## Known Limitations

### L-1: deactivate_agent Authority Check (On-Chain)

**Severity:** High (if deployed to mainnet)
**Status:** Known, documented

The `deactivate_agent` instruction checks for a signer but does not enforce `has_one = authority` on the registry. In the current implementation, any signer could potentially deactivate agents.

**Mitigation:** This is a devnet demo. A mainnet deployment would require adding `has_one = authority` to the `deactivate_agent` accounts struct and redeploying the program.

### L-2: Unchecked parent_wallet in distribute_to_parent (On-Chain)

**Severity:** Medium
**Status:** Known, documented

The `parent_wallet` in `distribute_to_parent` is an `UncheckedAccount`. While the PDA constraint validates the child-parent relationship through `child_agent.parent`, the actual `parent_wallet` could theoretically be any account.

**Mitigation:** The child's PDA seeds include its wallet, and the parent PDA is verified. An attacker would need the child's private key (which they don't have) to sign the transaction.

### L-3: In-Memory State Not Persisted

**Severity:** Low
**Status:** By design

Agent state (earnings, children, service counts) lives in memory. A restart loses this state. On-chain state persists across restarts but in-memory state doesn't.

**Mitigation:** On-chain state is the source of truth. A future version could reload agent state from on-chain PDAs on startup.

### L-4: No TLS

**Severity:** Medium (for production)
**Status:** Expected for local development

The HTTP server runs plain HTTP. For production, a reverse proxy (nginx, Caddy) would provide TLS termination.

### L-5: Keypair Storage

**Severity:** Medium
**Status:** Known

Agent keypairs are stored as JSON files (`.hydra-root.json`, `deploy-keypair.json`). These should be:
- `.gitignore`'d (already done for `.hydra-root.json`)
- Encrypted at rest for production deployments
- Stored in a secrets manager (AWS KMS, Vault) for production

---

## Security Checklist

| Control | Status | Notes |
|---------|--------|-------|
| PDA seed validation | Done | All instructions use Anchor constraints |
| Signer verification | Done | Wallet signers required for all mutations |
| Checked arithmetic | Done | `checked_add().unwrap()` everywhere |
| Revenue share bounds | Done | `<= 10_000` enforced |
| Depth limit | Done | `MAX_DEPTH = 5` |
| Input validation (API) | Done | Address validation, length limits |
| XSS prevention | Done | `escapeHtml()` in dashboard |
| Rate limiting | Done | v0.3.0, 60 req/min per IP |
| CORS restriction | Done | v0.3.0, localhost only |
| Security headers | Done | v0.3.0, nosniff/deny/xss |
| Retry with backoff | Done | v0.3.0, 3 attempts |
| Graceful shutdown | Done | v0.3.0, SIGINT/SIGTERM |
| TLS | Not done | Use reverse proxy for production |
| Keypair encryption | Not done | Use secrets manager for production |
| deactivate_agent fix | Not done | Requires program redeploy |

---

## Responsible Disclosure

This is a hackathon project deployed on Solana devnet. If you find a vulnerability:
1. Do not exploit it on devnet (other teams share the cluster)
2. Open a GitHub issue or contact the team directly
3. We'll fix it and credit you in the release notes
