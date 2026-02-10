use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp");

/// Max depth of agent tree to prevent unbounded recursion
const MAX_DEPTH: u8 = 5;
/// Max name length
const MAX_NAME_LEN: usize = 32;
/// Max specialization length
const MAX_SPEC_LEN: usize = 64;

#[program]
pub mod hydra {
    use super::*;

    /// Initialize the Hydra registry. Called once.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.authority = ctx.accounts.authority.key();
        registry.total_agents = 0;
        registry.total_earnings = 0;
        registry.total_spawns = 0;
        registry.bump = ctx.bumps.registry;
        Ok(())
    }

    /// Register the root agent (no parent). Only callable by registry authority.
    pub fn register_root_agent(
        ctx: Context<RegisterRootAgent>,
        name: String,
        specialization: String,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, HydraError::NameTooLong);
        require!(specialization.len() <= MAX_SPEC_LEN, HydraError::SpecTooLong);

        let agent = &mut ctx.accounts.agent;
        agent.wallet = ctx.accounts.wallet.key();
        agent.parent = Pubkey::default();
        agent.name = name;
        agent.specialization = specialization;
        agent.total_earned = 0;
        agent.total_distributed_to_parent = 0;
        agent.children_count = 0;
        agent.depth = 0;
        agent.revenue_share_bps = 0;
        agent.is_active = true;
        agent.created_at = Clock::get()?.unix_timestamp;
        agent.bump = ctx.bumps.agent;

        let registry = &mut ctx.accounts.registry;
        registry.total_agents = registry.total_agents.checked_add(1).unwrap();

        emit!(AgentRegistered {
            agent: agent.key(),
            wallet: agent.wallet,
            parent: Pubkey::default(),
            name: agent.name.clone(),
            specialization: agent.specialization.clone(),
            depth: 0,
        });

        Ok(())
    }

    /// Parent agent spawns a child agent.
    pub fn spawn_child(
        ctx: Context<SpawnChild>,
        name: String,
        specialization: String,
        revenue_share_bps: u16,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, HydraError::NameTooLong);
        require!(specialization.len() <= MAX_SPEC_LEN, HydraError::SpecTooLong);
        require!(revenue_share_bps <= 10_000, HydraError::InvalidRevenueShare);

        let parent = &ctx.accounts.parent_agent;
        require!(parent.is_active, HydraError::AgentInactive);
        require!(parent.depth < MAX_DEPTH, HydraError::MaxDepthReached);

        let child = &mut ctx.accounts.child_agent;
        child.wallet = ctx.accounts.child_wallet.key();
        child.parent = ctx.accounts.parent_agent.key();
        child.name = name.clone();
        child.specialization = specialization.clone();
        child.total_earned = 0;
        child.total_distributed_to_parent = 0;
        child.children_count = 0;
        child.depth = parent.depth.checked_add(1).unwrap();
        child.revenue_share_bps = revenue_share_bps;
        child.is_active = true;
        child.created_at = Clock::get()?.unix_timestamp;
        child.bump = ctx.bumps.child_agent;

        let parent_agent = &mut ctx.accounts.parent_agent;
        parent_agent.children_count = parent_agent.children_count.checked_add(1).unwrap();

        let registry = &mut ctx.accounts.registry;
        registry.total_agents = registry.total_agents.checked_add(1).unwrap();
        registry.total_spawns = registry.total_spawns.checked_add(1).unwrap();

        emit!(AgentSpawned {
            child: child.key(),
            parent: ctx.accounts.parent_agent.key(),
            child_wallet: child.wallet,
            name,
            specialization,
            depth: child.depth,
            revenue_share_bps,
        });

        Ok(())
    }

    /// Record earnings for an agent (called by agent's own wallet).
    pub fn record_earning(ctx: Context<RecordEarning>, amount: u64) -> Result<()> {
        require!(amount > 0, HydraError::ZeroAmount);

        let agent = &mut ctx.accounts.agent;
        require!(agent.is_active, HydraError::AgentInactive);

        agent.total_earned = agent.total_earned.checked_add(amount).unwrap();

        let registry = &mut ctx.accounts.registry;
        registry.total_earnings = registry.total_earnings.checked_add(amount).unwrap();

        emit!(EarningRecorded {
            agent: agent.key(),
            amount,
            total_earned: agent.total_earned,
        });

        Ok(())
    }

    /// Distribute SOL revenue from child to parent via system transfer.
    pub fn distribute_to_parent(ctx: Context<DistributeToParent>, amount: u64) -> Result<()> {
        require!(amount > 0, HydraError::ZeroAmount);

        let child = &ctx.accounts.child_agent;
        require!(child.is_active, HydraError::AgentInactive);
        require!(child.parent != Pubkey::default(), HydraError::NoParentAgent);

        // SOL transfer from child wallet to parent wallet
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

        let child_mut = &mut ctx.accounts.child_agent;
        child_mut.total_distributed_to_parent = child_mut
            .total_distributed_to_parent
            .checked_add(amount)
            .unwrap();

        emit!(RevenueDistributed {
            child: child_mut.key(),
            parent: ctx.accounts.parent_agent.key(),
            amount,
            total_distributed: child_mut.total_distributed_to_parent,
        });

        Ok(())
    }

    /// Deactivate an agent.
    pub fn deactivate_agent(ctx: Context<DeactivateAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        agent.is_active = false;

        emit!(AgentDeactivated {
            agent: agent.key(),
            wallet: agent.wallet,
        });

        Ok(())
    }
}

