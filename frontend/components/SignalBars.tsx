"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  gas: number;
  mempool: number;
  volatility: number;
  liquidity: number;
  threshold: number;
};

function sigColor(v: number) {
  return v > 70 ? "var(--green)" : v > 40 ? "var(--yellow)" : "var(--red)";
}

function Signal({ label, value }: { label: string; value: number }) {
  const c = sigColor(value);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 2 }}>{label}</span>
        <span style={{ fontSize: 9, color: c }}>{Math.round(value)}</span>
      </div>
      <div style={{ height: 2, background: "#111" }}>
        <div style={{ height: "100%", width: `${value}%`, background: c, transition: "all 0.5s" }} />
      </div>
    </div>
  );
}

export function SignalBars({ gas, mempool, volatility, liquidity, threshold }: Props) {
  const [localThreshold, setLocalThreshold] = useState(threshold);

  async function updateThreshold(val: number) {
    setLocalThreshold(val);
    await supabase.from("security_status").update({ vibe_threshold: val }).eq("id", 1);
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 24 }}>
      <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 4, marginBottom: 20 }}>THREAT SIGNALS</div>
      <Signal label="GAS SPIKE" value={gas} />
      <Signal label="MEMPOOL LOAD" value={mempool} />
      <Signal label="VOLATILITY" value={volatility} />
      <Signal label="LIQUIDITY DRAIN" value={liquidity} />

      <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 10 }}>
          <span style={{ color: "var(--muted)", letterSpacing: 2 }}>TRIGGER THRESHOLD</span>
          <span style={{ color: "var(--yellow)" }}>{localThreshold}</span>
        </div>
        <input
          type="range" min="10" max="90" value={localThreshold}
          onChange={e => updateThreshold(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--yellow)", cursor: "pointer" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "var(--dim)", marginTop: 4 }}>
          <span>10 — STRICT</span>
          <span>90 — DEMO MODE</span>
        </div>
      </div>
    </div>
  );
}