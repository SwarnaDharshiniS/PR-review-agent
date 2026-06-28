const SEVERITY_COLOR = { HIGH: "#ef4444", MEDIUM: "#f97316", LOW: "#6b7280" };
const VERDICT_CONFIG = {
  APPROVE:            { color: "#16a34a", bg: "#dcfce7", icon: "✓", label: "Approved" },
  REQUEST_CHANGES:    { color: "#dc2626", bg: "#fee2e2", icon: "✗", label: "Changes Requested" },
  NEEDS_DISCUSSION:   { color: "#ca8a04", bg: "#fef9c3", icon: "⚑", label: "Needs Discussion" },
};

function IssueList({ title, icon, items, emptyMsg }) {
  if (!items) return null;
  return (
    <div className="issue-section">
      <h3 className="issue-title">
        <span>{icon}</span> {title}
        <span className="issue-count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="empty-msg">{emptyMsg}</p>
      ) : (
        <ul className="issue-list">
          {items.map((item, i) => (
            <li key={i} className="issue-item">
              <div className="issue-header">
                <span
                  className="severity-badge"
                  style={{ color: SEVERITY_COLOR[item.severity], borderColor: SEVERITY_COLOR[item.severity] }}
                >
                  {item.severity}
                </span>
                {item.line && <code className="issue-line">{item.line}</code>}
              </div>
              <p className="issue-message">{item.message}</p>
              {item.suggestion && (
                <p className="issue-suggestion">💡 {item.suggestion}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ReviewPanel({ review, status, prUrl }) {
  if (status === "reviewing" && !review) {
    return (
      <div className="review-panel loading-panel">
        <div className="skeleton-verdict" />
        <div className="skeleton-text" />
        <div className="skeleton-text short" />
        <p className="skeleton-label">Agent is reading the diff…</p>
      </div>
    );
  }

  if (!review) return null;

  const verdict = VERDICT_CONFIG[review.verdict] || VERDICT_CONFIG["NEEDS_DISCUSSION"];

  return (
    <div className="review-panel">
      {/* Verdict banner */}
      <div className="verdict-banner" style={{ background: verdict.bg, borderColor: verdict.color }}>
        <span className="verdict-icon" style={{ color: verdict.color }}>{verdict.icon}</span>
        <div>
          <div className="verdict-label" style={{ color: verdict.color }}>{verdict.label}</div>
          {prUrl && (
            <a className="verdict-pr-link" href={prUrl} target="_blank" rel="noopener noreferrer">
              {prUrl.replace("https://github.com/", "")}
            </a>
          )}
        </div>
      </div>

      {/* Summary */}
      {review.summary && (
        <div className="summary-card">
          <h3 className="summary-title">Summary</h3>
          <p className="summary-text">{review.summary}</p>
        </div>
      )}

      {/* Stats row */}
      <div className="stats-row">
        {[
          { label: "Bugs",     count: review.bugs?.length     ?? 0, color: "#ef4444" },
          { label: "Security", count: review.security?.length ?? 0, color: "#f97316" },
          { label: "Style",    count: review.style?.length    ?? 0, color: "#6366f1" },
          { label: "Perf",     count: review.performance?.length ?? 0, color: "#0ea5e9" },
        ].map((s) => (
          <div key={s.label} className="stat-chip" style={{ borderColor: s.color }}>
            <span className="stat-count" style={{ color: s.color }}>{s.count}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Issue categories */}
      <IssueList title="Bugs"             icon="🐛" items={review.bugs}        emptyMsg="No bugs found." />
      <IssueList title="Security"         icon="🔒" items={review.security}    emptyMsg="No security issues found." />
      <IssueList title="Style"            icon="✏️" items={review.style}       emptyMsg="Style looks clean." />
      <IssueList title="Performance"      icon="⚡" items={review.performance} emptyMsg="No performance issues found." />

      {/* Praise */}
      {review.praise && review.praise.length > 0 && (
        <div className="praise-section">
          <h3 className="issue-title"><span>🌟</span> What's good</h3>
          <ul className="praise-list">
            {review.praise.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      <div className="review-footer">
        Reviewed by <strong>ReviewBot</strong> · Powered by Lemma + Claude
      </div>
    </div>
  );
}
