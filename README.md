# 🛡️ VANTAGUARD — The Reflex Layer for DeFi

> *A system that executes protective intent faster than human cognition.*

- 🌐 [Live Dashboard](https://vantaguard-puce.vercel.app)
- 🤖 [Agent on Railway](https://railway.app)
- 🔗 [Etherlink Explorer](https://explorer.etherlink.com)
---

## 🧠 What is Vantaguard?

Vantaguard is the **first autonomous reflex protection layer for DeFi liquidity providers** on Etherlink Mainnet. While you sleep, work, or live your life, Vantaguard's sentinel agent monitors your LP position 24/7 — scanning blocks, mempool activity, liquidity deltas, and gas anomalies in real time.

The moment a threat is detected, Vantaguard doesn't alert you. It **acts**.

> No human in the loop. No delay. No mercy for threats.

---

## ⚡ The Core Innovation — Ghost Move Execution

Traditional DeFi protection requires human intervention. Vantaguard eliminates that dependency entirely.

When a threat is detected:

1. **`logThreat()`** — Agent timestamps the threat on-chain with cryptographic proof
2. **`emergencyExit()`** — Funds pulled from pool in a single atomic transaction
3. **Recovery** — Funds redeployed to safer pool, returned to original position, or sent to wallet
4. **`resetPosition()`** — Vault resets autonomously so protection resumes immediately

The entire sequence — from threat detection to funds secured — happens in **under 6 seconds**.

**Proof of Execution:** https://explorer.etherlink.com/tx/0xd8a9c8a2dcbdfd325ec28527864b84635466d4a7e8527fa9d8cce589da0f4808

---

## 🔥 Core Features

### 🤖 Autonomous Sentinel Agent
- Runs 24/7 on Railway with zero human intervention
- Scans every block on Etherlink Mainnet every 12 seconds
- Multi-signal threat detection across 4 independent data streams
- Self-healing: rebuilds nonces, resets state, recovers from errors automatically
- Demo mode: judges can trigger a simulated attack from the dashboard

### 🧬 Multi-Signal Threat Intelligence Engine

Four independent signals combined into a single **Vibe Score (0–100)**:

| Signal | What It Detects |
|--------|----------------|
| **Gas Signal** | Abnormal gas price spikes indicating network stress |
| **Mempool Signal** | Pending transaction depth and bot activity patterns |
| **Volatility Signal** | Standard deviation of gas prices over rolling window |
| **Liquidity Signal** | Sudden changes in pool TVL and depth |

**Threat types classified:**
`sandwich` · `liquidity_drain` · `flash_loan` · `gas_panic` · `volatility_spike` · `composite`

### 👻 Ghost Move System
- Dynamic signing after `logThreat` confirms — zero nonce conflicts
- `emergencyExit()` broadcasts immediately after threat is stamped on-chain
- Fallback to `moveToSafeVault` if primary exit fails — funds always protected
- `GhostMoveExecuted` event emitted with cryptographic `proofHash`

### 🔁 Intelligent Rerouting (Aggressive Mode)
When funds are secured in the vault, the agent doesn't just sit — it finds a **safer pool** automatically:

1. Fetches all active pools from Oku Trade API
2. Scores each pool by TVL, fee tier, and volume/TVL ratio
3. Calls `setSafePool()` on-chain with the winning pool parameters
4. Executes `redeployToSaferPool()` — minting a new LP position in the safer pool
5. Emits `FundsRedeployedToSaferPool` with new token ID

If no suitable pool is found, the agent falls back to `moveToSafeVault` — sending funds directly to the user's wallet.

### 🎯 Three Strategy Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| **Aggressive** | Scans Oku, scores pools, redeploys funds to safest pool | Active yield maximizers |
| **Stable** | Waits for conditions to normalize, returns to original pool | Balanced LPs |
| **Safety** | Immediately returns all funds to wallet | Maximum protection |

### 🔐 Smart Vault Architecture
Each user gets their own `UserVault` deployed by `ShadowVaultFactory`:

- Non-custodial — only owner and authorized agent can act
- `bunkerMode` — vault locks during active threat response
- `autoModeEnabled` — owner can pause autonomous actions anytime
- `resetPosition()` — full vault reset after recovery for seamless re-onboarding
- `ReflexProof` struct — immutable on-chain record of every ghost move
- `getLatestReflexProof()` — verifiable proof accessible to anyone

### 📊 Live Dashboard
- **Sentinel Radar** — animated canvas radar synced to vibe score and threat state
- **Sentinel Thought Logs** — every agent decision streamed live from Supabase activity log
- **7 Key Metrics** — reaction speed, TVL protected, threats detected, autonomous actions, loss prevented, uptime, cycles
- **Threat Intelligence Panel** — live threat type, confidence score, and factor breakdown bars
- **Funds State Indicator** — `IN_POOL` / `IN_TRANSIT` / `SECURED`
- **Signal Bars** — real-time gas, mempool, volatility, liquidity visualization
- **Reflex History** — complete log of all ghost moves with tx hashes and reaction times
- **Strategy Mode Switcher** — change protection strategy live from dashboard
- **Email Subscription** — subscribe to instant alerts, persisted across sessions

### 📧 Instant Email Alerts
- Ghost Move executed — funds secured
- Funds redeployed to safer pool
- Funds returned to wallet
- Position recovered to original pool

### 🎮 Demo Controls
- **Simulate Attack** — sets `demo_mode = true` in Supabase, agent forces vibe to 20, triggers full autonomous cycle
- **Reset Sentinel** — clears all state, agent resumes normal patrol

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   USER DASHBOARD                     │
│              (Next.js 15 · Vercel)                   │
│  Connect Wallet → Onboard → Monitor → Demo Controls  │
└──────────────────────┬──────────────────────────────┘
                       │ Supabase real-time sync
┌──────────────────────▼──────────────────────────────┐
│                 SENTINEL AGENT                       │
│              (Python · Railway)                      │
│  Block Scanner → Mempool → Threat Engine →           │
│  Intent Layer → Ghost Move → Recovery → Reset        │
└──────────────────────┬──────────────────────────────┘
                       │ web3.py · Etherlink RPC
┌──────────────────────▼──────────────────────────────┐
│              ETHERLINK MAINNET                       │
│  ShadowVaultFactory → UserVault                      │
│  logThreat → emergencyExit → redeployToSaferPool     │
│  GhostMoveExecuted (on-chain proof)                  │
└─────────────────────────────────────────────────────┘
```

---

## 📜 Smart Contracts

| Contract | Address |
|----------|---------|
| `ShadowVaultFactory` | `0xcbfAD0dD3653Ad0D6bA0aCa4Ca7309463235367B` |
| `UserVault` | Unique per user — deployed by factory |
| Position Manager (Oku) | `0x743E03cceB4af2efA3CC76838f6E8B50B63F184c` |
| Swap Router (Oku) | `0xdD489C75be1039ec7d843A6aC2Fd658350B067Cf` |

---

## 🔑 On-Chain Events

```solidity
event GhostMoveExecuted(
    address indexed vault,
    string action,        // "emergencyExit" | "redeployToSaferPool"
    string threatType,    // "sandwich" | "liquidity_drain" | "flash_loan" | ...
    uint256 reactionTime, // seconds from detection to execution
    uint256 blockNumber,
    uint256 token0Secured,
    uint256 token1Secured,
    bytes32 proofHash     // cryptographic fingerprint of the reflex sequence
);

event ThreatDetected(
    uint256 indexed reflexId,
    uint256 threatTimestamp,
    uint256 threatBlock,
    uint256 vibeScore,
    string threatType
);

event FundsRedeployedToSaferPool(uint256 newTokenId, address token0, address token1);
event FundsReturnedToWallet(uint256 token0Amount, uint256 token1Amount);
event PositionReset(address indexed user);
```

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, wagmi, viem, Tailwind |
| Agent | Python, web3.py, Railway |
| Database | Supabase |
| Blockchain | Etherlink Mainnet (Tezos L2, EVM-compatible) |
| DEX | Oku Trade (Uniswap V3 on Etherlink) |
| Email | Resend |
| Contracts | Solidity 0.8.20, Hardhat |
| Deployment | Vercel + Railway |

---

## 🛡️ Onboarding Flow

1. Connect wallet (MetaMask / WalletConnect)
2. Create personal vault — `UserVault` deployed on Etherlink
3. Add liquidity on [Oku Trade](https://oku.trade/app/etherlink)
4. Scan LP positions from wallet
5. Approve LP NFT transfer to vault
6. Register position — NFT transferred, protection activates
7. Sentinel begins 24/7 monitoring

**After a ghost move:**

8. Click Reset Position — vault state cleared
9. Add new liquidity on Oku
10. Re-register — protection resumes

---

## 📡 Agent Pipeline

```
Every 12 seconds:

Block Scan → Mempool Analysis → RPC Heartbeat → Pool Liquidity Delta
                              ↓
              Vibe Score (weighted multi-signal 0-100)
                              ↓
              Threat Classification Engine
                              ↓
              Intent Layer (reads strategy from Supabase)
                              ↓
              HOLD  ──────────────────────────────────→ continue
              EXIT  → logThreat() → emergencyExit()
                              ↓
              [Aggressive] Score pools → setSafePool() → redeployToSaferPool()
              [Stable]     Wait → returnToOriginalPool()
              [Safety]     returnToWallet()
                              ↓
              resetPosition() → resume patrol
```

---

## 🗄️ Supabase Tables

| Table | Purpose |
|-------|---------|
| `security_status` | Vibe score, signals, strategy, user wallet address |
| `activity_log` | Every agent thought streamed to dashboard |
| `threat_events` | All detected threats with confidence scores and factor breakdown |
| `reaction_logs` | Precise ms-level timing of every reflex execution |
| `vault_metrics` | TVL, funds state, protected amounts |
| `reflex_log` | Full ghost move history with tx hashes |

---

## 🏆 Why Vantaguard

| Problem | Solution |
|---------|----------|
| LPs lose funds to sandwich attacks | Ghost move executes before attacker confirms |
| Human reaction too slow | Sub-6-second autonomous response |
| No on-chain proof of protection | `GhostMoveExecuted` with `proofHash` |
| One-size-fits-all protection | Three strategy modes |
| No recovery path after exit | Autonomous rerouting to safer pools via Oku |
| Single point of failure | Circuit breaker, nonce sentinel, safe vault fallback |
| Can't re-use vault after exit | `resetPosition()` — full autonomous lifecycle |

---

## 🌐 Links

- **Live Dashboard:** https://vantaguard-puce.vercel.app
- **Factory Contract:** https://explorer.etherlink.com/address/0xcbfAD0dD3653Ad0D6bA0aCa4Ca7309463235367B
- **Proof of Execution:** https://explorer.etherlink.com/tx/0xd8a9c8a2dcbdfd325ec28527864b84635466d4a7e8527fa9d8cce589da0f4808
- **Oku Trade:** https://oku.trade/app/etherlink

---

## 👥 Built By @web3smallie

On **Etherlink Mainnet** for **TezoEVM** Hackathon Powered by **Nowmedia**.

---

*Vantaguard — The Reflex Layer for DeFi. Faster than human cognition. Smarter than static rules. Always on.*