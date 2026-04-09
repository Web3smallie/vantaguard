"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount } from "wagmi";
import { supabase } from "@/lib/supabase";
import { Header } from "@/components/Header";
import { SignalBars } from "@/components/SignalBars";
import { Onboarding } from "@/components/Onboarding";
import { ReflexHistory } from "@/components/ReflexHistory";
import { DemoControls } from "@/components/DemoControls";

type ActivityLog = {
  id: number;
  type: string;
  message: string;
  created_at: string;
};

type ReflexLog = {
  id: number;
  reaction_speed_ms: number;
  vibe_score_at_trigger: number;
  strategy_mode: number;
  tx_hash: string;
  created_at: string;
};

type ThreatEvent = {
  id: number;
  threat_type: string;
  confidence_score: number;
  factors: Record<string, number>;
  block_number: number;
  detected_at: string;
};

type VaultMetrics = {
  tvl: number;
  funds_state: string;
  protected_amount: number;
};

const LOG_COLORS: Record<string, string> = {
  ALERT:      "var(--red)",
  ACTION:     "var(--blue)",
  TX:         "#ffaa00",
  SUCCESS:    "var(--green)",
  SCAN:       "var(--muted)",
  INTENT:     "#aa88ff",
  ANALYSIS:   "#00aaff",
  INFERENCE:  "#ff88aa",
  CONFIDENCE: "#ffaa00",
  DECISION:   "var(--red)",
  RESULT:     "var(--green)",
  POOL:       "#00ddaa",
  MEMPOOL:    "#aaaaff",
  BLOCK:      "#888888",
};

function Radar({ isLocked, vibeScore }: { isLocked: boolean; vibeScore: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef  = useRef(0);
  const frameRef  = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const r  = Math.min(W, H) / 2 - 8;

    const dots: { x: number; y: number; life: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 0.8;
      dots.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, life: Math.random() });
    }

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, W, H);

      const color = isLocked ? "#ff3355" : vibeScore < 50 ? "#ffaa00" : "#00ff88";

      ctx.strokeStyle = color + "22";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r / 4) * i, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = color + "22";
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();

      ctx.strokeStyle = color + "88";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      const sweepAngle = Math.PI / 3;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angleRef.current - sweepAngle, angleRef.current);
      ctx.closePath();
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      sweepGrad.addColorStop(0, color + "00");
      sweepGrad.addColorStop(1, color + "33");
      ctx.fillStyle = sweepGrad;
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angleRef.current) * r, cy + Math.sin(angleRef.current) * r);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      dots.forEach(dot => {
        dot.life = (dot.life + 0.005) % 1;
        const alpha = Math.sin(dot.life * Math.PI);
        ctx.fillStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      angleRef.current += 0.03;
      frameRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [isLocked, vibeScore]);

  return (
    <canvas ref={canvasRef} width={280} height={280} style={{ display: "block", margin: "0 auto" }} />
  );
}


