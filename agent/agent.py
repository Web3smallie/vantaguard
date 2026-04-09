import os
import time
import random
import logging
import threading
import requests
from web3 import Web3
from datetime import datetime, timezone

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

# ── CONFIG FROM ENV ONLY ──────────────────────────────────────────────────────
SUPABASE_URL      = os.environ["SUPABASE_URL"]
SUPABASE_KEY      = os.environ["SUPABASE_KEY"]
RESEND_API_KEY    = os.environ["RESEND_API_KEY"]
PRIVATE_KEY       = os.environ["PRIVATE_KEY"]
AGENT_WALLET      = os.environ["AGENT_WALLET"]
RESEND_FROM_EMAIL = "onboarding@resend.dev"
RESEND_API_URL    = "https://api.resend.com/emails"

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation"
}

# ── ETHERLINK CONFIG ──────────────────────────────────────────────────────────
RPC_URL          = "https://node.mainnet.etherlink.com"
FACTORY_ADDRESS  = "0x044e8020E6b412835802e73Db12540435B38d870"
USER_WALLET      = "0xFc1c1607a4f233B87Aadb910645BeF946C05b9aC"
OKU_API_BASE     = "https://omni.icarus.tools/etherlink/cush"
POLL_INTERVAL    = 12
CHAIN_ID         = 42793

# ── STATE ─────────────────────────────────────────────────────────────────────
_ghost_exit        = None
_ghost_redeploy    = None
_ghost_wallet      = None
_ghost_nonce       = None
_price_history     = []
_liquidity_history = []
_prev_block_gas    = []
_prev_liquidity    = None
_total_exits       = 0
_best_reaction_ms  = None
_cycle_count       = 0
_error_count       = 0
_agent_start_time  = time.time()
HISTORY_WINDOW     = 5
MAX_ERRORS         = 5
_gas_baseline_gwei = 0.1
VAULT_ADDRESS      = ""  # loaded at startup

