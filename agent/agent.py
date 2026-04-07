import os
import time
import logging
import requests
from web3 import Web3
try:
    from web3.middleware import ExtraDataToPOAMiddleware
except ImportError:
    from web3.middleware import geth_poa_middleware as ExtraDataToPOAMiddleware

# ── CINEMATIC LOGGER ──────────────────────────────────────────────────────────
class CinematicFormatter(logging.Formatter):
    def format(self, record):
        return f"{self.formatTime(record, '%H:%M:%S')}  {record.getMessage()}"

handler = logging.StreamHandler()
handler.setFormatter(CinematicFormatter())
log = logging.getLogger("vantaguard")
log.addHandler(handler)
log.setLevel(logging.INFO)

# ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
SUPABASE_URL = "https://waljgojrqgpkheufekna.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhbGpnb2pycWdwa2hldWZla25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzcxODYsImV4cCI6MjA5MTE1MzE4Nn0.jpW9izTPkZ1RqukLboOfFXsTzwzkBjZNkeQYZ-9pHuo"

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation"
}

# ── RESEND CONFIG ─────────────────────────────────────────────────────────────
RESEND_API_KEY    = "re_7Cdgna3H_DGZovtkR679kf4iSeL93Do5q"
RESEND_FROM_EMAIL = "onboarding@resend.dev"
RESEND_API_URL    = "https://api.resend.com/emails"

# ── ETHERLINK CONFIG ──────────────────────────────────────────────────────────
RPC_URL           = "https://node.shadownet.etherlink.com"
REGISTRY_ADDRESS  = "0x7ac9C32E00B6Ae61DCf63f4F9694c1fCFa43CaB7"
POSITION_MANAGER  = "0x743E03cceB4af2efA3CC76838f6E8B50B63F184c"
SWAP_ROUTER       = "0xdD489C75be1039ec7d843A6aC2Fd658350B067Cf"
VIBE_THRESHOLD    = 30
POLL_INTERVAL     = 12
GAS_BASELINE_GWEI = 0.05

# ── OKU API ───────────────────────────────────────────────────────────────────
OKU_API_BASE = "https://omni.icarus.tools/etherlink/cush"

# ── MULTI-SIGNAL WEIGHTS ──────────────────────────────────────────────────────
WEIGHT_GAS        = 0.30
WEIGHT_MEMPOOL    = 0.20
WEIGHT_VOLATILITY = 0.25
WEIGHT_LIQUIDITY  = 0.25

# ── WALLET CONFIG ─────────────────────────────────────────────────────────────
PRIVATE_KEY  = os.environ.get("PRIVATE_KEY")
AGENT_WALLET = os.environ.get("AGENT_WALLET")

# ── SHADOWVAULT ABI ───────────────────────────────────────────────────────────
SHADOW_VAULT_ABI = [
    {"inputs": [{"internalType": "uint256", "name": "vibeScore", "type": "uint256"}], "name": "logThreat", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [], "name": "emergencyExit", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [{"internalType": "address", "name": "_token0", "type": "address"}, {"internalType": "address", "name": "_token1", "type": "address"}, {"internalType": "uint24", "name": "_fee", "type": "uint24"}, {"internalType": "int24", "name": "_tickLower", "type": "int24"}, {"internalType": "int24", "name": "_tickUpper", "type": "int24"}], "name": "setSafePool", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [], "name": "redeployToSaferPool", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [], "name": "returnToWallet", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [], "name": "savedToken0", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "savedToken1", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}
]

# ── CONNECT ETHERLINK ─────────────────────────────────────────────────────────
w3 = Web3(Web3.HTTPProvider(RPC_URL))
w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

vault = w3.eth.contract(
    address=Web3.to_checksum_address(REGISTRY_ADDRESS),
    abi=SHADOW_VAULT_ABI
)

# ── GHOST ROUTE STATE ─────────────────────────────────────────────────────────
_ghost_exit     = None
_ghost_redeploy = None
_ghost_wallet   = None
_ghost_nonce    = None

# ── SIGNAL HISTORY ────────────────────────────────────────────────────────────
_price_history     = []
_liquidity_history = []
HISTORY_WINDOW     = 5

# ── LEADERBOARD STATS ─────────────────────────────────────────────────────────
_total_exits      = 0
_best_reaction_ms = None


