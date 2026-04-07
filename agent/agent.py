import os
import time
import logging
import requests
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s")
log = logging.getLogger("vantaguard")

# ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
SUPABASE_URL = "https://waljgojrqgpkheufekna.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhbGpnb2pycWdwa2hldWZla25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzcxODYsImV4cCI6MjA5MTE1MzE4Nn0.jpW9izTPkZ1RqukLboOfFXsTzwzkBjZNkeQYZ-9pHuo"

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation"
}

# ── ETHERLINK CONFIG ──────────────────────────────────────────────────────────
RPC_URL           = "https://node.shadownet.etherlink.com"
REGISTRY_ADDRESS  = "0xc61F00f55A844B10eF0c739b856a4d91aE6575C5"
VIBE_THRESHOLD    = 30
POLL_INTERVAL     = 12
GAS_BASELINE_GWEI = 0.05

# ── MULTI-SIGNAL WEIGHTS (must sum to 1.0) ────────────────────────────────────
# Each signal contributes a % of the final vibe score
WEIGHT_GAS        = 0.30   # gas spike = panic indicator
WEIGHT_MEMPOOL    = 0.20   # mempool congestion
WEIGHT_VOLATILITY = 0.25   # price volatility
WEIGHT_LIQUIDITY  = 0.25   # liquidity drain from pool

# ── WALLET CONFIG ─────────────────────────────────────────────────────────────
PRIVATE_KEY  = os.environ.get("PRIVATE_KEY")
AGENT_WALLET = os.environ.get("AGENT_WALLET")

