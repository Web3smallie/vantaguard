"use client";
import { supabase } from "@/lib/supabase";

export function DemoControls() {
  async function simulateAttack() {
    await supabase.from("security_status").update({ vibe_threshold: 90 }).eq("id", 1);
  }

  async function resetSentinel() {
    await supabase.from("security_status").update({ vibe_threshold: 30 }).eq("id", 1);
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 24 }}>
      <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 4, marginBottom: 16 }}>
        DEMO CONTROLS
      </div>
      <button
        onClick={simulateAttack}
        style={{
          width: "100%", background: "transparent", border: "1px solid var(--red)",
          color: "var(--red)", padding: 14, fontFamily: "monospace",
          fontSize: 10, letterSpacing: 3, cursor: "pointer", marginBottom: 8,
        }}
      >
        ⚡ SIMULATE ATTACK
      </button>
      <button
        onClick={resetSentinel}
        style={{
          width: "100%", background: "transparent", border: "1px solid var(--dim)",
          color: "var(--dim)", padding: 10, fontFamily: "monospace",
          fontSize: 9, letterSpacing: 3, cursor: "pointer",
        }}
      >
        RESET SENTINEL
      </button>
    </div>
  );
}