# ══════════════════════════════════════════════════════════════════════════════
#  CINEMATIC TERMINAL LOGS
# ══════════════════════════════════════════════════════════════════════════════

def alert(msg):   log.warning(f"[ALERT]   {msg}")
def action(msg):  log.info(f"[ACTION]  {msg}")
def tx(msg):      log.info(f"[TX]      {msg}")
def success(msg): log.info(f"[SUCCESS] {msg}")
def scan(msg):    log.info(f"[SCAN]    {msg}")
def intent(msg):  log.info(f"[INTENT]  {msg}")


# ══════════════════════════════════════════════════════════════════════════════
#  GHOST ROUTES — PRE-SIGN ALL 3
# ══════════════════════════════════════════════════════════════════════════════

def _sign_tx(fn, nonce, gas=300_000):
    gas_price = w3.eth.gas_price
    raw_tx = fn.build_transaction({
        "from":     AGENT_WALLET,
        "nonce":    nonce,
        "gas":      gas,
        "gasPrice": gas_price,
        "chainId":  w3.eth.chain_id,
    })
    signed = w3.eth.account.sign_transaction(raw_tx, PRIVATE_KEY)
   return signed.rawTransaction.hex()


def build_ghost_routes():
    global _ghost_exit, _ghost_redeploy, _ghost_wallet, _ghost_nonce
    if not PRIVATE_KEY or not AGENT_WALLET:
        log.error("❌ PRIVATE_KEY / AGENT_WALLET not set")
        return
    try:
        nonce           = w3.eth.get_transaction_count(AGENT_WALLET, "pending")
        _ghost_exit     = _sign_tx(vault.functions.emergencyExit(),       nonce)
        _ghost_redeploy = _sign_tx(vault.functions.redeployToSaferPool(), nonce + 1)
        _ghost_wallet   = _sign_tx(vault.functions.returnToWallet(),      nonce + 2)
        _ghost_nonce    = nonce
        action(f"All 3 ghost routes armed — nonce {nonce}")
    except Exception as e:
        log.error(f"Ghost route build failed: {e}")
        _ghost_exit = None


def check_nonce_sentinel():
    global _ghost_nonce
    if not AGENT_WALLET or _ghost_nonce is None:
        return
    current_nonce = w3.eth.get_transaction_count(AGENT_WALLET, "latest")
    if current_nonce > _ghost_nonce:
        log.warning("⚠️  Nonce stale — rebuilding ghost routes")
        build_ghost_routes()


# ══════════════════════════════════════════════════════════════════════════════
#  POOL SCANNER
# ══════════════════════════════════════════════════════════════════════════════

def fetch_etherlink_pools() -> list:
    try:
        res = requests.post(
            f"{OKU_API_BASE}/pools",
            json={"limit": 20, "page": 0},
            timeout=10
        )
        pools = res.json().get("pools", [])
        scan(f"Fetched {len(pools)} pools from Oku")
        return pools
    except Exception as e:
        log.error(f"Pool fetch failed: {e}")
        return []


def score_pool(pool: dict) -> float:
    try:
        tvl        = float(pool.get("tvlUSD", 0))
        fee        = int(pool.get("feeTier", 10000))
        volume_24h = float(pool.get("volumeUSD", 0))
        tvl_score  = min(100.0, (tvl / 1_000_000) * 100)
        fee_score  = {500: 100, 3000: 70, 10000: 40}.get(fee, 30)
        ratio      = (volume_24h / tvl) if tvl > 0 else 1.0
        vol_score  = max(0.0, 100.0 * (1 - ratio / 2))
        return round((tvl_score * 0.4) + (fee_score * 0.3) + (vol_score * 0.3), 1)
    except Exception:
        return 0.0


