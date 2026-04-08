"use client";

function getColor(score: number, threshold: number) {
  if (score < threshold) return "var(--red)";
  if (score < 60) return "var(--yellow)";
  return "var(--green)";
}

export function VibeScore({ score, threshold }: { score: number; threshold: number }) {
  const color = getColor(score, threshold);
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 24 }}>
      <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 4, marginBottom: 20 }}>VIBE SCORE</div>
      <div style={{ fontFamily: "monospace", fontSize: 96, fontWeight: 900, color, lineHeight: 1, transition: "color 0.5s" }}>
        {score.toFixed(1)}
      </div>
      <div style={{ fontSize: 9, color: "var(--muted)" }}>/100</div>
      <div style={{ height: 3, background: "#111", marginTop: 16 }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, transition: "all 0.5s" }} />
      </div>
      <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 8, display: "flex", justifyContent: "space-between" }}>
        <span>THRESHOLD: <span style={{ color: "var(--yellow)" }}>{threshold}</span></span>
        <span>STATUS: <span style={{ color }}>{score < threshold ? "THREAT" : score < 60 ? "CAUTION" : "SAFE"}</span></span>
      </div>
    </div>
  );
}