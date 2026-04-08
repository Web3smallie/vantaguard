"use client";
import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { supabase } from "@/lib/supabase";
import { Header } from "@/components/Header";
import { VibeScore } from "@/components/VibeScore";
import { ReactionSpeed } from "@/components/ReactionSpeed";
import { VaultStatus } from "@/components/VaultStatus";
import { SignalBars } from "@/components/SignalBars";
import { Onboarding } from "@/components/Onboarding";
import { ReflexHistory } from "@/components/ReflexHistory";
import { DemoControls } from "@/components/DemoControls";

type FeedLog = { time: string; type: string; msg: string };

const LOG_COLORS: Record<string, string> = {
  ALERT: "var(--red)",
  ACTION: "var(--blue)",
  TX: "var(--yellow)",
  SUCCESS: "var(--green)",
  SCAN: "var(--muted)",
  INTENT: "var(--purple)",
};

export default function Home() {
  const { isConnected } = useAccount();

  const [vibeScore, setVibeScore] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [strategy, setStrategy] = useState(2);
  const [threshold, setThreshold] = useState(30);
  const [signals, setSignals] = useState({ gas: 0, mempool: 0, volatility: 0, liquidity: 0 });
  const [reactionMs, setReactionMs] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [feedLogs, setFeedLogs] = useState<FeedLog[]>([]);
  const [reflexHistory, setReflexHistory] = useState<any[]>([]);
  const [prevAction, setPrevAction] = useState("");

  function addLog(type: string, msg: string) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setFeedLogs(prev => [...prev.slice(-50), { time, type, msg }]);
  }

  const pollStatus = useCallback(async () => {
    const { data } = await supabase.from("security_status").select("*").eq("id", 1).single();
    if (!data) return;
    setVibeScore(data.vibe_score || 0);
    setIsLocked(data.is_locked || false);
    setStrategy(data.strategy_mode ?? 2);
    setThreshold(data.vibe_threshold ?? 30);
    setReactionMs(data.reaction_speed_ms || null);
    setSignals({
      gas: data.signal_gas || 0,
      mempool: data.signal_mempool || 0,
      volatility: data.signal_volatility || 0,
      liquidity: data.signal_liquidity || 0,
    });
    if (data.last_action && data.last_action !== prevAction) {
      setPrevAction(data.last_action);
      const type = data.last_action.includes("GHOST") ? "ALERT" :
        data.last_action.includes("restored") ? "SUCCESS" :
        data.last_action.includes("Scanning") ? "SCAN" : "ACTION";
      addLog(type, data.last_action);
    }
  }, [prevAction]);

  const pollHistory = useCallback(async () => {
    const { data } = await supabase.from("reflex_log").select("*").order("id", { ascending: false }).limit(10);
    if (data) setReflexHistory(data);
  }, []);

  useEffect(() => {
    addLog("ACTION", "Vantaguard dashboard initialized");
    addLog("SCAN", "Connecting to Etherlink Shadownet...");
    pollStatus();
    pollHistory();
    const s = setInterval(pollStatus, 5000);
    const h = setInterval(pollHistory, 15000);
    return () => { clearInterval(s); clearInterval(h); };
  }, []);

  async function setStrategyMode(mode: number) {
    setStrategy(mode);
    await supabase.from("security_status").update({ strategy_mode: mode }).eq("id", 1);
    addLog("INTENT", "Strategy updated: " + ["Aggressive", "Stable", "Safety"][mode]);
  }

  async function saveEmail() {
    if (!email || !email.includes("@")) return;
    await supabase.from("security_status").update({ user_email: email }).eq("id", 1);
    setEmailSaved(true);
    addLog("SUCCESS", "Alert subscription saved: " + email);
  }

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    padding: 28,
  };

  const label: React.CSSProperties = {
    fontSize: 14,
    color: "var(--muted)",
    letterSpacing: 4,
    marginBottom: 20,
    textTransform: "uppercase",
  };

  const strategies = ["AGGRESSIVE", "STABLE", "SAFETY"];
  const strategyDesc = [
    "Scan & redeploy to safest pool",
    "Wait, return to original pool",
    "Return funds to wallet immediately",
  ];

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header isLocked={isLocked} />

      <div style={{
        textAlign: "center", padding: "20px 32px", fontSize: 16,
        color: "var(--muted)", borderBottom: "1px solid var(--border)",
        fontStyle: "italic", letterSpacing: 1, lineHeight: 1.6,
      }}>
        <span style={{ color: "var(--green)" }}>Vantaguard</span> is the first Reflex Layer for DeFi —{" "}
        a system that executes protective intent faster than human cognition.
      </div>

      <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {isConnected && <Onboarding strategy={strategy} />}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <VibeScore score={vibeScore} threshold={threshold} />
          <ReactionSpeed ms={reactionMs} />
          <VaultStatus isLocked={isLocked} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <SignalBars
            gas={signals.gas}
            mempool={signals.mempool}
            volatility={signals.volatility}
            liquidity={signals.liquidity}
            threshold={threshold}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={card}>
              <div style={label}>STRATEGY MODE</div>
              {strategies.map((s, i) => (
                <button key={s} onClick={() => setStrategyMode(i)} style={{
                  width: "100%",
                  background: strategy === i ? "rgba(255,255,255,0.05)" : "transparent",
                  border: `1px solid ${strategy === i ? "#fff" : "var(--border)"}`,
                  color: strategy === i ? "#fff" : "var(--muted)",
                  padding: "16px 18px",
                  fontFamily: "monospace",
                  fontSize: 15,
                  letterSpacing: 2,
                  cursor: "pointer",
                  textAlign: "left",
                  marginBottom: 8,
                  display: "block",
                }}>
                  {strategy === i ? "▶ " : "  "}{s}
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                    {strategyDesc[i]}
                  </div>
                </button>
              ))}
            </div>

            <div style={card}>
              <div style={label}>ALERT SUBSCRIPTION</div>
              <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16, lineHeight: 1.8 }}>
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
                  padding: "14px 16px", fontFamily: "monospace",
                  fontSize: 15, outline: "none", marginBottom: 12,
                  boxSizing: "border-box",
                }}
              />
              <button onClick={saveEmail} style={{
                width: "100%",
                background: emailSaved ? "var(--green)" : "transparent",
                border: "1px solid var(--green)",
                color: emailSaved ? "#000" : "var(--green)",
                padding: 14, fontFamily: "monospace",
                fontSize: 14, letterSpacing: 3, cursor: "pointer",
              }}>
                {emailSaved ? "✓ SUBSCRIBED" : "SUBSCRIBE TO ALERTS"}
              </button>
              {emailSaved && (
                <div style={{ fontSize: 13, color: "var(--green)", marginTop: 10, lineHeight: 1.8 }}>
                  ✓ Alerts: Ghost Move · Redeploy · Return to Wallet · Pool Recovery
                </div>
              )}
            </div>

            <DemoControls />
          </div>
        </div>

        {/* Activity Feed — fixed height, scroll contained, no page jump */}
        <div style={card}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 16,
          }}>
            <div style={label}>LIVE ACTIVITY FEED</div>
            <div style={{ fontSize: 14, color: "var(--green)", animation: "blink 1s infinite" }}>
              ● LIVE
            </div>
          </div>
          <div style={{
            height: 280,
            overflowY: "auto",
            overflowAnchor: "none",
          }}>
            {feedLogs.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--dim)", textAlign: "center", padding: 20 }}>
                Connecting to agent...
              </div>
            ) : (
              feedLogs.map((log, i) => (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "80px 100px 1fr",
                  gap: 12,
                  fontSize: 12,
                  lineHeight: 1.8,
                  borderBottom: "1px solid #0d0d0d",
                  padding: "5px 0",
                }}>
                  <span style={{ color: "var(--dim)" }}>{log.time}</span>
                  <span style={{ color: LOG_COLORS[log.type] || "var(--muted)", letterSpacing: 1 }}>
                    [{log.type}]
                  </span>
                  <span style={{
                    color: log.type === "ALERT" ? "var(--red)" :
                           log.type === "SUCCESS" ? "var(--green)" : "#888",
                  }}>
                    {log.msg}
                  </span>
                </div>
              ))
            )}
            <div style={{ color: "var(--dim)", fontSize: 12, animation: "blink 1s infinite" }}>█</div>
          </div>
        </div>

        <ReflexHistory logs={reflexHistory} />

      </div>
    </div>
  );
}