# ── SHADOWVAULT ABI ───────────────────────────────────────────────────────────
SHADOW_VAULT_ABI = [
    {
        "inputs": [{"internalType": "uint256", "name": "vibeScore", "type": "uint256"}],
        "name": "logThreat",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "emergencyExit",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint8", "name": "mode", "type": "uint8"}],
        "name": "redeployToSaferPool",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "returnToWallet",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

# ── CONNECT ETHERLINK ─────────────────────────────────────────────────────────
w3 = Web3(Web3.HTTPProvider(RPC_URL))
w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

vault = w3.eth.contract(
    address=Web3.to_checksum_address(REGISTRY_ADDRESS),
    abi=SHADOW_VAULT_ABI
)

# ── GHOST ROUTE STATE ─────────────────────────────────────────────────────────
_ghost_hex   = None   # pre-signed emergencyExit raw hex
_ghost_nonce = None   # nonce used at signing time

# ── SIGNAL HISTORY (rolling window for volatility calc) ──────────────────────
_price_history    = []   # last N gas readings used as price proxy
_liquidity_history = []  # last N pending tx counts as liquidity proxy
HISTORY_WINDOW    = 5    # number of readings to keep


# ══════════════════════════════════════════════════════════════════════════════
#  GHOST ROUTE — PRE-SIGN AT STARTUP
# ══════════════════════════════════════════════════════════════════════════════

def build_ghost_route():
    """
    Pre-signs emergencyExit() at startup.
    Stored as raw hex — zero signing latency on trigger.
    """
    global _ghost_hex, _ghost_nonce

    if not PRIVATE_KEY or not AGENT_WALLET:
        log.error("❌ PRIVATE_KEY / AGENT_WALLET not set — ghost route disabled")
        return

    try:
        nonce     = w3.eth.get_transaction_count(AGENT_WALLET, "pending")
        gas_price = w3.eth.gas_price

        tx = vault.functions.emergencyExit().build_transaction({
            "from":     AGENT_WALLET,
            "nonce":    nonce,
            "gas":      300_000,
            "gasPrice": gas_price,
            "chainId":  w3.eth.chain_id,
        })

        signed       = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
        _ghost_hex   = signed.raw_transaction.hex()
        _ghost_nonce = nonce

        log.info(f"👻 Ghost route armed — nonce {nonce}")

    except Exception as e:
        log.error(f"Ghost route build failed: {e}")
        _ghost_hex = None


def check_nonce_sentinel():
    """
    If a competing tx consumed the ghost route nonce, rebuild immediately.
    Called every loop cycle.
    """
    global _ghost_hex, _ghost_nonce

    if not AGENT_WALLET or _ghost_nonce is None:
        return

    current_nonce = w3.eth.get_transaction_count(AGENT_WALLET, "latest")
    if current_nonce > _ghost_nonce:
        log.warning(f"⚠️  Nonce stale ({_ghost_nonce} consumed) — rebuilding ghost route")
        build_ghost_route()


# ══════════════════════════════════════════════════════════════════════════════
#  MULTI-SIGNAL THREAT ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def get_gas_gwei() -> float:
    return float(w3.from_wei(w3.eth.gas_price, "gwei"))


def get_pending_tx_count() -> int:
    try:
        pending = w3.eth.get_block("pending", full_transactions=True)
        return len(pending.transactions)
    except Exception:
        return 0


def calculate_gas_signal(gas_gwei: float) -> float:
    """
    Score 0–100. Drops as gas spikes above baseline.
    Gas spike = panic indicator (bots + humans fleeing).
    """
    gas_ratio = gas_gwei / GAS_BASELINE_GWEI
    return max(0.0, 100.0 * (1 - (gas_ratio - 1) / 9))


def calculate_mempool_signal(pending_tx: int) -> float:
    """
    Score 0–100. Drops as mempool fills.
    High pending tx = congestion / mass exit.
    """
    return max(0.0, 100.0 * (1 - pending_tx / 500))


def calculate_volatility_signal(gas_gwei: float) -> float:
    """
    Score 0–100. Measures how much gas has moved over recent readings.
    Using gas as price proxy — spiky gas = volatile conditions.
    High volatility = lower score.
    """
    global _price_history

    _price_history.append(gas_gwei)
    if len(_price_history) > HISTORY_WINDOW:
        _price_history.pop(0)

    if len(_price_history) < 2:
        return 80.0  # not enough data — assume ok

    avg   = sum(_price_history) / len(_price_history)
    diffs = [abs(p - avg) for p in _price_history]
    std   = (sum(d ** 2 for d in diffs) / len(diffs)) ** 0.5

    # Normalize: std > 5x baseline = score 0
    volatility_ratio = std / GAS_BASELINE_GWEI
    return max(0.0, 100.0 * (1 - volatility_ratio / 5))


def calculate_liquidity_signal(pending_tx: int) -> float:
    """
    Score 0–100. Tracks rate of change in pending tx count.
    Sudden spike in pending = liquidity drain / rush for the exit.
    """
    global _liquidity_history

    _liquidity_history.append(pending_tx)
    if len(_liquidity_history) > HISTORY_WINDOW:
        _liquidity_history.pop(0)

    if len(_liquidity_history) < 2:
        return 80.0  # not enough data — assume ok

    prev = _liquidity_history[-2]
    curr = _liquidity_history[-1]

    if prev == 0:
        return 80.0

    change_ratio = (curr - prev) / prev
    # Sudden 50%+ spike in mempool = score 0
    return max(0.0, 100.0 * (1 - change_ratio / 0.5))


def calculate_vibe_score() -> dict:
    """
    Weighted multi-signal vibe score.
    Each signal scored 0–100, combined by weight into final score.

    Signals:
      - Gas spike        (30%) — panic indicator
      - Mempool load     (20%) — congestion
      - Volatility       (25%) — price instability
      - Liquidity drain  (25%) — exit rush
    """
    gas_gwei   = get_gas_gwei()
    pending_tx = get_pending_tx_count()

    gas_signal        = calculate_gas_signal(gas_gwei)
    mempool_signal    = calculate_mempool_signal(pending_tx)
    volatility_signal = calculate_volatility_signal(gas_gwei)
    liquidity_signal  = calculate_liquidity_signal(pending_tx)

    vibe_score = round(
        (gas_signal        * WEIGHT_GAS)        +
        (mempool_signal    * WEIGHT_MEMPOOL)     +
        (volatility_signal * WEIGHT_VOLATILITY)  +
        (liquidity_signal  * WEIGHT_LIQUIDITY),
        1
    )

    return {
        "vibe_score":        vibe_score,
        "gas_gwei":          round(gas_gwei, 4),
        "pending_tx":        pending_tx,
        "signals": {
            "gas":        round(gas_signal, 1),
            "mempool":    round(mempool_signal, 1),
            "volatility": round(volatility_signal, 1),
            "liquidity":  round(liquidity_signal, 1),
        }
    }


# ══════════════════════════════════════════════════════════════════════════════
#  INTENT LAYER — USER RISK POLICY → EXECUTION RULES
# ══════════════════════════════════════════════════════════════════════════════

def get_intent_policy() -> dict:
    """
    Reads user-defined intent rules from Supabase.
    Translates into executable risk policy for the agent.

    Expected Supabase columns in security_status:
      - strategy_mode       int  (0=Aggressive, 1=Stable, 2=Safety)
      - max_loss_pct        float (e.g. 5.0 = never lose more than 5%)
      - min_pool_liquidity  float (e.g. 100000 = avoid pools under $100k)
      - prefer_stable       bool  (true = always route to stablecoin pools)
    """
    defaults = {
        "strategy_mode":      2,       # Safety by default
        "max_loss_pct":       5.0,     # 5% max loss tolerance
        "min_pool_liquidity": 50000.0, # $50k minimum pool size
        "prefer_stable":      True,    # prefer stable pools
    }

    try:
        res  = requests.get(
            f"{SUPABASE_URL}/rest/v1/security_status?limit=1",
            headers=HEADERS
        )
        rows = res.json()
        if not rows:
            return defaults

        row = rows[0]
        return {
            "strategy_mode":      int(row.get("strategy_mode",      defaults["strategy_mode"])),
            "max_loss_pct":       float(row.get("max_loss_pct",     defaults["max_loss_pct"])),
            "min_pool_liquidity": float(row.get("min_pool_liquidity", defaults["min_pool_liquidity"])),
            "prefer_stable":      bool(row.get("prefer_stable",     defaults["prefer_stable"])),
        }

    except Exception as e:
        log.error(f"Intent policy read failed: {e}")
        return defaults


def policy_to_action(policy: dict, vibe_score: float) -> str:
    """
    Translates intent policy + current vibe score into a concrete action.

    Returns one of:
      "HOLD"           — conditions ok, no action
      "EMERGENCY_EXIT" — pull everything now
      "REDEPLOY"       — move to safer pool
      "RETURN_WALLET"  — send to owner wallet
    """
    mode = policy["strategy_mode"]

    # Safety mode (2) — exit at any score below threshold
    if mode == 2:
        if vibe_score < VIBE_THRESHOLD:
            return "EMERGENCY_EXIT"

    # Stable mode (1) — exit at threshold, redeploy when recovered
    elif mode == 1:
        if vibe_score < VIBE_THRESHOLD:
            return "EMERGENCY_EXIT"
        if vibe_score > 60:
            return "REDEPLOY"

    # Aggressive mode (0) — only exit on severe threat
    elif mode == 0:
        if vibe_score < (VIBE_THRESHOLD * 0.6):  # only exit below 18
            return "EMERGENCY_EXIT"

    return "HOLD"


# ══════════════════════════════════════════════════════════════════════════════
#  REFLEX BROADCASTER
# ══════════════════════════════════════════════════════════════════════════════

def call_log_threat(vibe_score: float):
    """
    Calls logThreat() on ShadowVault BEFORE broadcasting emergencyExit.
    This creates the on-chain timestamp proof of threat detection.
    """
    if not PRIVATE_KEY or not AGENT_WALLET:
        log.error("❌ Cannot call logThreat — wallet not configured")
        return

    try:
        nonce     = w3.eth.get_transaction_count(AGENT_WALLET, "pending")
        gas_price = w3.eth.gas_price

        tx = vault.functions.logThreat(int(vibe_score)).build_transaction({
            "from":     AGENT_WALLET,
            "nonce":    nonce,
            "gas":      100_000,
            "gasPrice": gas_price,
            "chainId":  w3.eth.chain_id,
        })

        signed = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        log.info(f"🔍 logThreat tx: {tx_hash.hex()}")

        # Wait for confirmation before broadcasting emergencyExit
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
        log.info("✅ logThreat confirmed on-chain")

    except Exception as e:
        log.error(f"logThreat failed: {e}")


def trigger_reflex(vibe_score: float, strategy_mode: int) -> dict | None:
    """
    Full reflex sequence:
      1. logThreat() — on-chain timestamp proof
      2. broadcast pre-signed emergencyExit hex — zero signing latency
      3. poll for confirmation
      4. log ms-precision timestamps to Supabase reflex_log
    """
    global _ghost_hex

    if not _ghost_hex:
        log.error("❌ No ghost route — cannot trigger reflex")
        return None

    # Step 1 — on-chain threat proof
    threat_detected_ms = int(time.time() * 1000)
    log.warning(f"🚨 REFLEX TRIGGERED — Vibe: {vibe_score} | T={threat_detected_ms}ms")

    call_log_threat(vibe_score)

    # Step 2 — broadcast pre-signed hex (no signing latency)
    try:
        tx_hash = w3.eth.send_raw_transaction(bytes.fromhex(_ghost_hex.lstrip("0x")))
        tx_broadcast_ms = int(time.time() * 1000)
        log.info(f"📡 Ghost move broadcast — {tx_hash.hex()} | T={tx_broadcast_ms}ms")

        # Step 3 — poll for confirmation
        receipt = None
        for _ in range(60):
            try:
                receipt = w3.eth.get_transaction_receipt(tx_hash)
                if receipt:
                    break
            except Exception:
                pass
            time.sleep(2)

        tx_confirmed_ms   = int(time.time() * 1000)
        reaction_speed_ms = tx_confirmed_ms - threat_detected_ms

        log.info(f"⚡ CONFIRMED — Reaction: {reaction_speed_ms}ms")

        # Step 4 — log to Supabase
        log_reflex(
            threat_detected_ms  = threat_detected_ms,
            tx_broadcast_ms     = tx_broadcast_ms,
            tx_confirmed_ms     = tx_confirmed_ms,
            reaction_speed_ms   = reaction_speed_ms,
            vibe_score          = vibe_score,
            strategy_mode       = strategy_mode,
            tx_hash             = tx_hash.hex()
        )

        # Rebuild ghost route — old one is consumed
        _ghost_hex = None
        build_ghost_route()

        return receipt

    except Exception as e:
        log.error(f"Reflex broadcast failed: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  SUPABASE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def log_reflex(threat_detected_ms, tx_broadcast_ms, tx_confirmed_ms,
               reaction_speed_ms, vibe_score, strategy_mode, tx_hash):
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/reflex_log",
            headers=HEADERS,
            json={
                "threat_detected_ms":    threat_detected_ms,
                "tx_broadcast_ms":       tx_broadcast_ms,
                "tx_confirmed_ms":       tx_confirmed_ms,
                "reaction_speed_ms":     reaction_speed_ms,
                "vibe_score_at_trigger": vibe_score,
                "strategy_mode":         strategy_mode,
                "tx_hash":               tx_hash,
            }
        )
        log.info(f"📊 Reflex logged — ⚡ {reaction_speed_ms}ms")
    except Exception as e:
        log.error(f"reflex_log write failed: {e}")


def push_to_dashboard(vibe_score, is_locked, last_action,
                      signals=None, reaction_speed_ms=None):
    try:
        res  = requests.get(
            f"{SUPABASE_URL}/rest/v1/security_status?limit=1",
            headers=HEADERS
        )
        rows = res.json()
        if not rows:
            log.warning("No row in security_status")
            return

        row_id  = rows[0]["id"]
        payload = {
            "vibe_score":  vibe_score,
            "is_locked":   is_locked,
            "last_action": last_action,
        }

        # Push individual signal breakdown for dashboard gauges
        if signals:
            payload["signal_gas"]        = signals.get("gas")
            payload["signal_mempool"]    = signals.get("mempool")
            payload["signal_volatility"] = signals.get("volatility")
            payload["signal_liquidity"]  = signals.get("liquidity")

        if reaction_speed_ms is not None:
            payload["reaction_speed_ms"] = reaction_speed_ms

        requests.patch(
            f"{SUPABASE_URL}/rest/v1/security_status?id=eq.{row_id}",
            headers=HEADERS,
            json=payload
        )
        log.info(f"✅ Dashboard updated — Score: {vibe_score}")

    except Exception as e:
        log.error(f"Supabase push failed: {e}")


def get_latest_reaction_speed() -> int | None:
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/reflex_log?order=id.desc&limit=1",
            headers=HEADERS
        )
        rows = r.json()
        return rows[0]["reaction_speed_ms"] if rows else None
    except Exception:
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN LOOP
# ══════════════════════════════════════════════════════════════════════════════

