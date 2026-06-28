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
POD_ID=<your-pod-id>

# Table (stores review history)
lemma table create --pod-id $POD_ID --payload-file ./payloads/reviews-table.json

# Functions
lemma function create --pod-id $POD_ID --payload-file ./payloads/fetch-pr-diff-function.json
lemma function create --pod-id $POD_ID --payload-file ./payloads/save-review-function.json

# Agent (the core reviewer)
lemma agent create --pod-id $POD_ID --payload-file ./payloads/pr-review-agent.json

# Optional: full workflow (alternative to conversational flow)
lemma workflow create --pod-id $POD_ID --payload-file ./payloads/pr-review-workflow.json
```

### 4. Verify resources

```bash
lemma pod describe $POD_ID
# You should see: pr_reviews table, fetch_pr_diff function, save_pr_review function, pr_review_agent agent

# Smoke-test the agent with a real PR
lemma task create --pod-id $POD_ID --agent-name pr_review_agent \
  --payload '{"input_data": {"diff": "+password = request.GET.get(\"password\")\n+cursor.execute(f\"SELECT * FROM users WHERE password='{password}'\")", "pr_title": "Test PR"}}'

lemma task get <task-id> --pod-id $POD_ID
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

---

## Hackathon submission

**Problem:** Code review is the highest-friction bottleneck in dev workflows. Reviewers miss bugs, skip security checks, and leave vague comments. Junior devs block waiting for senior eyes.

**Solution:** ReviewBot is a focused, agentic tool that brings senior-engineer-level review to any PR in seconds. It's not a chat assistant — it does one job (structured review) and does it well.

**Lemma SDK utilization:**
- `Agent` — judgment-heavy review logic with explicit input/output schema
- `Function` — deterministic GitHub API call with typed output
- `Table` — persistent review history across sessions
- `Workflow` — orchestrated fetch → review → save pipeline
- `Conversation` — streaming agent interaction from the React frontend via `useConversationMessages`

---

## Demo script (for video/judges)

1. Open the app
2. Paste: `https://github.com/facebook/react/pull/31012` (any public PR works)
3. Click "Review this PR →"
4. Show the fetching → reviewing states
5. Walk through: verdict banner → summary → bugs → security → style → praise
6. Click History tab → show the saved row
7. Done — ~45 seconds end to end