def find_safest_pool(min_tvl: float = 50000) -> dict | None:
    pools = fetch_etherlink_pools()
    if not pools:
        return None
    try:
        original_token0 = vault.functions.savedToken0().call().lower()
        original_token1 = vault.functions.savedToken1().call().lower()
    except Exception:
        original_token0 = ""
        original_token1 = ""

    scored = []
    for pool in pools:
        tvl = float(pool.get("tvlUSD", 0))
        if tvl < min_tvl:
            continue
        t0 = pool.get("token0", {}).get("id", "").lower()
        t1 = pool.get("token1", {}).get("id", "").lower()
        if t0 == original_token0 and t1 == original_token1:
            continue
        score = score_pool(pool)
        scored.append((score, pool))
        scan(f"Pool {t0[:6]}../{t1[:6]}.. Score:{score} TVL:${tvl:,.0f}")

    if not scored:
        return None
    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_pool = scored[0]
    scan(f"Safest pool selected — Score: {best_score}")
    return best_pool


def call_set_safe_pool(pool: dict) -> bool:
    if not PRIVATE_KEY or not AGENT_WALLET:
        return False
    try:
        token0     = Web3.to_checksum_address(pool["token0"]["id"])
        token1     = Web3.to_checksum_address(pool["token1"]["id"])
        fee        = int(pool.get("feeTier", 3000))
        tick_lower = int(pool.get("tickLower", -887220))
        tick_upper = int(pool.get("tickUpper",  887220))

        action(f"Setting safe pool: {token0[:8]}../{token1[:8]}.. fee={fee}")

        nonce     = w3.eth.get_transaction_count(AGENT_WALLET, "pending")
        gas_price = w3.eth.gas_price
        tx_data   = vault.functions.setSafePool(
            token0, token1, fee, tick_lower, tick_upper
        ).build_transaction({
            "from": AGENT_WALLET, "nonce": nonce,
            "gas": 200_000, "gasPrice": gas_price, "chainId": w3.eth.chain_id,
        })
        signed  = w3.eth.account.sign_transaction(tx_data, PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        tx(f"setSafePool: {tx_hash.hex()[:20]}...")
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        success("Safe pool set on-chain")
        return True
    except Exception as e:
        log.error(f"setSafePool failed: {e}")
        return False


# ══════════════════════════════════════════════════════════════════════════════
#  MULTI-SIGNAL THREAT ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def get_gas_gwei() -> float:
    return float(w3.from_wei(w3.eth.gas_price, "gwei"))

def get_pending_tx_count() -> int:
    try:
        return len(w3.eth.get_block("pending", full_transactions=True).transactions)
    except Exception:
        return 0

def calculate_gas_signal(gas_gwei):
    return max(0.0, 100.0 * (1 - (gas_gwei / GAS_BASELINE_GWEI - 1) / 9))

def calculate_mempool_signal(pending_tx):
    return max(0.0, 100.0 * (1 - pending_tx / 500))

def calculate_volatility_signal(gas_gwei):
    global _price_history
    _price_history.append(gas_gwei)
    if len(_price_history) > HISTORY_WINDOW: _price_history.pop(0)
    if len(_price_history) < 2: return 80.0
    avg  = sum(_price_history) / len(_price_history)
    std  = (sum((p - avg) ** 2 for p in _price_history) / len(_price_history)) ** 0.5
    return max(0.0, 100.0 * (1 - (std / GAS_BASELINE_GWEI) / 5))

def calculate_liquidity_signal(pending_tx):
    global _liquidity_history
    _liquidity_history.append(pending_tx)
    if len(_liquidity_history) > HISTORY_WINDOW: _liquidity_history.pop(0)
    if len(_liquidity_history) < 2: return 80.0
    prev = _liquidity_history[-2]
    if prev == 0: return 80.0
    return max(0.0, 100.0 * (1 - ((_liquidity_history[-1] - prev) / prev) / 0.5))

def calculate_vibe_score() -> dict:
    gas_gwei   = get_gas_gwei()
    pending_tx = get_pending_tx_count()
    gs = calculate_gas_signal(gas_gwei)
    ms = calculate_mempool_signal(pending_tx)
    vs = calculate_volatility_signal(gas_gwei)
    ls = calculate_liquidity_signal(pending_tx)
    return {
        "vibe_score": round(gs*WEIGHT_GAS + ms*WEIGHT_MEMPOOL + vs*WEIGHT_VOLATILITY + ls*WEIGHT_LIQUIDITY, 1),
        "gas_gwei":   round(gas_gwei, 4),
        "pending_tx": pending_tx,
        "signals":    {"gas": round(gs,1), "mempool": round(ms,1), "volatility": round(vs,1), "liquidity": round(ls,1)}
    }


# ══════════════════════════════════════════════════════════════════════════════
#  INTENT LAYER
# ══════════════════════════════════════════════════════════════════════════════

def get_intent_policy() -> dict:
    defaults = {"strategy_mode": 2, "max_loss_pct": 5.0, "min_pool_liquidity": 50000.0, "prefer_stable": True, "user_email": None}
    try:
        rows = requests.get(f"{SUPABASE_URL}/rest/v1/security_status?limit=1", headers=HEADERS).json()
        if not rows: return defaults
        row = rows[0]
        return {
            "strategy_mode":      int(row.get("strategy_mode",      defaults["strategy_mode"])),
            "max_loss_pct":       float(row.get("max_loss_pct",     defaults["max_loss_pct"])),
            "min_pool_liquidity": float(row.get("min_pool_liquidity", defaults["min_pool_liquidity"])),
            "prefer_stable":      bool(row.get("prefer_stable",     defaults["prefer_stable"])),
            "user_email":         row.get("user_email", None),
        }
    except Exception:
        return defaults

def policy_to_action(policy: dict, vibe_score: float) -> str:
    mode = policy["strategy_mode"]
    if mode == 2 and vibe_score < VIBE_THRESHOLD: return "EMERGENCY_EXIT"
    if mode == 1:
        if vibe_score < VIBE_THRESHOLD: return "EMERGENCY_EXIT"
        if vibe_score > 60: return "REDEPLOY"
    if mode == 0 and vibe_score < VIBE_THRESHOLD * 0.6: return "EMERGENCY_EXIT"
    return "HOLD"


# ══════════════════════════════════════════════════════════════════════════════
#  RESEND EMAIL
# ══════════════════════════════════════════════════════════════════════════════

def send_alert_email(to_email: str, vibe_score: float, reaction_ms: int, tx_hash: str, strategy_mode: int):
    if not to_email: return
    mode_label = ["Aggressive", "Stable", "Safety"][strategy_mode]
    try:
        requests.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from":    RESEND_FROM_EMAIL,
                "to":      [to_email],
                "subject": "🚨 Vantaguard Ghost Move Executed — Your Funds Are Secured",
                "html":    f"""
                <div style="font-family:monospace;background:#0a0a0a;color:#00ff88;padding:24px;border-radius:8px;">
                  <h2 style="color:#ff4444;">⚡ GHOST MOVE EXECUTED</h2>
                  <p><b>Vibe Score at Trigger:</b> {vibe_score}/100</p>
                  <p><b>Reaction Speed:</b> ⚡ {reaction_ms}ms</p>
                  <p><b>Strategy Mode:</b> {mode_label}</p>
                  <p><b>TX:</b> <a href="https://explorer.etherlink.com/tx/{tx_hash}" style="color:#00ff88;">{tx_hash[:20]}...</a></p>
                  <hr style="border-color:#333;"/>
                  <p style="color:#aaa;">Your funds have been pulled from the pool and secured in your personal vault.</p>
                  <p style="color:#888;font-size:12px;">Vantaguard — The Reflex Layer for DeFi</p>
                </div>
                """
            }
        )
        success(f"Alert email sent to {to_email}")
    except Exception as e:
        log.error(f"Email send failed: {e}")


