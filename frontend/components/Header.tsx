"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Header({ isLocked }: { isLocked: boolean }) {
  return (
    <header style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "24px 32px", borderBottom: "1px solid var(--border)",
      background: "var(--surface)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <polygon points="24,2 44,12 44,36 24,46 4,36 4,12" fill="none" stroke="#00ff88" strokeWidth="1.5"/>
          <polygon points="24,8 38,16 38,32 24,40 10,32 10,16" fill="none" stroke="#00ff88" strokeWidth="0.5" opacity="0.3"/>
          <line x1="24" y1="10" x2="24" y2="26" stroke="#00ff88" strokeWidth="2"/>
          <polygon points="24,28 20,22 28,22" fill="#00ff88"/>
          <circle cx="24" cy="32" r="2" fill="#00ff88"/>
        </svg>
        <div>
          <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 5 }}>AUTONOMOUS REFLEX SYSTEM</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: 4, lineHeight: 1 }}>VANTAGUARD</div>
          <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 2, marginTop: 2, fontStyle: "italic" }}>
            Etherlink Shadownet · v1.0
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          padding: "6px 16px",
          border: `1px solid ${isLocked ? "var(--red)" : "var(--green)"}`,
          color: isLocked ? "var(--red)" : "var(--green)",
          fontSize: 9, letterSpacing: 3,
          animation: isLocked ? "pulse 0.8s infinite" : "none",
        }}>
          {isLocked ? "⚠ THREAT DETECTED" : "● SENTINEL ACTIVE"}
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}