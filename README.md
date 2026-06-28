# ReviewBot — PR Review Agent

> Paste a GitHub PR link. Get a structured AI code review in seconds — bugs, security issues, style, performance, and a verdict.

Built for the **Gappy AI Hackathon** on the **Lemma SDK**.

---

## What it does

1. User pastes a GitHub PR URL into the app
2. A Lemma **function** (`fetch_pr_diff`) calls the GitHub API and returns the unified diff + metadata
3. A Lemma **agent** (`pr_review_agent`) reads the diff and produces structured JSON: bugs, security, style, performance issues, and an overall verdict (APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION)
4. The review is saved to a Lemma **table** (`pr_reviews`) and displayed in a dark developer UI
5. The **History** tab lets you browse all past reviews

---

## Stack

- **Lemma SDK** — agent, function, table, workflow, conversation
- **React + Vite** — frontend
- **GitHub API** — diff fetching (public PRs work without a token)
- **Claude** (via Lemma) — the actual review intelligence

---

## Setup

### 1. Install the Lemma CLI

```bash
uv tool install lemma-terminal
lemma auth login
```

### 2. Create a pod

```bash
lemma pod create pr-review-agent --description "AI-powered GitHub PR code reviewer"
lemma pods select pr-review-agent --save-default
lemma pod describe   # copy the pod ID
```

### 3. Provision Lemma resources

Run these in order from the project root:

```bash
Run these in order from the project root:
POD_ID=<your-pod-id>

# Table (stores review history)
lemma table create pr_reviews --file ./payloads/reviews-table.json --pod $POD_ID

# Functions
lemma function create --file ./payloads/fetch-pr-diff-function.json --pod $POD_ID
lemma function create --file ./payloads/save-review-function.json --pod $POD_ID

# Agent (the core reviewer)
lemma agent create --file ./payloads/pr-review-agent.json --pod $POD_ID

# Optional: full workflow (alternative to conversational flow)
lemma workflow create --file ./payloads/pr-review-workflow.json --pod $POD_ID
```

### 4. Verify resources

```bash
lemma pod describe $POD_ID
# You should see: pr_reviews table, fetch_pr_diff function, save_pr_review function, pr_review_agent agent
```

### 5. Configure the frontend

```bash
cp .env.example .env
# Edit .env and fill in your pod ID
# VITE_LEMMA_POD_ID=<your-pod-id>
```

### 6. Run locally

```bash
npm install
npm run dev
# → http://localhost:5173
```

### 7. Deploy to lemma.work

```bash
npm run build
lemma app deploy --pod-id $POD_ID --dir ./dist
# You'll get a lemma.work URL — share this for judging
```

---

## Project structure

```
pr-review-agent/
├── src/
│   ├── App.jsx                  # Main app shell, Lemma client init, tab routing
│   ├── main.jsx                 # React entry point
│   ├── index.css                # Dark developer theme
│   └── components/
│       ├── ReviewPanel.jsx      # Renders structured review output
│       └── HistoryPanel.jsx     # Reads pr_reviews table, lists past reviews
├── payloads/
│   ├── pr-review-agent.json     # Agent: instructions + input schema
│   ├── reviews-table.json       # Table: columns for review storage
│   ├── fetch-pr-diff-function.json   # Function: GitHub API → diff
│   ├── save-review-function.json     # Function: write review to table
│   └── pr-review-workflow.json  # Workflow: chains all steps
├── index.html
├── vite.config.js
├── package.json
└── .env.example
```
