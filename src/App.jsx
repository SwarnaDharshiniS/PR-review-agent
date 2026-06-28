import { useState, useEffect } from "react";
import { LemmaClient } from "lemma-sdk";
import ReviewPanel from "./components/ReviewPanel";
import HistoryPanel from "./components/HistoryPanel";

function toAbsoluteUrl(value, fallbackPath) {
  const raw = (value || "").trim();
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  const path = raw || fallbackPath;
  if (typeof window !== "undefined" && path.startsWith("/")) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

function resolveAuthUrl(value) {
  const raw = (value || "").trim();
  if (!raw) return "https://auth.lemma.work";
  if (/^https?:\/\//i.test(raw)) return raw;
  // Avoid routing auth redirects through Vite proxy paths.
  if (raw === "/lemma-auth") return "https://auth.lemma.work";
  return toAbsoluteUrl(raw, "https://auth.lemma.work");
}

function getAuthHealthUrl() {
  if (typeof window === "undefined") return "/lemma-auth-health";
  return `${window.location.origin}/lemma-auth-health`;
}

const client = new LemmaClient({
  apiUrl: toAbsoluteUrl(import.meta.env.VITE_LEMMA_API_URL, "/lemma-api"),
  authUrl: resolveAuthUrl(import.meta.env.VITE_LEMMA_AUTH_URL),
  podId: import.meta.env.VITE_LEMMA_POD_ID,
});

let clientInitPromise;
function ensureClientInitialized() {
  if (!clientInitPromise) {
    clientInitPromise = client.initialize();
  }
  return clientInitPromise;
}

function resetClientInitialization() {
  clientInitPromise = undefined;
}

function isUnauthorizedError(err) {
  const message = String(err?.message || "").toLowerCase();
  const status = err?.status ?? err?.response?.status ?? err?.cause?.status;
  return status === 401 || message.includes("unauthorized") || message.includes("unauthenticated") || message.includes("401");
}

function isServiceUnavailableError(err) {
  const message = String(err?.message || "").toLowerCase();
  const status = err?.status ?? err?.response?.status ?? err?.cause?.status;
  return status === 503 || message.includes("503") || message.includes("service unavailable");
}

async function fetchPRData(prUrl, githubToken) {
  const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (!match) throw new Error("Invalid GitHub PR URL");
  const [, owner, repo, number] = match;
  const headers = { "Accept": "application/vnd.github.v3+json" };
  if (githubToken) headers["Authorization"] = `token ${githubToken}`;

  const [metaRes, diffRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
      headers: { ...headers, "Accept": "application/vnd.github.v3.diff" }
    })
  ]);

  if (!metaRes.ok) throw new Error(`GitHub API error: ${metaRes.status} — try adding a token for private repos`);
  const meta = await metaRes.json();
  const diff = await diffRes.text();

  return {
    pr_title: meta.title,
    pr_description: meta.body || "",
    author: meta.user?.login || "",
    base_branch: meta.base?.ref || "main",
    files_changed: meta.changed_files,
    additions: meta.additions,
    deletions: meta.deletions,
    diff,
  };
}

async function runReview(prUrl, prData) {
  await ensureClientInitialized();

  // Create a conversation with the agent
  const thread = await client.conversations.createForAgent("pr_review_agent", {
    title: `Review: ${prData.pr_title || prUrl}`,
    instructions: "Return ONLY valid JSON — no markdown fences.",
    metadata: { pr_url: prUrl },
    type: "TASK",
  });
  await client.conversations.messages.send(thread.id, {
    content: JSON.stringify({
      pr_url: prUrl,
      pr_title: prData.pr_title,
      pr_description: prData.pr_description,
      author: prData.author,
      base_branch: prData.base_branch,
      diff: prData.diff.slice(0, 12000), // keep within context limits
    }),
    metadata: { pr_url: prUrl },
  });

  // Poll for the agent response
    for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const msgs = await client.conversations.messages.list(thread.id);
    console.log("raw msgs:", JSON.stringify(msgs).slice(0, 500));
    const msgList = msgs?.data ?? msgs?.items ?? msgs ?? [];
    const last = [...msgList].reverse().find(m => m.role === "assistant");
    if (last?.content) {
      const text = typeof last.content === "string"
        ? last.content
        : last.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      if (clean.startsWith("{")) return JSON.parse(clean);
    }
  }
  throw new Error("Agent timed out — try again");
}

