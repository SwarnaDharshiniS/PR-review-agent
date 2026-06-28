import { useState, useEffect } from "react";
import { LemmaClient } from "lemma-sdk";
import { useConversationMessages } from "lemma-sdk/react";
import ReviewPanel from "./components/ReviewPanel";
import HistoryPanel from "./components/HistoryPanel";

const client = new LemmaClient({
  apiUrl: import.meta.env.VITE_LEMMA_API_URL,
  authUrl: import.meta.env.VITE_LEMMA_AUTH_URL,
  podId: import.meta.env.VITE_LEMMA_POD_ID,
});

export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [prUrl, setPrUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [status, setStatus] = useState("idle"); // idle | fetching | reviewing | done | error
  const [review, setReview] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("review"); // review | history

  const conversation = useConversationMessages({
    client,
    agentName: "pr_review_agent",
    autoResume: true,
  });

  useEffect(() => {
    client.initialize().then(() => setInitialized(true));
  }, []);

  async function handleSubmit() {
    if (!prUrl.trim()) return;
    setStatus("fetching");
    setError("");
    setReview(null);

    try {
      // Step 1: Fetch diff via Lemma function
      setStatus("fetching");
      const diffResult = await client.functions.run("fetch_pr_diff", {
        pr_url: prUrl,
        github_token: githubToken || undefined,
      });

      // Step 2: Create conversation and send to agent
      setStatus("reviewing");
      await conversation.createConversation({
        title: `Review: ${diffResult.pr_title || prUrl}`,
        instructions: "Return a structured JSON code review. Do not include markdown fences.",
        metadata: { pr_url: prUrl },
        type: "TASK",
        setActive: true,
      });

      await conversation.sendMessage(
        JSON.stringify({
          pr_url: prUrl,
          pr_title: diffResult.pr_title,
          pr_description: diffResult.pr_description,
          author: diffResult.author,
          base_branch: diffResult.base_branch,
          diff: diffResult.diff,
        }),
        { conversationId: conversation.conversationId, metadata: { pr_url: prUrl } }
      );
    } catch (e) {
      setStatus("error");
      setError(e.message || "Something went wrong.");
    }
  }

  // Watch for final output from the agent conversation
  useEffect(() => {
    const msgs = conversation.messages || [];
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant" && last?.content) {
      try {
        const parsed = JSON.parse(last.content);
        setReview(parsed);
        setStatus("done");
        // Persist to Lemma table
        client.functions.run("save_pr_review", {
          pr_url: prUrl,
          pr_title: parsed.pr_title || "",
          author: parsed.author || "",
          review_json: JSON.stringify(parsed),
        }).catch(() => {});
      } catch {
        // Still streaming or non-JSON chunk
      }
    }
  }, [conversation.messages]);

  if (!initialized) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Connecting to Lemma…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">⬡</span>
            <span className="logo-name">ReviewBot</span>
            <span className="logo-badge">PR Agent</span>
          </div>
          <nav className="tabs">
            <button
              className={`tab ${activeTab === "review" ? "active" : ""}`}
              onClick={() => setActiveTab("review")}
            >
              Review
            </button>
            <button
              className={`tab ${activeTab === "history" ? "active" : ""}`}
              onClick={() => setActiveTab("history")}
            >
              History
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        {activeTab === "review" && (
          <div className="review-tab">
            <div className="input-card">
              <h1 className="headline">
                Ship better code,<br />
                <em>faster.</em>
              </h1>
              <p className="subhead">
                Paste a GitHub PR link. Get a structured review in seconds — bugs, security, style, and a verdict.
              </p>

              <div className="input-group">
                <label className="label">Pull Request URL</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://github.com/owner/repo/pull/42"
                  value={prUrl}
                  onChange={(e) => setPrUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  disabled={status === "fetching" || status === "reviewing"}
                />
              </div>

              <details className="token-details">
                <summary>Private repo? Add a GitHub token</summary>
                <div className="input-group" style={{ marginTop: "0.75rem" }}>
                  <label className="label">GitHub Personal Access Token</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="ghp_..."
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                  />
                  <p className="hint">Token only needs <code>repo:read</code> scope. Never stored.</p>
                </div>
              </details>

              <button
                className={`submit-btn ${status === "fetching" || status === "reviewing" ? "loading" : ""}`}
                onClick={handleSubmit}
                disabled={!prUrl.trim() || status === "fetching" || status === "reviewing"}
              >
                {status === "fetching" && "Fetching diff…"}
                {status === "reviewing" && "Reviewing…"}
                {(status === "idle" || status === "done" || status === "error") && "Review this PR →"}
              </button>

              {status === "error" && (
                <div className="error-banner">
                  <strong>Error:</strong> {error}
                </div>
              )}
            </div>

            {(status === "reviewing" || status === "done") && (
              <ReviewPanel review={review} status={status} prUrl={prUrl} />
            )}
          </div>
        )}

        {activeTab === "history" && (
          <HistoryPanel client={client} onSelect={(r) => {
            setReview(r);
            setStatus("done");
            setActiveTab("review");
          }} />
        )}
      </main>
    </div>
  );
}