// ============================================================================
// Accounts
// ============================================================================

#[account]
pub struct Registry {
    pub authority: Pubkey,
    pub total_agents: u64,
    pub total_earnings: u64,
    pub total_spawns: u64,
    pub bump: u8,
}

impl Registry {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct AgentAccount {
    pub wallet: Pubkey,
    pub parent: Pubkey,
    pub name: String,
    pub specialization: String,
    pub total_earned: u64,
    pub total_distributed_to_parent: u64,
    pub children_count: u64,
    pub depth: u8,
    pub revenue_share_bps: u16,
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl AgentAccount {
    pub const SIZE: usize = 8 + 32 + 32 + (4 + MAX_NAME_LEN) + (4 + MAX_SPEC_LEN) + 8 + 8 + 8 + 1 + 2 + 1 + 8 + 1;
}

// ============================================================================
// Instruction Contexts
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Registry::SIZE,
        seeds = [b"registry"],
        bump,
    )]
    pub registry: Account<'info, Registry>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct RegisterRootAgent<'info> {
    #[account(
        mut,
        seeds = [b"registry"],
        bump = registry.bump,
        has_one = authority,
    )]
    pub registry: Account<'info, Registry>,
    #[account(
        init,
        payer = authority,
        space = AgentAccount::SIZE,
        seeds = [b"agent", wallet.key().as_ref()],
        bump,
    )]
    pub agent: Account<'info, AgentAccount>,
    /// CHECK: Agent's operating wallet, validated by PDA seed
    pub wallet: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct SpawnChild<'info> {
    #[account(
        mut,
        seeds = [b"registry"],
        bump = registry.bump,
    )]
    pub registry: Account<'info, Registry>,
    #[account(
        mut,
        seeds = [b"agent", parent_wallet.key().as_ref()],
        bump = parent_agent.bump,
    )]
    pub parent_agent: Account<'info, AgentAccount>,
    #[account(
        init,
        payer = parent_wallet,
        space = AgentAccount::SIZE,
        seeds = [b"agent", child_wallet.key().as_ref()],
        bump,
    )]
    pub child_agent: Account<'info, AgentAccount>,
    #[account(mut)]
    pub parent_wallet: Signer<'info>,
    /// CHECK: New child agent's wallet, validated by PDA seed
    pub child_wallet: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordEarning<'info> {
    #[account(
        mut,
        seeds = [b"registry"],
        bump = registry.bump,
    )]
    pub registry: Account<'info, Registry>,
    #[account(
        mut,
        seeds = [b"agent", wallet.key().as_ref()],
        bump = agent.bump,
    )]
    pub agent: Account<'info, AgentAccount>,
    pub wallet: Signer<'info>,
}

#[derive(Accounts)]
pub struct DistributeToParent<'info> {
    #[account(
        mut,
        seeds = [b"agent", child_wallet.key().as_ref()],
        bump = child_agent.bump,
    )]
    pub child_agent: Account<'info, AgentAccount>,
    #[account(
        seeds = [b"agent", parent_wallet.key().as_ref()],
        bump = parent_agent.bump,
    )]
    pub parent_agent: Account<'info, AgentAccount>,
    #[account(mut)]
    pub child_wallet: Signer<'info>,
    /// CHECK: Parent's wallet, validated by parent_agent PDA
    #[account(mut)]
    pub parent_wallet: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeactivateAgent<'info> {
    #[account(
        seeds = [b"registry"],
        bump = registry.bump,
    )]
    pub registry: Account<'info, Registry>,
    #[account(
        mut,
        seeds = [b"agent", agent.wallet.as_ref()],
        bump = agent.bump,
    )]
    pub agent: Account<'info, AgentAccount>,
    pub authority: Signer<'info>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
    pub wallet: Pubkey,
    pub parent: Pubkey,
    pub name: String,
    pub specialization: String,
    pub depth: u8,
}

#[event]
pub struct AgentSpawned {
    pub child: Pubkey,
    pub parent: Pubkey,
    pub child_wallet: Pubkey,
    pub name: String,
    pub specialization: String,
    pub depth: u8,
    pub revenue_share_bps: u16,
}

#[event]
pub struct EarningRecorded {
    pub agent: Pubkey,
    pub amount: u64,
    pub total_earned: u64,
}

#[event]
pub struct RevenueDistributed {
    pub child: Pubkey,
    pub parent: Pubkey,
    pub amount: u64,
    pub total_distributed: u64,
}

#[event]
pub struct AgentDeactivated {
    pub agent: Pubkey,
    pub wallet: Pubkey,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum HydraError {
    #[msg("Agent name exceeds maximum length")]
    NameTooLong,
    #[msg("Specialization exceeds maximum length")]
    SpecTooLong,
    #[msg("Revenue share basis points must be <= 10000")]
    InvalidRevenueShare,
    #[msg("Agent is not active")]
    AgentInactive,
    #[msg("Maximum agent tree depth reached")]
    MaxDepthReached,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Agent has no parent")]
    NoParentAgent,
}
