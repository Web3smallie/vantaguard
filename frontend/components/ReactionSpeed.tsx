"use client";

export function ReactionSpeed({ ms }: { ms: number | null }) {
  const multiplier = ms ? Math.round(45000 / ms) : null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 24 }}>
      <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 4, marginBottom: 20 }}>REACTION SPEED</div>
      {ms ? (
        <>
          <div style={{ fontSize: 64, fontWeight: 900, color: "var(--green)", lineHeight: 1 }}>⚡ {ms}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>milliseconds</div>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 6 }}>
              <span style={{ color: "var(--muted)" }}>HUMAN MULTISIG AVG</span>
              <span style={{ color: "var(--red)" }}>~45,000ms</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
              <span style={{ color: "var(--muted)" }}>VANTAGUARD</span>
              <span style={{ color: "var(--green)" }}>⚡ {ms}ms — {multiplier}x FASTER</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 64, fontWeight: 900, color: "#222", lineHeight: 1 }}>---</div>
          <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 16 }}>WAITING FOR TRIGGER...</div>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 6 }}>
              <span style={{ color: "var(--muted)" }}>HUMAN MULTISIG AVG</span>
              <span style={{ color: "var(--red)" }}>~45,000ms</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
              <span style={{ color: "var(--muted)" }}>VANTAGUARD</span>
              <span style={{ color: "var(--green)" }}>⚡ READY</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}