def main():
    log.info("👻 Vantaguard agent online")
    log.info("🧠 Multi-signal threat engine active")
    log.info("🎯 Intent layer reading user policy from Supabase")

    # Arm ghost route at startup
    build_ghost_route()

    exit_triggered = False

    while True:
        try:
            # ── Nonce sentinel — rebuild ghost route if stale ─────────────────
            check_nonce_sentinel()

            # ── Calculate multi-signal vibe score ─────────────────────────────
            data      = calculate_vibe_score()
            score     = data["vibe_score"]
            signals   = data["signals"]

            log.info(
                f"📊 Vibe: {score} | "
                f"Gas: {signals['gas']} | "
                f"Mempool: {signals['mempool']} | "
                f"Volatility: {signals['volatility']} | "
                f"Liquidity: {signals['liquidity']}"
            )

            # ── Read user intent policy ───────────────────────────────────────
            policy        = get_intent_policy()
            strategy_mode = policy["strategy_mode"]
            action        = policy_to_action(policy, score)

            # ── Read dashboard lock state ─────────────────────────────────────
            res  = requests.get(
                f"{SUPABASE_URL}/rest/v1/security_status?limit=1",
                headers=HEADERS
            )
            rows             = res.json()
            dashboard_locked = rows[0]["is_locked"] if rows else False

            # ── REFLEX: EMERGENCY EXIT ─────────────────────────────────────────
            if action == "EMERGENCY_EXIT" and not exit_triggered:
                log.warning(f"☠️  TOXIC VIBE — Score: {score} | Policy: {action}")

                receipt     = trigger_reflex(score, strategy_mode)
                reaction_ms = get_latest_reaction_speed()

                push_to_dashboard(
                    score, True,
                    f"🚨 GHOST MOVE EXECUTED — Vault secured. ⚡ {reaction_ms}ms",
                    signals       = signals,
                    reaction_speed_ms = reaction_ms
                )
                exit_triggered = True

            # ── RECOVERY: Score recovered, exit triggered ──────────────────────
            elif score >= VIBE_THRESHOLD and exit_triggered:
                log.info(f"🟢 Vibes recovered — Score: {score}")
                push_to_dashboard(
                    score, False,
                    "System restored — Sentinel resuming patrol.",
                    signals=signals
                )
                exit_triggered = False

            # ── NORMAL: Push live signals to dashboard ─────────────────────────
            elif not dashboard_locked:
                mode_label = ["Aggressive", "Stable", "Safety"][strategy_mode]
                push_to_dashboard(
                    score, False,
                    f"Scanning... Vibe: {score}/100 | Mode: {mode_label}",
                    signals=signals
                )

            else:
                log.info("🔒 Manual lock active — agent standing by")

        except Exception as e:
            log.error(f"Scanner error: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()