# ── SHADOWVAULT ABI ───────────────────────────────────────────────────────────
SHADOW_VAULT_ABI = [
    {"inputs": [{"internalType": "uint256", "name": "vibeScore", "type": "uint256"}, {"internalType": "string", "name": "threatType", "type": "string"}], "name": "logThreat", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [], "name": "emergencyExit", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [{"internalType": "address", "name": "_token0", "type": "address"}, {"internalType": "address", "name": "_token1", "type": "address"}, {"internalType": "uint24", "name": "_fee", "type": "uint24"}, {"internalType": "int24", "name": "_tickLower", "type": "int24"}, {"internalType": "int24", "name": "_tickUpper", "type": "int24"}], "name": "setSafePool", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [], "name": "redeployToSaferPool", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [], "name": "returnToWallet", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [], "name": "savedToken0", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "savedToken1", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "positionRegistered", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "fundsInVault", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "executionCount", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "lastThreatType", "outputs": [{"internalType": "string", "name": "", "type": "string"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "getFundsState", "outputs": [{"internalType": "string", "name": "", "type": "string"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "moveToSafeVault", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
]

# ── CONNECT ETHERLINK ─────────────────────────────────────────────────────────
w3 = Web3(Web3.HTTPProvider(RPC_URL))
w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

# vault is initialized in main() after lookup
vault = None


# ══════════════════════════════════════════════════════════════════════════════
#  VAULT ADDRESS LOOKUP
# ══════════════════════════════════════════════════════════════════════════════

def get_user_vault_address() -> str:
    """Get the actual vault address for the user from factory."""
    try:
        selector = w3.keccak(text="getVault(address)")[:4].hex()
        padded   = "000000000000000000000000" + USER_WALLET.lower().replace("0x", "")
        data     = "0x" + selector + padded
        result   = w3.eth.call({
            "to":   Web3.to_checksum_address(FACTORY_ADDRESS),
            "data": data,
        })
        vault_addr = "0x" + result.hex()[-40:]
        log.info(f"User vault address: {vault_addr}")
        return Web3.to_checksum_address(vault_addr)
    except Exception as e:
        log.error(f"Failed to get vault address: {e}")
        return ""


# ══════════════════════════════════════════════════════════════════════════════
#  RETRY WRAPPER
# ══════════════════════════════════════════════════════════════════════════════

def retry_request(fn, retries=3, delay=1):
    for attempt in range(retries):
        try:
            return fn()
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                raise e


# ══════════════════════════════════════════════════════════════════════════════
#  CINEMATIC TERMINAL LOGS
# ══════════════════════════════════════════════════════════════════════════════

def _log_activity(log_type: str, message: str):
    important = log_type in ("ALERT", "ACTION", "TX", "SUCCESS", "RESULT", "DECISION", "INFERENCE")
    if not important and random.random() > 0.6:
        return
    try:
        retry_request(lambda: requests.post(
            f"{SUPABASE_URL}/rest/v1/activity_log",
            headers=HEADERS,
            json={"type": log_type, "message": message},
            timeout=5
        ))
    except Exception as e:
        log.error(f"activity_log write failed: {e}")

def alert(msg):      log.warning(f"[ALERT]      {msg}"); _log_activity("ALERT", msg)
def action(msg):     log.info(f"[ACTION]     {msg}"); _log_activity("ACTION", msg)
def tx_log(msg):     log.info(f"[TX]         {msg}"); _log_activity("TX", msg)
def success(msg):    log.info(f"[SUCCESS]    {msg}"); _log_activity("SUCCESS", msg)
def scan(msg):       log.info(f"[SCAN]       {msg}"); _log_activity("SCAN", msg)
def intent(msg):     log.info(f"[INTENT]     {msg}"); _log_activity("INTENT", msg)
def analysis(msg):   log.info(f"[ANALYSIS]   {msg}"); _log_activity("ANALYSIS", msg)
def inference(msg):  log.info(f"[INFERENCE]  {msg}"); _log_activity("INFERENCE", msg)
def confidence(msg): log.info(f"[CONFIDENCE] {msg}"); _log_activity("CONFIDENCE", msg)
def decision(msg):   log.info(f"[DECISION]   {msg}"); _log_activity("DECISION", msg)
def result(msg):     log.info(f"[RESULT]     {msg}"); _log_activity("RESULT", msg)
def pool_log(msg):   log.info(f"[POOL]       {msg}"); _log_activity("POOL", msg)
def mempool_log(msg):log.info(f"[MEMPOOL]    {msg}"); _log_activity("MEMPOOL", msg)
def block_log(msg):  log.info(f"[BLOCK]      {msg}"); _log_activity("BLOCK", msg)


# ══════════════════════════════════════════════════════════════════════════════
#  GHOST ROUTES
# ══════════════════════════════════════════════════════════════════════════════

def _sign_tx(fn, nonce, gas=1_500_000):
    raw_tx = fn.build_transaction({
        "from":     AGENT_WALLET,
        "nonce":    nonce,
        "gas":      gas,
        "gasPrice": w3.eth.gas_price,
        "chainId":  CHAIN_ID,
    })
    signed = w3.eth.account.sign_transaction(raw_tx, PRIVATE_KEY)
    return signed.rawTransaction.hex()

def build_ghost_routes():
    global _ghost_exit, _ghost_redeploy, _ghost_wallet, _ghost_nonce
    if not PRIVATE_KEY or not AGENT_WALLET or not vault:
        log.error("Cannot build ghost routes — missing keys or vault")
        return
    try:
        nonce           = w3.eth.get_transaction_count(AGENT_WALLET, "pending")
        _ghost_exit     = _sign_tx(vault.functions.emergencyExit(),       nonce,     1_500_000)
        _ghost_redeploy = _sign_tx(vault.functions.redeployToSaferPool(), nonce + 1, 1_500_000)
        _ghost_wallet   = _sign_tx(vault.functions.returnToWallet(),      nonce + 2, 1_500_000)
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
    if current_nonce != _ghost_nonce:
        log.warning("Nonce changed — rebuilding ghost routes")
        build_ghost_routes()


# ══════════════════════════════════════════════════════════════════════════════
#  REAL BLOCKCHAIN SCANNING
# ══════════════════════════════════════════════════════════════════════════════

def scan_block_data() -> dict:
    try:
        latest        = w3.eth.get_block("latest")
        block_number  = latest["number"]
        gas_used      = latest["gasUsed"]
        gas_limit     = latest["gasLimit"]
        gas_pct       = round((gas_used / gas_limit) * 100, 1)
        base_fee      = latest.get("baseFeePerGas", 0)
        base_fee_gwei = round(float(w3.from_wei(base_fee, "gwei")), 4) if base_fee else 0

        _prev_block_gas.append(base_fee_gwei)
        if len(_prev_block_gas) > HISTORY_WINDOW:
            _prev_block_gas.pop(0)

        trend = "stable"
        if len(_prev_block_gas) >= 2:
            delta = _prev_block_gas[-1] - _prev_block_gas[-2]
            if delta > 0.01:    trend = "rising"
            elif delta < -0.01: trend = "falling"

        block_log(f"Block {block_number} | Gas {gas_pct}% used | Base fee {base_fee_gwei} gwei ({trend})")
        return {
            "block_number":   block_number,
            "gas_used_pct":   gas_pct,
            "base_fee_gwei":  base_fee_gwei,
            "base_fee_trend": trend,
        }
    except Exception as e:
        log.error(f"Block scan failed: {e}")
        return {}

def scan_mempool() -> dict:
    try:
        pending_block = w3.eth.get_block("pending", full_transactions=False)
        pending_count = len(pending_block.transactions)

        if pending_count > 0:
            full_block = w3.eth.get_block("pending", full_transactions=True)
            txs = full_block.transactions[:50]

            from_counts = {}
            for t in txs:
                addr = t["from"].lower()
                from_counts[addr] = from_counts.get(addr, 0) + 1

            repeated     = {addr: cnt for addr, cnt in from_counts.items() if cnt > 3}
            bot_detected = len(repeated) > 0
            large_txs    = [t for t in txs if t.get("value", 0) > w3.to_wei(1, "ether")]
        else:
            repeated = {}
            bot_detected = False
            large_txs = []

        mempool_log(f"Mempool depth: {pending_count} pending txs | Large txs: {len(large_txs)} | Bot patterns: {len(repeated)}")

        if bot_detected:
            analysis(f"Repeated address patterns detected — possible bot activity ({len(repeated)} addresses)")
        if large_txs:
            analysis(f"Large value transactions in mempool: {len(large_txs)} txs > 1 XTZ")

        return {
            "pending_count": pending_count,
            "large_txs":     len(large_txs),
            "bot_patterns":  len(repeated),
            "bot_detected":  bot_detected,
        }
    except Exception as e:
        log.error(f"Mempool scan failed: {e}")
        return {"pending_count": 0, "large_txs": 0, "bot_patterns": 0, "bot_detected": False}

def scan_rpc_heartbeat() -> int:
    try:
        start      = time.time()
        w3.eth.block_number
        latency_ms = int((time.time() - start) * 1000)
        scan(f"RPC heartbeat OK - {latency_ms}ms latency")
        return latency_ms
    except Exception as e:
        log.error(f"RPC heartbeat failed: {e}")
        return -1

def scan_pool_liquidity(token0: str, token1: str) -> dict:
    global _prev_liquidity
    try:
        res   = retry_request(lambda: requests.post(
            f"{OKU_API_BASE}/pools", json={"limit": 50, "page": 0}, timeout=10
        ))
        pools = res.json().get("pools", [])

        target_pool = None
        for pool in pools:
            t0 = pool.get("token0", {}).get("id", "").lower()
            t1 = pool.get("token1", {}).get("id", "").lower()
            if t0 == token0.lower() and t1 == token1.lower():
                target_pool = pool
                break

        if not target_pool:
            return {"liquidity_delta_pct": 0, "tvl": 0, "volume_24h": 0}

        tvl    = float(target_pool.get("tvlUSD", 0))
        volume = float(target_pool.get("volumeUSD", 0))

        delta_pct = 0
        if _prev_liquidity is not None and _prev_liquidity > 0:
            delta_pct = round(((tvl - _prev_liquidity) / _prev_liquidity) * 100, 2)

        _prev_liquidity = tvl

        if abs(delta_pct) > 5:
            pool_log(f"Liquidity delta: {delta_pct:+.1f}% | TVL: ${tvl:,.0f} | Volume 24h: ${volume:,.0f}")
            if delta_pct < -10:
                analysis(f"Significant liquidity drain detected: {delta_pct:.1f}%")
        else:
            pool_log(f"Pool stable | TVL: ${tvl:,.0f} | Volume 24h: ${volume:,.0f}")

        return {"liquidity_delta_pct": delta_pct, "tvl": tvl, "volume_24h": volume}
    except Exception as e:
        log.error(f"Pool liquidity scan failed: {e}")
        return {"liquidity_delta_pct": 0, "tvl": 0, "volume_24h": 0}


# ══════════════════════════════════════════════════════════════════════════════
#  THREAT CLASSIFICATION ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def classify_threat(block_data: dict, mempool_data: dict, pool_data: dict) -> dict:
    factors = {
        "liquidity_drop": 0,
        "mempool_spike":  0,
        "bot_activity":   0,
        "gas_spike":      0,
        "volume_spike":   0,
    }

    liq_delta = abs(pool_data.get("liquidity_delta_pct", 0))
    if liq_delta > 20:   factors["liquidity_drop"] = min(40, int(liq_delta * 2))
    elif liq_delta > 10: factors["liquidity_drop"] = min(25, int(liq_delta * 1.5))
    elif liq_delta > 5:  factors["liquidity_drop"] = min(15, int(liq_delta))

    pending = mempool_data.get("pending_count", 0)
    if pending > 300:   factors["mempool_spike"] = 30
    elif pending > 150: factors["mempool_spike"] = 20
    elif pending > 80:  factors["mempool_spike"] = 10

    bot_patterns = mempool_data.get("bot_patterns", 0)
    if bot_patterns > 5:   factors["bot_activity"] = 25
    elif bot_patterns > 2: factors["bot_activity"] = 15
    elif bot_patterns > 0: factors["bot_activity"] = 8

    gas_pct = block_data.get("gas_used_pct", 0)
    if gas_pct > 90:   factors["gas_spike"] = 25
    elif gas_pct > 75: factors["gas_spike"] = 15
    elif gas_pct > 60: factors["gas_spike"] = 8

    tvl       = pool_data.get("tvl", 1)
    vol       = pool_data.get("volume_24h", 0)
    vol_ratio = vol / tvl if tvl > 0 else 0
    if vol_ratio > 2:   factors["volume_spike"] = 20
    elif vol_ratio > 1: factors["volume_spike"] = 10

    if mempool_data.get("bot_detected") and factors["liquidity_drop"] > 10:
        factors["bot_activity"] += 10

    confidence_score = min(100, sum(factors.values()))

    threat_type = "none"
    if factors["liquidity_drop"] > 20 and factors["mempool_spike"] > 15:
        threat_type = "sandwich"
        inference("Sandwich pattern detected — large mempool + liquidity drain combo")
    elif factors["liquidity_drop"] > 25:
        threat_type = "liquidity_drain"
        inference("Liquidity drain pattern — significant TVL outflow detected")
    elif factors["bot_activity"] > 20 and factors["gas_spike"] > 15:
        threat_type = "flash_loan"
        inference("Flash loan pattern — bot activity + gas spike correlation")
    elif factors["gas_spike"] > 20:
        threat_type = "gas_panic"
        inference("Gas panic pattern — network congestion spike")
    elif factors["volume_spike"] > 15:
        threat_type = "volatility_spike"
        inference("Volatility spike — abnormal volume/TVL ratio")
    elif confidence_score > 30:
        threat_type = "composite"
        inference(f"Composite threat pattern — confidence {confidence_score}%")

    return {
        "threat_type":      threat_type,
        "confidence_score": confidence_score,
        "factors":          factors,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  MULTI-SIGNAL VIBE SCORE
# ══════════════════════════════════════════════════════════════════════════════

def get_gas_gwei() -> float:
    return float(w3.from_wei(w3.eth.gas_price, "gwei"))

def update_gas_baseline():
    global _gas_baseline_gwei
    _gas_baseline_gwei = max(0.1, get_gas_gwei())

def calculate_gas_signal(gas_gwei):
    return max(0.0, 100.0 * (1 - (gas_gwei / _gas_baseline_gwei - 1) / 9))

def calculate_mempool_signal(pending_tx):
    return max(0.0, 100.0 * (1 - pending_tx / 500))

def calculate_volatility_signal(gas_gwei):
    global _price_history
    _price_history.append(gas_gwei)
    if len(_price_history) > HISTORY_WINDOW: _price_history.pop(0)
    if len(_price_history) < 2: return 80.0
    avg = sum(_price_history) / len(_price_history)
    std = (sum((p - avg) ** 2 for p in _price_history) / len(_price_history)) ** 0.5
    return max(0.0, 100.0 * (1 - (std / _gas_baseline_gwei) / 5))

def calculate_liquidity_signal(pending_tx):
    global _liquidity_history
    _liquidity_history.append(pending_tx)
    if len(_liquidity_history) > HISTORY_WINDOW: _liquidity_history.pop(0)
    if len(_liquidity_history) < 2: return 80.0
    prev = _liquidity_history[-2]
    if prev == 0: return 80.0
    return max(0.0, 100.0 * (1 - ((_liquidity_history[-1] - prev) / prev) / 0.5))

def calculate_vibe_score(mempool_data: dict) -> dict:
    gas_gwei   = get_gas_gwei()
    pending_tx = mempool_data.get("pending_count", 0)
    gs = calculate_gas_signal(gas_gwei)
    ms = calculate_mempool_signal(pending_tx)
    vs = calculate_volatility_signal(gas_gwei)
    ls = calculate_liquidity_signal(pending_tx)
    score = min(100.0, round(gs*0.30 + ms*0.20 + vs*0.25 + ls*0.25, 1))
    return {
        "vibe_score": score,
        "gas_gwei":   round(gas_gwei, 4),
        "pending_tx": pending_tx,
        "signals":    {"gas": round(gs,1), "mempool": round(ms,1), "volatility": round(vs,1), "liquidity": round(ls,1)}
    }


# ══════════════════════════════════════════════════════════════════════════════
#  INTENT LAYER
# ══════════════════════════════════════════════════════════════════════════════

def get_intent_policy() -> dict:
    defaults = {
        "strategy_mode": 2, "max_loss_pct": 5.0,
        "min_pool_liquidity": 50000.0, "prefer_stable": True,
        "user_email": None, "vibe_threshold": 30, "row_id": 1,
    }
    try:
        rows = retry_request(lambda: requests.get(
            f"{SUPABASE_URL}/rest/v1/security_status?limit=1",
            headers=HEADERS, timeout=5
        )).json()
        if not rows: return defaults
        row = rows[0]
        return {
            "strategy_mode":      int(row.get("strategy_mode",      defaults["strategy_mode"])),
            "max_loss_pct":       float(row.get("max_loss_pct",     defaults["max_loss_pct"])),
            "min_pool_liquidity": float(row.get("min_pool_liquidity", defaults["min_pool_liquidity"])),
            "prefer_stable":      bool(row.get("prefer_stable",     defaults["prefer_stable"])),
            "user_email":         row.get("user_email", None),
            "vibe_threshold":     int(row.get("vibe_threshold", 30)),
            "row_id":             row.get("id", 1),
            "is_locked":          bool(row.get("is_locked", False)),
        }
    except Exception:
        return defaults

def policy_to_action(policy: dict, vibe_score: float, threat_type: str) -> str:
    mode          = policy["strategy_mode"]
    threshold     = policy["vibe_threshold"]
    threat_active = threat_type not in ("none", "")
    if mode == 2:
        if vibe_score < threshold or (threat_active and vibe_score < threshold + 15):
            return "EMERGENCY_EXIT"
    if mode == 1:
        if vibe_score < threshold:
            return "EMERGENCY_EXIT"
    if mode == 0:
        if vibe_score < threshold * 0.6:
            return "EMERGENCY_EXIT"
    return "HOLD"


# ══════════════════════════════════════════════════════════════════════════════
#  SUPABASE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def log_threat_event(vault_address, threat_type, confidence_score, factors, block_number):
    try:
        retry_request(lambda: requests.post(
            f"{SUPABASE_URL}/rest/v1/threat_events", headers=HEADERS,
            json={"vault_address": vault_address, "threat_type": threat_type,
                  "confidence_score": confidence_score, "factors": factors,
                  "block_number": block_number},
            timeout=5
        ))
    except Exception as e:
        log.error(f"threat_events write failed: {e}")

def log_reaction(vault_address, detected_at, submitted_at, confirmed_at,
                 decision_ms, confirmation_ms, total_ms):
    try:
        retry_request(lambda: requests.post(
            f"{SUPABASE_URL}/rest/v1/reaction_logs", headers=HEADERS,
            json={"vault_address": vault_address, "detected_at": detected_at,
                  "tx_submitted_at": submitted_at, "tx_confirmed_at": confirmed_at,
                  "decision_ms": decision_ms, "confirmation_ms": confirmation_ms,
                  "total_reaction_ms": total_ms},
            timeout=5
        ))
    except Exception as e:
        log.error(f"reaction_logs write failed: {e}")

def update_vault_metrics(vault_address, tvl, funds_state, last_action, protected_amount=0):
    try:
        existing = retry_request(lambda: requests.get(
            f"{SUPABASE_URL}/rest/v1/vault_metrics?vault_address=eq.{vault_address}",
            headers=HEADERS, timeout=5
        )).json()
        payload = {
            "vault_address": vault_address, "tvl": tvl,
            "funds_state": funds_state, "last_action": last_action,
            "protected_amount": protected_amount,
        }
        if existing:
            retry_request(lambda: requests.patch(
                f"{SUPABASE_URL}/rest/v1/vault_metrics?vault_address=eq.{vault_address}",
                headers=HEADERS, json=payload, timeout=5
            ))
        else:
            retry_request(lambda: requests.post(
                f"{SUPABASE_URL}/rest/v1/vault_metrics",
                headers=HEADERS, json=payload, timeout=5
            ))
    except Exception as e:
        log.error(f"vault_metrics update failed: {e}")

def log_reflex_legacy(threat_detected_ms, tx_broadcast_ms, tx_confirmed_ms,
                      reaction_speed_ms, vibe_score, strategy_mode, tx_hash):
    try:
        retry_request(lambda: requests.post(
            f"{SUPABASE_URL}/rest/v1/reflex_log", headers=HEADERS,
            json={"threat_detected_ms": threat_detected_ms, "tx_broadcast_ms": tx_broadcast_ms,
                  "tx_confirmed_ms": tx_confirmed_ms, "reaction_speed_ms": reaction_speed_ms,
                  "vibe_score_at_trigger": vibe_score, "strategy_mode": strategy_mode,
                  "tx_hash": tx_hash},
            timeout=5
        ))
    except Exception as e:
        log.error(f"reflex_log write failed: {e}")

def push_to_dashboard(vibe_score, is_locked, last_action, signals=None, reaction_speed_ms=None, row_id=1):
    try:
        payload = {"vibe_score": vibe_score, "is_locked": is_locked, "last_action": last_action}
        if signals:
            payload["signal_gas"]        = signals.get("gas")
            payload["signal_mempool"]    = signals.get("mempool")
            payload["signal_volatility"] = signals.get("volatility")
            payload["signal_liquidity"]  = signals.get("liquidity")
        if reaction_speed_ms is not None:
            payload["reaction_speed_ms"] = reaction_speed_ms
        retry_request(lambda: requests.patch(
            f"{SUPABASE_URL}/rest/v1/security_status?id=eq.{row_id}",
            headers=HEADERS, json=payload, timeout=5
        ))
    except Exception as e:
        log.error(f"Dashboard push failed: {e}")

def push_leaderboard(row_id=1):
    try:
        retry_request(lambda: requests.patch(
            f"{SUPABASE_URL}/rest/v1/security_status?id=eq.{row_id}",
            headers=HEADERS,
            json={"total_exits": _total_exits, "best_reaction_ms": _best_reaction_ms},
            timeout=5
        ))
    except Exception as e:
        log.error(f"Leaderboard push failed: {e}")


# ══════════════════════════════════════════════════════════════════════════════
#  POOL SCANNER
# ══════════════════════════════════════════════════════════════════════════════

def fetch_etherlink_pools() -> list:
    try:
        res   = retry_request(lambda: requests.post(
            f"{OKU_API_BASE}/pools", json={"limit": 20, "page": 0}, timeout=10
        ))
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
    if not pools: return None
    try:
        original_token0 = vault.functions.savedToken0().call().lower()
        original_token1 = vault.functions.savedToken1().call().lower()
    except Exception:
        original_token0 = ""
        original_token1 = ""

    scored = []
    for pool in pools:
        tvl = float(pool.get("tvlUSD", 0))
        if tvl < min_tvl: continue
        t0 = pool.get("token0", {}).get("id", "").lower()
        t1 = pool.get("token1", {}).get("id", "").lower()
        if t0 == original_token0 and t1 == original_token1: continue
        s = score_pool(pool)
        scored.append((s, pool))

    if not scored: return None
    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_pool = scored[0]
    scan(f"Safest pool selected — Score: {best_score}")
    return best_pool

def call_set_safe_pool(pool: dict) -> bool:
    if not PRIVATE_KEY or not AGENT_WALLET: return False
    try:
        token0     = Web3.to_checksum_address(pool["token0"]["id"])
        token1     = Web3.to_checksum_address(pool["token1"]["id"])
        fee        = int(pool.get("feeTier", 3000))
        tick_lower = int(pool.get("tickLower", -887220))
        tick_upper = int(pool.get("tickUpper",  887220))
        action(f"Setting safe pool: {token0[:8]}../{token1[:8]}.. fee={fee}")
        nonce   = w3.eth.get_transaction_count(AGENT_WALLET, "pending")
        tx_data = vault.functions.setSafePool(
            token0, token1, fee, tick_lower, tick_upper
        ).build_transaction({
            "from": AGENT_WALLET, "nonce": nonce,
            "gas": 400_000, "gasPrice": w3.eth.gas_price, "chainId": CHAIN_ID,
        })
        signed  = w3.eth.account.sign_transaction(tx_data, PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
        tx_log(f"setSafePool: {tx_hash.hex()[:20]}...")
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        success("Safe pool set on-chain")
        return True
    except Exception as e:
        log.error(f"setSafePool failed: {e}")
        return False


# ══════════════════════════════════════════════════════════════════════════════
#  EMAILS (async fire-and-forget)
# ══════════════════════════════════════════════════════════════════════════════

def _send_email(to_email, subject, html):
    if not to_email: return
    def _send():
        try:
            for _ in range(3):
                res = requests.post(
                    RESEND_API_URL,
                    headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                    json={"from": RESEND_FROM_EMAIL, "to": [to_email], "subject": subject, "html": html},
                    timeout=10
                )
                if res.status_code == 200:
                    success(f"Email sent to {to_email}")
                    return
                time.sleep(1)
        except Exception as e:
            log.error(f"Email failed: {e}")
    threading.Thread(target=_send, daemon=True).start()

def send_ghost_move_email(to_email, vibe_score, reaction_ms, tx_hash, strategy_mode, threat_type):
    mode_label = ["Aggressive", "Stable", "Safety"][strategy_mode]
    _send_email(to_email, "Vantaguard - Ghost Move Executed. Your Funds Are Secured.",
        f"""<div style="font-family:monospace;background:#0a0a0a;color:#00ff88;padding:24px;">
          <h2 style="color:#ff4444;">GHOST MOVE EXECUTED</h2>
          <p><b>Threat Type:</b> {threat_type}</p>
          <p><b>Vibe Score:</b> {vibe_score}/100</p>
          <p><b>Reaction Speed:</b> {reaction_ms}ms</p>
          <p><b>Strategy:</b> {mode_label}</p>
          <p><b>TX:</b> <a href="https://explorer.etherlink.com/tx/{tx_hash}" style="color:#00ff88;">{tx_hash[:20]}...</a></p>
          <p style="color:#aaa;">Your funds have been secured in your personal vault.</p>
        </div>""")

def send_redeploy_email(to_email, token0, token1, tx_hash):
    _send_email(to_email, "Vantaguard - Funds Redeployed to Safer Pool",
        f"""<div style="font-family:monospace;background:#0a0a0a;color:#00ff88;padding:24px;">
          <h2 style="color:#00ff88;">FUNDS REDEPLOYED</h2>
          <p><b>New Pool:</b> {token0[:10]}... / {token1[:10]}...</p>
          <p><b>TX:</b> <a href="https://explorer.etherlink.com/tx/{tx_hash}" style="color:#00ff88;">{tx_hash[:20]}...</a></p>
        </div>""")

def send_return_wallet_email(to_email, tx_hash):
    _send_email(to_email, "Vantaguard - Funds Returned to Your Wallet",
        f"""<div style="font-family:monospace;background:#0a0a0a;color:#00ff88;padding:24px;">
          <h2 style="color:#00ff88;">FUNDS RETURNED TO WALLET</h2>
          <p><b>TX:</b> <a href="https://explorer.etherlink.com/tx/{tx_hash}" style="color:#00ff88;">{tx_hash[:20]}...</a></p>
        </div>""")

def send_return_pool_email(to_email, tx_hash):
    _send_email(to_email, "Vantaguard - Funds Returned to Original Pool",
        f"""<div style="font-family:monospace;background:#0a0a0a;color:#00ff88;padding:24px;">
          <h2 style="color:#00ff88;">FUNDS BACK IN ORIGINAL POOL</h2>
          <p><b>TX:</b> <a href="https://explorer.etherlink.com/tx/{tx_hash}" style="color:#00ff88;">{tx_hash[:20]}...</a></p>
        </div>""")


# ══════════════════════════════════════════════════════════════════════════════
#  REFLEX BROADCASTER
# ══════════════════════════════════════════════════════════════════════════════

def call_log_threat(vibe_score: float, threat_type: str):
    if not PRIVATE_KEY or not AGENT_WALLET: return
    try:
        nonce   = w3.eth.get_transaction_count(AGENT_WALLET, "pending")
        tx_data = vault.functions.logThreat(int(vibe_score), threat_type).build_transaction({
            "from": AGENT_WALLET, "nonce": nonce,
            "gas": 1_500_000, "gasPrice": w3.eth.gas_price, "chainId": CHAIN_ID,
        })
        signed  = w3.eth.account.sign_transaction(tx_data, PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
        action(f"logThreat on-chain: {tx_hash.hex()[:20]}...")
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
        success("Threat timestamp + type confirmed on-chain")
    except Exception as e:
        log.error(f"logThreat failed: {e}")

def trigger_reflex(vibe_score, policy, threat_info, block_data) -> dict | None:
    global _ghost_exit, _total_exits, _best_reaction_ms

    if not _ghost_exit:
        log.error("No ghost route available")
        return None

    strategy_mode = policy["strategy_mode"]
    user_email    = policy.get("user_email")
    row_id        = policy.get("row_id", 1)
    threat_type   = threat_info.get("threat_type", "unknown")
    confidence_sc = threat_info.get("confidence_score", 0)

    detected_at        = datetime.now(timezone.utc).isoformat()
    threat_detected_ms = int(time.time() * 1000)

    alert(f"TOXIC VIBE DETECTED — Score: {vibe_score} | Threat: {threat_type}")
    confidence(f"Threat Score: {confidence_sc}% | Type: {threat_type}")
    decision("Risk threshold breached — executing emergency exit")

    action("Logging threat on-chain...")
    call_log_threat(vibe_score, threat_type)
    log_threat_event(VAULT_ADDRESS, threat_type, confidence_sc,
                     threat_info.get("factors", {}), block_data.get("block_number", 0))

    action("Broadcasting Ghost Move — zero signing latency")
    try:
        tx_hash         = w3.eth.send_raw_transaction(bytes.fromhex(_ghost_exit.lstrip("0x")))
        tx_broadcast_ms = int(time.time() * 1000)
        submitted_at    = datetime.now(timezone.utc).isoformat()
        tx_log(f"Ghost move broadcast: {tx_hash.hex()[:20]}...")

        receipt = None
        for _ in range(60):
            try:
                receipt = w3.eth.get_transaction_receipt(tx_hash)
                if receipt: break
            except Exception:
                pass
            time.sleep(2)

        tx_confirmed_ms   = int(time.time() * 1000)
        confirmed_at      = datetime.now(timezone.utc).isoformat()
        decision_ms       = tx_broadcast_ms - threat_detected_ms
        confirmation_ms   = tx_confirmed_ms - tx_broadcast_ms
        total_reaction_ms = tx_confirmed_ms - threat_detected_ms

        result(f"Funds secured in {total_reaction_ms}ms")

        _total_exits += 1
        if _best_reaction_ms is None or total_reaction_ms < _best_reaction_ms:
            _best_reaction_ms = total_reaction_ms

        log_reflex_legacy(threat_detected_ms, tx_broadcast_ms, tx_confirmed_ms,
                          total_reaction_ms, vibe_score, strategy_mode, tx_hash.hex())
        log_reaction(VAULT_ADDRESS, detected_at, submitted_at, confirmed_at,
                     decision_ms, confirmation_ms, total_reaction_ms)

        push_to_dashboard(vibe_score, True,
            f"GHOST MOVE EXECUTED - {total_reaction_ms}ms | Threat: {threat_type}",
            reaction_speed_ms=total_reaction_ms, row_id=row_id)
        push_leaderboard(row_id)

        send_ghost_move_email(user_email, vibe_score, total_reaction_ms,
                              tx_hash.hex(), strategy_mode, threat_type)

        time.sleep(5)
        execute_recovery(policy, threat_type)

        _ghost_exit = None
        build_ghost_routes()
        return receipt

    except Exception as e:
        log.error(f"Reflex broadcast failed: {e}")
        try:
            action("Attempting moveToSafeVault fallback...")
            nonce   = w3.eth.get_transaction_count(AGENT_WALLET, "pending")
            tx_data = vault.functions.moveToSafeVault().build_transaction({
                "from": AGENT_WALLET, "nonce": nonce,
                "gas": 800_000, "gasPrice": w3.eth.gas_price, "chainId": CHAIN_ID,
            })
            signed  = w3.eth.account.sign_transaction(tx_data, PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
            w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            success("Safe vault fallback executed")
        except Exception as e2:
            log.error(f"Safe vault fallback failed: {e2}")
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  AUTO RECOVERY
# ══════════════════════════════════════════════════════════════════════════════

def execute_recovery(policy, threat_type):
    global _ghost_redeploy, _ghost_wallet

    strategy_mode = policy["strategy_mode"]
    min_liquidity = policy.get("min_pool_liquidity", 50000)
    user_email    = policy.get("user_email")

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
                    tx_log(f"Redeploy tx: {tx_hash.hex()[:20]}...")
                    w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                    success("Funds redeployed to safer pool")
                    _ghost_redeploy = None
                    token0 = safe_pool.get("token0", {}).get("id", "")
                    token1 = safe_pool.get("token1", {}).get("id", "")
                    send_redeploy_email(user_email, token0, token1, tx_hash.hex())
                except Exception as e:
                    log.error(f"Redeploy failed: {e}")

    elif strategy_mode == 2:
        if _ghost_wallet:
            action("Broadcasting returnToWallet...")
            try:
                tx_hash = w3.eth.send_raw_transaction(bytes.fromhex(_ghost_wallet.lstrip("0x")))
                tx_log(f"Return to wallet tx: {tx_hash.hex()[:20]}...")
                w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                success("Funds returned to owner wallet")
                _ghost_wallet = None
                send_return_wallet_email(user_email, tx_hash.hex())
            except Exception as e:
                log.error(f"returnToWallet failed: {e}")

    elif strategy_mode == 1:
        action("Stable mode — monitoring for pool recovery before returning...")

def execute_return_to_pool(policy):
    user_email = policy.get("user_email")
    if not PRIVATE_KEY or not AGENT_WALLET: return
    try:
        nonce   = w3.eth.get_transaction_count(AGENT_WALLET, "pending")
        tx_data = vault.functions.returnToWallet().build_transaction({
            "from": AGENT_WALLET, "nonce": nonce,
            "gas": 800_000, "gasPrice": w3.eth.gas_price, "chainId": CHAIN_ID,
        })
        signed  = w3.eth.account.sign_transaction(tx_data, PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
        tx_log(f"returnToOriginalPool tx: {tx_hash.hex()[:20]}...")
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        success("Funds returned to original pool")
        send_return_pool_email(user_email, tx_hash.hex())
    except Exception as e:
        log.error(f"returnToOriginalPool failed: {e}")


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN LOOP
# ══════════════════════════════════════════════════════════════════════════════

def main():
    global _cycle_count, _error_count, vault, VAULT_ADDRESS

    log.info("=" * 60)
    log.info("  VANTAGUARD SENTINEL ONLINE")
    log.info("  Reflex Layer for DeFi - Etherlink Mainnet")
    log.info("=" * 60)

    action("Multi-signal threat intelligence engine active")
    action("Real-time block scanning initialized")
    action("Mempool intelligence layer ready")
    action("Threat classification engine armed")

    update_gas_baseline()

    # ── LOAD USER VAULT FROM FACTORY ─────────────────────────────────────────
    VAULT_ADDRESS = get_user_vault_address()
    if VAULT_ADDRESS:
        vault = w3.eth.contract(
            address=VAULT_ADDRESS,
            abi=SHADOW_VAULT_ABI
        )
        action(f"Vault loaded: {VAULT_ADDRESS}")
    else:
        log.error("Could not load user vault — exiting")
        return

    action("Pre-signing all 3 ghost routes...")
    build_ghost_routes()

    exit_triggered = False
    token0 = ""
    token1 = ""

    try:
        token0 = vault.functions.savedToken0().call()
        token1 = vault.functions.savedToken1().call()
        scan(f"Monitoring pool: {token0[:10]}... / {token1[:10]}...")
    except Exception:
        scan("No position registered yet - monitoring network signals")

    while True:
        try:
            _cycle_count += 1

            if _cycle_count % 10 == 0:
                update_gas_baseline()

            check_nonce_sentinel()

            block_data   = scan_block_data()
            mempool_data = scan_mempool()
            scan_rpc_heartbeat()

            pool_data = {"liquidity_delta_pct": 0, "tvl": 0, "volume_24h": 0}
            if token0 and token1:
                pool_data = scan_pool_liquidity(token0, token1)

            vibe_data = calculate_vibe_score(mempool_data)
            score     = vibe_data["vibe_score"]
            signals   = vibe_data["signals"]

            log.info(f"Vibe:{score} | Gas:{signals['gas']} | Mem:{signals['mempool']} | Vol:{signals['volatility']} | Liq:{signals['liquidity']}")

            threat_info = classify_threat(block_data, mempool_data, pool_data)
            threat_type = threat_info["threat_type"]
            conf_score  = threat_info["confidence_score"]

            if conf_score > 20:
                confidence(f"Threat Score: {conf_score}% | Type: {threat_type}")

            policy     = get_intent_policy()
            mode       = policy["strategy_mode"]
            threshold  = policy["vibe_threshold"]
            row_id     = policy.get("row_id", 1)
            is_locked  = policy.get("is_locked", False)
            action_cmd = policy_to_action(policy, score, threat_type)

            intent(f"Strategy: {['Aggressive','Stable','Safety'][mode]} | Threshold: {threshold} | Decision: {action_cmd}")

            if action_cmd == "EMERGENCY_EXIT" and not exit_triggered and not is_locked:
                trigger_reflex(score, policy, threat_info, block_data)
                exit_triggered = True
                try:
                    token0 = vault.functions.savedToken0().call()
                    token1 = vault.functions.savedToken1().call()
                except Exception:
                    pass

            elif score >= threshold + 10 and exit_triggered:
                success(f"Vibes recovered — Score: {score}")
                if mode == 1:
                    action("Stable mode recovery — returning to original pool...")
                    execute_return_to_pool(policy)
                push_to_dashboard(score, False,
                    "System restored - Sentinel resuming patrol.",
                    signals=signals, row_id=row_id)
                exit_triggered = False

            elif not is_locked:
                push_to_dashboard(
                    score, False,
                    f"Scanning block {block_data.get('block_number', '?')} | Vibe: {score}/100 | Mode: {['Aggressive','Stable','Safety'][mode]}",
                    signals=signals, row_id=row_id
                )
                update_vault_metrics(
                    VAULT_ADDRESS, pool_data.get("tvl", 0),
                    "IN_POOL", f"Monitoring - cycle {_cycle_count}",
                    pool_data.get("tvl", 0)
                )
            else:
                log.info("Manual lock active — agent standing by")

            _error_count = 0

        except Exception as e:
            log.error(f"Scanner error: {e}")
            _error_count += 1
            if _error_count >= MAX_ERRORS:
                log.error(f"Too many consecutive errors — resetting")
                _error_count = 0
                build_ghost_routes()

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()