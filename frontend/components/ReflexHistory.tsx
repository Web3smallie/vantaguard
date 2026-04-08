/// <reference types="react" />
"use client";

type ReflexLog = {
  id: number;
  vibe_score_at_trigger: number;
  reaction_speed_ms: number;
  strategy_mode: number;
  tx_hash: string;
  created_at: string;
};

const MODES = ["AGGRESSIVE", "STABLE", "SAFETY"];

export function ReflexHistory({ logs }: { logs: ReflexLog[] }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 24 }}>
      <div style={{ fontSize: 14, color: "var(--muted)", letterSpacing: 4, marginBottom: 20 }}>
        REFLEX HISTORY
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ color: "var(--muted)", padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "left" }}>TIME</th>
              <th style={{ color: "var(--muted)", padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "left" }}>VIBE</th>
              <th style={{ color: "var(--muted)", padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "left" }}>REACTION</th>
              <th style={{ color: "var(--muted)", padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "left" }}>STRATEGY</th>
              <th style={{ color: "var(--muted)", padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "left" }}>TX</th>
              <th style={{ color: "var(--muted)", padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "left" }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                  No reflex events yet
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid #0d0d0d", color: "#555" }}>
                  {new Date(log.created_at).toLocaleTimeString()}
                </td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid #0d0d0d", color: "var(--red)" }}>
                  {log.vibe_score_at_trigger}
                </td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid #0d0d0d", color: "var(--green)" }}>
                  ⚡ {log.reaction_speed_ms}ms
                </td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid #0d0d0d", color: "#555" }}>
                  {MODES[log.strategy_mode] || "--"}
                </td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid #0d0d0d" }}>
                  {log.tx_hash ? (
                    <a
                      href={"https://explorer.etherlink.com/tx/" + log.tx_hash}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--yellow)", textDecoration: "none" }}
                    >
                      {log.tx_hash.slice(0, 14) + "..."}
                    </a>
                  ) : "--"}
                </td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid #0d0d0d", color: "var(--green)" }}>
                  CONFIRMED
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}