"use client";

type Props = {
  isLocked: boolean;
  fundsInVault?: boolean;
  swapping?: boolean;
  swapFrom?: string;
  swapTo?: string;
};

export function VaultStatus({ isLocked, fundsInVault, swapping, swapFrom, swapTo }: Props) {
  const location = swapping ? "SWAPPING — REROUTING FUNDS" :
    fundsInVault ? "IN VAULT — SECURED" :
    isLocked ? "GHOST MOVE EXECUTING..." :
    "IN POOL — EARNING FEES";

  const locationColor = swapping ? "var(--yellow)" :
    fundsInVault ? "var(--yellow)" :
    isLocked ? "var(--red)" :
    "var(--green)";

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 24 }}>
      <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 4, marginBottom: 20 }}>VAULT STATUS</div>
      <div style={{
        padding: 12, border: "1px solid var(--border)", textAlign: "center",
        fontSize: 11, letterSpacing: 2, color: locationColor, marginBottom: 16,
        animation: isLocked ? "pulse 1s infinite" : "none",
      }}>
        {location}
      </div>

      {swapping && swapFrom && swapTo && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 16, padding: 16, border: "1px solid var(--border)", marginBottom: 12,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{swapFrom}</div>
            <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>FROM</div>
          </div>
          <div style={{ color: "var(--yellow)", fontSize: 20, animation: "arrowPulse 1s infinite" }}>→</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{swapTo}</div>
            <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>TO</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
          <span style={{ color: "var(--muted)" }}>PROTECTION</span>
          <span style={{ color: "var(--green)" }}>ACTIVE</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
          <span style={{ color: "var(--muted)" }}>AGENT</span>
          <span style={{ fontSize: 9 }}>0x4640...6396</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
          <span style={{ color: "var(--muted)" }}>CONTRACT</span>
          <span style={{ fontSize: 9 }}>0xaCBF...b81d</span>
        </div>
      </div>
    </div>
  );
}