export default function App() {
  const [prUrl, setPrUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [status, setStatus] = useState("idle");
  const [review, setReview] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("review");
  const [prMeta, setPrMeta] = useState(null);
  const [authState, setAuthState] = useState("loading");
  const [serviceOutage, setServiceOutage] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [lemmaToken, setLemmaToken] = useState("");
  const [tokenAuthEnabled, setTokenAuthEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem("lemma_token"));
  });

  async function refreshAuthHealth({ silent = false } = {}) {
    if (!silent) setCheckingHealth(true);
    try {
      const reachable = await isAuthServiceReachable();
      if (reachable) {
        setServiceOutage(false);
        setError((prev) => (prev && /temporarily unavailable|503/i.test(prev) ? "" : prev));
      } else {
        setServiceOutage(true);
      }
      return reachable;
    } finally {
      if (!silent) setCheckingHealth(false);
    }
  }

  useEffect(() => {
    ensureClientInitialized()
      .then((state) => {
        setAuthState(state?.status || "unauthenticated");
        setTokenAuthEnabled(Boolean(client.auth?.isTokenMode));
      })
      .catch((e) => {
        if (isServiceUnavailableError(e)) {
          setServiceOutage(true);
          setError("Lemma auth service is temporarily unavailable (503). Please try again in a few minutes.");
        }
        setAuthState("unauthenticated");
      });

      void refreshAuthHealth({ silent: true });
  }, []);

  async function applyLemmaToken() {
    const token = lemmaToken.trim();
    if (!token) {
      setError("Enter a Lemma access token first.");
      return;
    }
    try {
      window.localStorage.setItem("lemma_token", token);
      resetClientInitialization();
      const state = await ensureClientInitialized();
      setAuthState(state?.status || "unauthenticated");
      setTokenAuthEnabled(Boolean(client.auth?.isTokenMode));
      if (state?.status === "authenticated") {
        setServiceOutage(false);
        setError("");
      } else {
        setError("Token was applied, but authentication is still not valid.");
      }
    } catch (e) {
      setError(e?.message || "Failed to apply Lemma token.");
    }
  }

  async function clearLemmaToken() {
    window.localStorage.removeItem("lemma_token");
    resetClientInitialization();
    setTokenAuthEnabled(false);
    setAuthState("unauthenticated");
    setError("");
  }

  async function isAuthServiceReachable() {
    try {
      const res = await fetch(getAuthHealthUrl(), {
        method: "GET",
        cache: "no-store",
      });
      return res.status < 500;
    } catch {
      return false;
    }
  }

  async function redirectToSignIn() {
    const reachable = await isAuthServiceReachable();
    if (!reachable) {
      setServiceOutage(true);
      setError("Lemma auth service is temporarily unavailable (503). Use token workaround below and try sign-in later.");
      return false;
    }
    setServiceOutage(false);
    client.auth.redirectToAuth();
    return true;
  }

  async function handleSubmit() {
    if (!prUrl.trim()) return;
    setStatus("fetching");
    setError("");
    setReview(null);
    setPrMeta(null);

    try {
      const initState = await ensureClientInitialized();
      setAuthState(initState?.status || "unauthenticated");
      if (initState?.status !== "authenticated") {
        setStatus("error");
        setError("Unauthorized. Redirecting to sign in...");
        await redirectToSignIn();
        return;
      }
      const prData = await fetchPRData(prUrl, githubToken);
      setPrMeta(prData);
      setStatus("reviewing");
      const result = await runReview(prUrl, prData);
      setReview(result);
      setStatus("done");

      // Save to table
      try {
        await client.tables.insertRecord("pr_reviews", {
          pr_url: prUrl,
          pr_title: prData.pr_title || "",
          author: prData.author || "",
          verdict: result.verdict || "NEEDS_DISCUSSION",
          summary: result.summary || "",
          bug_count: (result.bugs || []).length,
          security_count: (result.security || []).length,
          style_count: (result.style || []).length,
          full_review: JSON.stringify(result),
          status: "COMPLETE",
        });
      } catch (e) {
        console.warn("Could not save to table:", e);
      }
    } catch (e) {
      if (isServiceUnavailableError(e)) {
        setStatus("error");
        setServiceOutage(true);
        setError("Lemma service is temporarily unavailable (503). Please try again shortly.");
        return;
      }
      if (isUnauthorizedError(e)) {
        setStatus("error");
        setAuthState("unauthenticated");
        setError("Unauthorized. Redirecting to sign in...");
        await redirectToSignIn();
        return;
      }
      setStatus("error");
      const raw = e?.message || "Something went wrong.";
      const withHint = /not found/i.test(raw)
        ? `${raw} Check VITE_LEMMA_API_URL / VITE_LEMMA_AUTH_URL and that pod resources (agent/table) exist.`
        : raw;
      setError(withHint);
    }
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
          {authState !== "authenticated" && (
            <button className="tab" onClick={() => { void redirectToSignIn(); }}>Sign in</button>
          )}
          <nav className="tabs">
            <button className={`tab ${activeTab === "review" ? "active" : ""}`} onClick={() => setActiveTab("review")}>Review</button>
            <button className={`tab ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>History</button>
          </nav>
        </div>
      </header>

      <main className="main">
        {activeTab === "review" && (
          <div className="review-tab">
            <div className="input-card">
              <h1 className="headline">Ship better code,<br /><em>faster.</em></h1>
              <p className="subhead">Paste a GitHub PR link. Get a structured review in seconds — bugs, security, style, and a verdict.</p>

              <div className="input-group">
                <label className="label">Pull Request URL</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://github.com/owner/repo/pull/42"
                  value={prUrl}
                  onChange={e => setPrUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  disabled={status === "fetching" || status === "reviewing"}
                />
              </div>

              <details className="token-details">
                <summary>Private repo? Add a GitHub token</summary>
                <div className="input-group" style={{ marginTop: "0.75rem" }}>
                  <label className="label">GitHub Personal Access Token</label>
                  <input className="input" type="password" placeholder="ghp_..." value={githubToken} onChange={e => setGithubToken(e.target.value)} />
                  <p className="hint">Token only needs <code>repo:read</code> scope. Never stored.</p>
                </div>
              </details>

              {prMeta && status !== "idle" && (
                <div className="pr-meta-bar">
                  <span>📄 {prMeta.pr_title}</span>
                  <span className="meta-stats">+{prMeta.additions} −{prMeta.deletions} · {prMeta.files_changed} files</span>
                </div>
              )}

              <button
                className={`submit-btn ${status === "fetching" || status === "reviewing" ? "loading" : ""}`}
                onClick={handleSubmit}
                disabled={!prUrl.trim() || status === "fetching" || status === "reviewing" || (serviceOutage && !tokenAuthEnabled)}
              >
                {status === "fetching" && "Fetching diff…"}
                {status === "reviewing" && "Agent reviewing…"}
                {(status === "idle" || status === "done" || status === "error") && "Review this PR →"}
              </button>

              {status === "error" && <div className="error-banner"><strong>Error:</strong> {error}</div>}

              {serviceOutage && authState !== "authenticated" && (
                <details className="token-details" open>
                  <summary>Auth service is down. Use Lemma access token workaround</summary>
                  <div className="input-group" style={{ marginTop: "0.75rem" }}>
                    <label className="label">Lemma Access Token</label>
                    <input
                      className="input"
                      type="password"
                      placeholder="Paste lemma_token"
                      value={lemmaToken}
                      onChange={e => setLemmaToken(e.target.value)}
                    />
                    <p className="hint">If you have a valid Lemma bearer token, this bypasses auth.lemma.work while it is unavailable.</p>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button className="tab" onClick={applyLemmaToken}>Apply token</button>
                      <button className="tab" onClick={clearLemmaToken}>Clear token</button>
                      <button className="tab" onClick={() => { void refreshAuthHealth(); }} disabled={checkingHealth}>
                        {checkingHealth ? "Checking..." : "Retry connection"}
                      </button>
                    </div>
                  </div>
                </details>
              )}
            </div>

            {(status === "reviewing" || status === "done") && (
              <ReviewPanel review={review} status={status} prUrl={prUrl} />
            )}
          </div>
        )}

        {activeTab === "history" && (
          <HistoryPanel
            client={client}
            onAuthRequired={() => {
              setAuthState("unauthenticated");
              setError("Unauthorized. Redirecting to sign in...");
              void redirectToSignIn();
            }}
            onSelect={r => { setReview(r); setStatus("done"); setActiveTab("review"); }}
          />
        )}
      </main>
    </div>
  );
}
