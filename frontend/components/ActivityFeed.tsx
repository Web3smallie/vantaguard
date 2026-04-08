"use client";

export type FeedLog = {
  time: string;
  type: string;
  msg: string;
};

const colors: Record<string, string> = {
  ALERT: "var(--red)",
  ACTION: "var(--blue)",
  TX: "var(--yellow)",
  SUCCESS: "var(--green)",
  SCAN: "var(--muted)",
  INTENT: "var(--purple)",
};

export function ActivityFeed({ logs }: { logs: FeedLog[] }) {
  return (
    <div>
      {logs.length === 0 ? (
        <div style={{ fontSize: 14, color: "var(--dim)", textAlign: "center", padding: 20 }}>
          Connecting to agent...
        </div>
      ) : (
        logs.map((log, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "80px 100px 1fr",
            gap: 16,
            fontSize: 14,
            lineHeight: 2,
            borderBottom: "1px solid #0d0d0d",
            padding: "6px 0",
          }}>
            <span style={{ color: "var(--dim)" }}>{log.time}</span>
            <span style={{ color: colors[log.type] || "var(--muted)", letterSpacing: 1 }}>
              [{log.type}]
            </span>
            <span style={{
              color: log.type === "ALERT" ? "var(--red)" :
                     log.type === "SUCCESS" ? "var(--green)" : "#888"
            }}>
              {log.msg}
            </span>
          </div>
        ))
      )}
      <div style={{ color: "var(--dim)", fontSize: 14, animation: "blink 1s infinite" }}>█</div>
    </div>
  );
}