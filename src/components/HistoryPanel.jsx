import { useState, useEffect } from "react";

const VERDICT_ICON = {
  APPROVE: { icon: "✓", color: "#16a34a" },
  REQUEST_CHANGES: { icon: "✗", color: "#dc2626" },
  NEEDS_DISCUSSION: { icon: "⚑", color: "#ca8a04" },
};

export default function HistoryPanel({ client, onSelect }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    client.tables
      .list("pr_reviews", { limit: 50, orderBy: "created_at", order: "desc" })
      .then((res) => setRows(res.rows || []))
      .catch((e) => setError(e.message || "Failed to load history."))
      .finally(() => setLoading(false));
  }, [client]);

  if (loading) {
    return (
      <div className="history-panel">
        <p className="loading-text">Loading review history…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-panel">
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="history-panel empty-history">
        <p>No reviews yet. Submit a PR above to get started.</p>
      </div>
    );
  }

  return (
    <div className="history-panel">
      <h2 className="history-title">Past Reviews</h2>
      <ul className="history-list">
        {rows.map((row) => {
          const v = VERDICT_ICON[row.verdict] || VERDICT_ICON["NEEDS_DISCUSSION"];
          return (
            <li key={row.id} className="history-item" onClick={() => {
              try {
                onSelect(JSON.parse(row.full_review));
              } catch {}
            }}>
              <span className="history-verdict" style={{ color: v.color }}>{v.icon}</span>
              <div className="history-meta">
                <span className="history-pr">{row.pr_url?.replace("https://github.com/", "") || "—"}</span>
                <span className="history-sub">
                  {row.bug_count ?? 0} bugs · {row.security_count ?? 0} security · by {row.author || "unknown"}
                </span>
              </div>
              <span className="history-arrow">→</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