export default function Home() {
  const { isConnected, address } = useAccount();

  const [vibeScore,     setVibeScore]     = useState(0);
  const [isLocked,      setIsLocked]      = useState(false);
  const [strategy,      setStrategy]      = useState(2);
  const [threshold,     setThreshold]     = useState(30);
  const [signals,       setSignals]       = useState({ gas: 0, mempool: 0, volatility: 0, liquidity: 0 });
  const [reactionMs,    setReactionMs]    = useState<number | null>(null);
  const [email,         setEmail]         = useState("");
  const [emailSaved,    setEmailSaved]    = useState(false);
  const [reflexHistory, setReflexHistory] = useState<ReflexLog[]>([]);
  const [activityLogs,  setActivityLogs]  = useState<ActivityLog[]>([]);
  const [latestThreat,  setLatestThreat]  = useState<ThreatEvent | null>(null);
  const [vaultMetrics,  setVaultMetrics]  = useState<VaultMetrics | null>(null);
  const [totalExits,    setTotalExits]    = useState(0);
  const [cycleCount,    setCycleCount]    = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  // ── POLL SECURITY STATUS ─────────────────────────────────────────────────
  const pollStatus = useCallback(async () => {
    const { data } = await supabase
      .from("security_status")
      .select("*")
      .limit(1)
      .single();
    if (!data) return;

    setVibeScore(data.vibe_score || 0);
    setIsLocked(data.is_locked || false);
    setStrategy(data.strategy_mode ?? 2);
    setThreshold(data.vibe_threshold ?? 30);
    setReactionMs(data.reaction_speed_ms || null);
    setTotalExits(data.total_exits || 0);
    setSignals({
      gas:        data.signal_gas || 0,
      mempool:    data.signal_mempool || 0,
      volatility: data.signal_volatility || 0,
      liquidity:  data.signal_liquidity || 0,
    });

    if (data.user_email && !emailSaved) {
      setEmail(data.user_email);
      setEmailSaved(true);
    }
  }, [emailSaved]);

  // ── SAVE WALLET ADDRESS TO SUPABASE ─────────────────────────────────────
  useEffect(() => {
    if (!address) return;
    supabase
      .from("security_status")
      .update({ user_address: address })
      .eq("id", 1);
  }, [address]);

  // ── POLL ACTIVITY LOG ────────────────────────────────────────────────────
  const pollActivity = useCallback(async () => {
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .order("id", { ascending: false })
      .limit(100);
    if (data && data.length > 0) {
      setActivityLogs(data.reverse());
      setCycleCount(prev => prev + 1);
    }
  }, []);

  // ── POLL REFLEX HISTORY ──────────────────────────────────────────────────
  const pollHistory = useCallback(async () => {
    const { data } = await supabase
      .from("reflex_log")
      .select("*")
      .order("id", { ascending: false })
      .limit(10);
    if (data) setReflexHistory(data);
  }, []);

  // ── POLL THREAT EVENTS ───────────────────────────────────────────────────
  const pollThreats = useCallback(async () => {
    const { data } = await supabase
      .from("threat_events")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    if (data) setLatestThreat(data);
  }, []);

  // ── POLL VAULT METRICS ───────────────────────────────────────────────────
  const pollVaultMetrics = useCallback(async () => {
    const { data } = await supabase
      .from("vault_metrics")
      .select("*")
      .limit(1)
      .single();
    if (data) setVaultMetrics(data);
  }, []);

  useEffect(() => {
    pollStatus();
    pollActivity();
    pollHistory();
    pollThreats();
    pollVaultMetrics();

    const s  = setInterval(pollStatus,       5000);
    const a  = setInterval(pollActivity,     3000);
    const h  = setInterval(pollHistory,      15000);
    const t  = setInterval(pollThreats,      10000);
    const vm = setInterval(pollVaultMetrics, 10000);

    return () => {
      clearInterval(s);
      clearInterval(a);
      clearInterval(h);
      clearInterval(t);
      clearInterval(vm);
    };
  }, []);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [activityLogs]);

  async function setStrategyMode(mode: number) {
    setStrategy(mode);
    await supabase.from("security_status").update({ strategy_mode: mode }).eq("id", 1);
  }

  async function saveEmail() {
    if (!email || !email.includes("@")) return;
    const { data } = await supabase.from("security_status").select("id").limit(1).single();
    if (!data) return;
    await supabase.from("security_status").update({ user_email: email }).eq("id", data.id);
    setEmailSaved(true);
  }

  const fundsState       = vaultMetrics?.funds_state || "IN_POOL";
  const tvl              = vaultMetrics?.tvl || 0;
  const lossPreventedPct = latestThreat?.factors
    ? Math.min(45, Object.values(latestThreat.factors).reduce((a, b) => a + b, 0) / 4)
    : 0;
  const lossPreventedUsd = tvl * (lossPreventedPct / 100);

  const fundsStateColor =
    fundsState === "SECURED"    ? "var(--yellow)" :
    fundsState === "IN_TRANSIT" ? "var(--blue)"   :
    "var(--green)";

  const strategies   = ["AGGRESSIVE", "STABLE", "SAFETY"];
  const strategyDesc = [
    "Scan & redeploy to safest pool",
    "Wait, return to original pool",
    "Return funds to wallet immediately",
  ];

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    padding: 24,
  };

  const label: React.CSSProperties = {
    fontSize: 13,
    color: "var(--muted)",
    letterSpacing: 4,
    marginBottom: 16,
    textTransform: "uppercase" as const,
  };

  const metricBox: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header isLocked={isLocked} />

      <div style={{
        textAlign: "center", padding: "16px 32px", fontSize: 15,
        color: "var(--muted)", borderBottom: "1px solid var(--border)",
        fontStyle: "italic", letterSpacing: 1, lineHeight: 1.6,
      }}>
        <span style={{ color: "var(--green)" }}>Vantaguard</span> is the first Reflex Layer for DeFi —{" "}
        a system that executes protective intent faster than human cognition.
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

        {isConnected && <Onboarding strategy={strategy} />}

        {/* ── KEY METRICS ROW ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          <div style={metricBox}>
            <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2 }}>REACTION</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--green)" }}>
              {reactionMs ? `⚡ ${reactionMs}ms` : "---"}
            </div>
          </div>
          <div style={metricBox}>
            <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2 }}>TVL PROTECTED</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--green)" }}>
              ${tvl > 0 ? tvl.toFixed(2) : "0.00"}
            </div>
          </div>
          <div style={metricBox}>
            <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2 }}>THREATS</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--red)" }}>{totalExits}</div>
          </div>
          <div style={metricBox}>
            <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2 }}>AUTO ACTIONS</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--blue)" }}>{totalExits * 2}</div>
          </div>
          <div style={metricBox}>
            <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2 }}>LOSS PREVENTED</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--green)" }}>
              {lossPreventedPct > 0 ? `~${lossPreventedPct.toFixed(1)}%` : "---"}
            </div>
          </div>
          <div style={metricBox}>
            <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2 }}>UPTIME</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--green)" }}>99.9%</div>
          </div>
          <div style={metricBox}>
            <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2 }}>CYCLES</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--muted)" }}>{cycleCount}</div>
          </div>
        </div>

        {/* ── RADAR + SENTINEL LOGS ────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>

          <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={label}>SENTINEL RADAR</div>
            <Radar isLocked={isLocked} vibeScore={vibeScore} />
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: 14, fontWeight: 700, letterSpacing: 3,
                color: isLocked ? "var(--red)" : vibeScore < 50 ? "var(--yellow)" : "var(--green)",
              }}>
                {isLocked ? "⚠ THREAT DETECTED" : "SENTINEL: MONITORING"}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
                VIBE SCORE: {vibeScore.toFixed(1)}%
              </div>
              <div style={{ fontSize: 13, color: fundsStateColor, marginTop: 4, letterSpacing: 2 }}>
                {fundsState}
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 12,
            }}>
              <div style={label}>SENTINEL THOUGHT LOGS</div>
              <div style={{ fontSize: 12, color: "var(--green)", animation: "blink 1s infinite" }}>● LIVE</div>
            </div>
            <div ref={feedRef} style={{
              height: 280, overflowY: "auto", overflowAnchor: "none",
              fontFamily: "monospace", fontSize: 12,
            }}>
              {activityLogs.length === 0 ? (
                <div style={{ color: "var(--dim)", padding: 16 }}>Connecting to Etherlink Sentinel...</div>
              ) : (
                activityLogs.map((log) => (
                  <div key={log.id} style={{
                    display: "grid", gridTemplateColumns: "70px 110px 1fr",
                    gap: 10, lineHeight: 1.8,
                    borderBottom: "1px solid #0d0d0d", padding: "3px 0",
                  }}>
                    <span style={{ color: "#444" }}>
                      {new Date(log.created_at).toLocaleTimeString("en-US", { hour12: false })}
                    </span>
                    <span style={{ color: LOG_COLORS[log.type] || "var(--muted)", letterSpacing: 1 }}>
                      [{log.type}]
                    </span>
                    <span style={{
                      color: log.type === "ALERT" || log.type === "DECISION" ? "var(--red)" :
                             log.type === "SUCCESS" || log.type === "RESULT" ? "var(--green)" :
                             log.type === "INFERENCE" ? "#ff88aa" : "#666",
                    }}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              <div style={{ color: "var(--dim)", animation: "blink 1s infinite" }}>█</div>
            </div>
          </div>
        </div>

        {/* ── VIBE + SIGNALS + THREAT PANEL ───────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

          <div style={card}>
            <div style={label}>VIBE SCORE</div>
            <div style={{
              fontSize: 80, fontWeight: 900, lineHeight: 1,
              color: vibeScore < threshold ? "var(--red)" :
                     vibeScore < 60 ? "var(--yellow)" : "var(--green)",
              transition: "color 0.5s",
            }}>
              {vibeScore.toFixed(1)}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>/100</div>
            <div style={{ height: 3, background: "#111", marginTop: 12 }}>
              <div style={{
                height: "100%", width: `${vibeScore}%`,
                background: vibeScore < threshold ? "var(--red)" : "var(--green)",
                transition: "all 0.5s",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 8 }}>
              <span style={{ color: "var(--muted)" }}>THRESHOLD: <span style={{ color: "var(--yellow)" }}>{threshold}</span></span>
              <span style={{ color: vibeScore < threshold ? "var(--red)" : "var(--green)" }}>
                {vibeScore < threshold ? "THREAT" : "SAFE"}
              </span>
            </div>
          </div>

          <SignalBars
            gas={signals.gas}
            mempool={signals.mempool}
            volatility={signals.volatility}
            liquidity={signals.liquidity}
            threshold={threshold}
          />

          <div style={card}>
            <div style={label}>THREAT INTELLIGENCE</div>
            {latestThreat ? (
              <>
                <div style={{
                  fontSize: 14, fontWeight: 700, letterSpacing: 2,
                  color: "var(--red)", marginBottom: 12,
                }}>
                  {latestThreat.threat_type.toUpperCase().replace("_", " ")}
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: "var(--muted)" }}>CONFIDENCE</span>
                    <span style={{ color: "var(--yellow)" }}>{latestThreat.confidence_score}%</span>
                  </div>
                  <div style={{ height: 3, background: "#111" }}>
                    <div style={{
                      height: "100%", width: `${latestThreat.confidence_score}%`,
                      background: "var(--yellow)",
                    }} />
                  </div>
                </div>
                {latestThreat.factors && Object.entries(latestThreat.factors).map(([key, val]) => (
                  <div key={key} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: "var(--muted)", letterSpacing: 1 }}>{key.toUpperCase().replace("_", " ")}</span>
                      <span style={{ color: (val as number) > 15 ? "var(--red)" : "var(--muted)" }}>{val as number}</span>
                    </div>
                    <div style={{ height: 2, background: "#111" }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.min(100, (val as number) * 2.5)}%`,
                        background: (val as number) > 15 ? "var(--red)" : "var(--dim)",
                      }} />
                    </div>
                  </div>
                ))}
                {lossPreventedPct > 0 && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px",
                    border: "1px solid var(--green)",
                    fontSize: 12, color: "var(--green)",
                  }}>
                    Prevented ~{lossPreventedPct.toFixed(1)}% loss
                    {lossPreventedUsd > 0 && ` ($${lossPreventedUsd.toFixed(0)})`}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 16 }}>
                No threats detected yet.<br />Sentinel is monitoring...
              </div>
            )}
          </div>
        </div>

        {/* ── STRATEGY + EMAIL + DEMO ─────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

          <div style={card}>
            <div style={label}>STRATEGY MODE</div>
            {strategies.map((s, i) => (
              <button key={s} onClick={() => setStrategyMode(i)} style={{
                width: "100%",
                background: strategy === i ? "rgba(255,255,255,0.05)" : "transparent",
                border: `1px solid ${strategy === i ? "#fff" : "var(--border)"}`,
                color: strategy === i ? "#fff" : "var(--muted)",
                padding: "14px 16px", fontFamily: "monospace",
                fontSize: 14, letterSpacing: 2,
                cursor: "pointer", textAlign: "left",
                marginBottom: 8, display: "block",
              }}>
                {strategy === i ? "▶ " : "  "}{s}
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  {strategyDesc[i]}
                </div>
              </button>
            ))}
          </div>

          <div style={card}>
            <div style={label}>ALERT SUBSCRIPTION</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, lineHeight: 1.8 }}>
              Get instant email alerts when ghost moves fire, funds are rerouted, or recovered.
            </div>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailSaved(false); }}
              style={{
                width: "100%", background: "#111",
                border: "1px solid var(--border)", color: "#fff",
                padding: "12px 14px", fontFamily: "monospace",
                fontSize: 14, outline: "none", marginBottom: 10,
                boxSizing: "border-box",
              }}
            />
            <button onClick={saveEmail} style={{
              width: "100%",
              background: emailSaved ? "var(--green)" : "transparent",
              border: "1px solid var(--green)",
              color: emailSaved ? "#000" : "var(--green)",
              padding: 12, fontFamily: "monospace",
              fontSize: 13, letterSpacing: 3, cursor: "pointer",
            }}>
              {emailSaved ? "✓ SUBSCRIBED" : "SUBSCRIBE TO ALERTS"}
            </button>
            {emailSaved && (
              <div style={{ fontSize: 12, color: "var(--green)", marginTop: 8, lineHeight: 1.8 }}>
                ✓ Ghost Move · Redeploy · Return to Wallet · Pool Recovery
              </div>
            )}
          </div>

          <DemoControls />
        </div>

        <ReflexHistory logs={reflexHistory} />

      </div>
    </div>
  );
}