# ══════════════════════════════════════════════════════════════════════════════
#  REFLEX BROADCASTER
# ══════════════════════════════════════════════════════════════════════════════

def call_log_threat(vibe_score: float):
    if not PRIVATE_KEY or not AGENT_WALLET: return
    try:
        nonce     = w3.eth.get_transaction_count(AGENT_WALLET, "pending")
        tx_data   = vault.functions.logThreat(int(vibe_score)).build_transaction({
            "from": AGENT_WALLET, "nonce": nonce, "gas": 100_000,
            "gasPrice": w3.eth.gas_price, "chainId": w3.eth.chain_id,
        })
        signed  = w3.eth.account.sign_transaction(tx_data, PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        action(f"logThreat on-chain: {tx_hash.hex()[:20]}...")
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
        success("Threat timestamp confirmed on-chain")
    except Exception as e:
        log.error(f"logThreat failed: {e}")


def trigger_reflex(vibe_score: float, policy: dict) -> dict | None:
    global _ghost_exit, _total_exits, _best_reaction_ms

    if not _ghost_exit:
        log.error("❌ No ghost route available")
        return None

    strategy_mode = policy["strategy_mode"]
    user_email    = policy.get("user_email")

    threat_detected_ms = int(time.time() * 1000)
    alert(f"TOXIC VIBE DETECTED — Score: {vibe_score}")
    action("Logging threat timestamp on-chain...")
    call_log_threat(vibe_score)

    action("Broadcasting Ghost Move — zero signing latency")
    try:
        tx_hash = w3.eth.send_raw_transaction(bytes.fromhex(_ghost_exit.lstrip("0x")))
        tx_broadcast_ms = int(time.time() * 1000)
        tx(f"Ghost move broadcast: {tx_hash.hex()[:20]}...")

        receipt = None
        for _ in range(60):
            try:
                receipt = w3.eth.get_transaction_receipt(tx_hash)
                if receipt: break
            except Exception:
                pass
            time.sleep(2)

        tx_confirmed_ms   = int(time.time() * 1000)
        reaction_speed_ms = tx_confirmed_ms - threat_detected_ms

        success(f"FUNDS SECURED — Reaction: ⚡ {reaction_speed_ms}ms")

        _total_exits += 1
        if _best_reaction_ms is None or reaction_speed_ms < _best_reaction_ms:
            _best_reaction_ms = reaction_speed_ms

        log_reflex(threat_detected_ms, tx_broadcast_ms, tx_confirmed_ms,
                   reaction_speed_ms, vibe_score, strategy_mode, tx_hash.hex())

        send_alert_email(user_email, vibe_score, reaction_speed_ms, tx_hash.hex(), strategy_mode)

        time.sleep(5)
        execute_recovery(policy)

        _ghost_exit = None
        build_ghost_routes()

        return receipt

    except Exception as e:
        log.error(f"Reflex broadcast failed: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  AUTO RECOVERY
# ══════════════════════════════════════════════════════════════════════════════

def execute_recovery(policy: dict):
    global _ghost_redeploy, _ghost_wallet

    strategy_mode = policy["strategy_mode"]
    min_liquidity = policy.get("min_pool_liquidity", 50000)

    action(f"Executing recovery — Mode: {['Aggressive','Stable','Safety'][strategy_mode]}")

    if strategy_mode == 0:
        action("Scanning for safest pool on Etherlink...")
        safe_pool = find_safest_pool(min_tvl=min_liquidity)
        if safe_pool:
            pool_set = call_set_safe_pool(safe_pool)
            if pool_set and _ghost_redeploy:
                action("Broadcasting redeployToSaferPool...")
                try:
                    tx_hash = w3.eth.send_raw_transaction(bytes.fromhex(_ghost_redeploy.lstrip("0x")))
                    tx(f"Redeploy tx: {tx_hash.hex()[:20]}...")
                    w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                    success("Funds redeployed to safer pool")
                    _ghost_redeploy = None
                except Exception as e:
                    log.error(f"Redeploy failed: {e}")
        else:
            log.warning("No safe pool found — funds staying in vault (bunker mode)")

    elif strategy_mode == 2:
        if _ghost_wallet:
            action("Broadcasting returnToWallet...")
            try:
                tx_hash = w3.eth.send_raw_transaction(bytes.fromhex(_ghost_wallet.lstrip("0x")))
                tx(f"Return to wallet tx: {tx_hash.hex()[:20]}...")
                w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                success("Funds returned to owner wallet")
                _ghost_wallet = None
            except Exception as e:
                log.error(f"returnToWallet failed: {e}")

    elif strategy_mode == 1:
        action("Stable mode — monitoring for pool recovery before returning...")


# ══════════════════════════════════════════════════════════════════════════════
#  SUPABASE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def log_reflex(threat_detected_ms, tx_broadcast_ms, tx_confirmed_ms,
               reaction_speed_ms, vibe_score, strategy_mode, tx_hash):
    try:
        requests.post(f"{SUPABASE_URL}/rest/v1/reflex_log", headers=HEADERS, json={
            "threat_detected_ms":    threat_detected_ms,
            "tx_broadcast_ms":       tx_broadcast_ms,
            "tx_confirmed_ms":       tx_confirmed_ms,
            "reaction_speed_ms":     reaction_speed_ms,
            "vibe_score_at_trigger": vibe_score,
            "strategy_mode":         strategy_mode,
            "tx_hash":               tx_hash,
        })
    except Exception as e:
        log.error(f"reflex_log write failed: {e}")


def push_to_dashboard(vibe_score, is_locked, last_action, signals=None, reaction_speed_ms=None):
    try:
        rows = requests.get(f"{SUPABASE_URL}/rest/v1/security_status?limit=1", headers=HEADERS).json()
        if not rows: return
        payload = {"vibe_score": vibe_score, "is_locked": is_locked, "last_action": last_action}
        if signals:
            payload["signal_gas"]        = signals.get("gas")
            payload["signal_mempool"]    = signals.get("mempool")
            payload["signal_volatility"] = signals.get("volatility")
            payload["signal_liquidity"]  = signals.get("liquidity")
        if reaction_speed_ms is not None:
            payload["reaction_speed_ms"] = reaction_speed_ms
        requests.patch(f"{SUPABASE_URL}/rest/v1/security_status?id=eq.{rows[0]['id']}", headers=HEADERS, json=payload)
    except Exception as e:
        log.error(f"Dashboard push failed: {e}")


def push_leaderboard():
    try:
        rows = requests.get(f"{SUPABASE_URL}/rest/v1/security_status?limit=1", headers=HEADERS).json()
        if not rows: return
        requests.patch(f"{SUPABASE_URL}/rest/v1/security_status?id=eq.{rows[0]['id']}", headers=HEADERS, json={
            "total_exits":      _total_exits,
            "best_reaction_ms": _best_reaction_ms,
        })
    except Exception as e:
        log.error(f"Leaderboard push failed: {e}")


def get_latest_reaction_speed() -> int | None:
    try:
        rows = requests.get(f"{SUPABASE_URL}/rest/v1/reflex_log?order=id.desc&limit=1", headers=HEADERS).json()
        return rows[0]["reaction_speed_ms"] if rows else None
    except Exception:
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN LOOP
# ══════════════════════════════════════════════════════════════════════════════

def main():
    log.info("=" * 60)
    log.info("  👻 VANTAGUARD SENTINEL ONLINE")
    log.info("  Reflex Layer for DeFi — Etherlink")
    log.info("=" * 60)
    action("Multi-signal threat engine active")
    action("Intent layer reading user policy from Supabase")
    action("Pre-signing all 3 ghost routes...")

    build_ghost_routes()

    exit_triggered = False

    while True:
        try:
            check_nonce_sentinel()

            data    = calculate_vibe_score()
            score   = data["vibe_score"]
            signals = data["signals"]

            log.info(f"📊 Vibe:{score} | Gas:{signals['gas']} | Mem:{signals['mempool']} | Vol:{signals['volatility']} | Liq:{signals['liquidity']}")

            policy     = get_intent_policy()
            mode       = policy["strategy_mode"]
            action_cmd = policy_to_action(policy, score)

            intent(f"Strategy: {['Aggressive','Stable','Safety'][mode]} | Decision: {action_cmd}")

            rows             = requests.get(f"{SUPABASE_URL}/rest/v1/security_status?limit=1", headers=HEADERS).json()
            dashboard_locked = rows[0]["is_locked"] if rows else False

            if action_cmd == "EMERGENCY_EXIT" and not exit_triggered:
                receipt     = trigger_reflex(score, policy)
                reaction_ms = get_latest_reaction_speed()
                push_to_dashboard(score, True, f"🚨 GHOST MOVE EXECUTED — ⚡ {reaction_ms}ms", signals=signals, reaction_speed_ms=reaction_ms)
                push_leaderboard()
                exit_triggered = True

            elif score >= VIBE_THRESHOLD and exit_triggered:
                success(f"Vibes recovered — Score: {score}")
                push_to_dashboard(score, False, "System restored — Sentinel resuming patrol.", signals=signals)
                exit_triggered = False

            elif not dashboard_locked:
                push_to_dashboard(score, False, f"Scanning... Vibe: {score}/100 | Mode: {['Aggressive','Stable','Safety'][mode]}", signals=signals)

            else:
                log.info("🔒 Manual lock active — agent standing by")

        except Exception as e:
            log.error(f"Scanner error: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()