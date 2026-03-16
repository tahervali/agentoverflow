# AgentOverflow

**Do AI coding agents need a shared solution registry? Run this experiment on your own tasks to find out.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-green.svg)](https://modelcontextprotocol.io)
[![Claude CLI](https://img.shields.io/badge/Claude-CLI-orange.svg)](https://docs.anthropic.com/en/docs/claude-cli)

A 3-agent experiment framework that tests whether AI agents perform better when they can reuse solutions from a shared registry — or whether the model's own memory makes external code caches redundant.

```bash
npx agentoverflow add my-task.md   # register your task (just a markdown prompt)
npx agentoverflow run              # run the experiment
# dashboard auto-opens at http://localhost:5173
```

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   "If Agent A builds a working solution and stores it,              │
│    can Agent B skip the build and just pull it?"                    │
│                                                                     │
│    Hypothesis: YES — especially for hard tasks that take            │
│    14-18 turns from scratch, a 5-turn pull saves real time.         │
│                                                                     │
│    Result: IT DEPENDS. The model is already the registry.           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## The Experiment

We pit **three AI agents** against identical coding tasks. Same model, same task, same seeds — the only variable is access to a shared solution registry.

```
                    ┌─────────────────────────┐
                    │      TASK BANK           │
                    │  (same task for all 3)   │
                    └────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │            │  │            │  │            │
     │   ALPHA    │  │    BETA    │  │   GAMMA    │
     │            │  │            │  │            │
     │  Baseline  │  │ Cold Start │  │ Warm Cache │
     │            │  │            │  │            │
     │ No registry│  │ Empty reg. │  │ Full reg.  │
     │ Just build │  │ Build+POST │  │ PULL+adapt │
     │            │  │            │  │            │
     └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
           │               │               │
           ▼               ▼               ▼
        Result           Result          Result
        (turns,          (turns,         (turns,
         time,           time,           time,
         cost)           cost)           cost)
```

### Agent Alpha — The Baseline

No registry access. Receives only the task description. Builds everything from scratch. This is the control group.

### Agent Beta — The Contributor

Has registry tools but starts with an **empty** registry. Builds from scratch like Alpha, then **posts** the solution to the registry. Beta pays the cost of building *and* documenting.

### Agent Gamma — The Consumer

Has a registry **pre-populated by Beta**. Searches for the task, pulls the matching solution, writes it, runs it. If it works, reports success. If it fails, gets one retry with minimal fixes.

```
EXECUTION ORDER (enforces causality):

  Phase 1: Alpha + Beta run in PARALLEL
  ─────────────────────────────────────
  Alpha ──→ builds from scratch
  Beta  ──→ builds from scratch + POSTs to registry
                                        │
  Phase 2: Gamma runs AFTER Beta        │
  ──────────────────────────────────    │
  Gamma ──→ searches ──→ pulls ────────┘
            Beta's solution
```

---

## Our Results (Hard Tasks)

We ran 3 hard tasks × 4 seeds × 3 agents = **36 runs** on `claude-sonnet-4-6`.

### Turns (primary metric — lower is better)

```
DAG Scheduler (expected: 14 turns from scratch)
───────────────────────────────────────────────
Alpha  ████ 4.0                        ← builds in 4 turns (!!)
Beta   █████████ 9.5                   ← builds + posts
Gamma  ████████ 8.3                    ← pulls + runs

Event Sourcing (expected: 16 turns)
───────────────────────────────────────────────
Alpha  ████████████ 12.5               ← high variance (8-22)
Beta   ██████████ 10.0
Gamma  █████████ 9.5                   ← best here

Markdown Compiler (expected: 18 turns)
───────────────────────────────────────────────
Alpha  ████████ 7.8                    ← builds in 8 turns (!!)
Beta   █████████ 9.0
Gamma  ████████ 8.0                    ← roughly equal
```

### Wall Clock Time (seconds)

```
              Alpha       Beta        Gamma
DAG            42.6s       72.1s       52.6s
Event Src     124.4s      117.8s       63.1s  ← Gamma wins big
Markdown      110.1s      125.9s      100.3s
──────────────────────────────────────────────
Overall        92.3s      105.3s       71.9s
```

### Head-to-Head (Gamma vs Alpha, by turns)

```
Alpha wins    ███████ 7/12  (58%)      Alpha < 8 turns → registry overhead kills Gamma
Tie           ██ 2/12      (17%)
Gamma wins    ███ 3/12     (25%)       Only when Alpha takes 11+ turns
```

### Cost

| Agent | Total Cost | Cost/Turn |
|-------|-----------|-----------|
| Alpha | $3.51 | $0.036 |
| Beta  | $2.99 | $0.026 |
| Gamma | $2.29 | $0.022 |

---

## Key Findings

### 1. The Model Is Already the Registry

Tasks we expected to take 14-18 turns were completed by Alpha in **4-8 turns**. Claude Sonnet 4.6 produces near-complete implementations in a single generation for well-known patterns. The model's training data *is* the code library.

### 2. The Registry Has an Irreducible Floor

Gamma's workflow (search → pull → write → run → report) creates a **fixed floor of ~8 turns**. Even when the pulled code works perfectly, Gamma can't beat 7-8 turns:

```
Gamma's turn distribution across all 12 runs:

  7  █
  8  ███████
  9
  10 ████
                               Mean: 8.6  StdDev: 1.0
```

### 3. The Registry Reduces Variance, Not Average Time

Alpha ranges from 4-22 turns. Gamma is always 7-10. If you need **predictability** more than speed, the registry helps. If you need speed, it's overhead.

```
Alpha:  ▁▁████▁▁▁▁█▁▁▁▁▁▁▁▁█    (σ = 4.38)
Gamma:  ▁▁▁▁▁▁█████████▁▁▁▁▁    (σ = 1.00)
        4    8    12   16   20
```

### 4. Break-Even at ~10 Turns

The registry only saves time when the from-scratch build exceeds **~10 turns**. Below that, the registry workflow overhead exceeds the savings.

```
                  ┌───── REGISTRY HELPS ─────┐
                  │                          │
  ◀── OVERHEAD ──►│◀──── SAVINGS ──────────►│
                  │                          │
─────┼─────┼─────┼─────┼─────┼─────┼─────┼──
     4     6     8    10    12    14    16
                  ▲
            break-even
             ~10 turns
```

### 5. Structured Prompting > Registry Infrastructure

Beta (with explicit workflow instructions but an empty registry) sometimes outperformed Alpha. The structured prompt — not the registry — may be the real performance driver.

---

## Test It Yourself

### Prerequisites

- **Node.js 18+** and npm
- **[Claude CLI](https://docs.anthropic.com/en/docs/claude-cli)** installed and logged in

  ```bash
  # Install
  npm install -g @anthropic-ai/claude-code

  # Authenticate (one of these)
  claude login                       # Claude Max/Pro subscription ($20-100/mo)
  export ANTHROPIC_API_KEY=sk-...    # Anthropic API key (pay-per-use)
  ```

  The experiment spawns `claude` subprocesses for each agent run. You need an active session — either a Claude subscription via `claude login`, or an API key set in your environment.

- **Cost estimate**: each run costs ~$0.05-0.70 depending on task complexity. A full experiment (1 task x 4 seeds x 3 agents = 12 runs) typically costs **$1-5**. The `--dry-run` flag previews without spending anything.

### Setup

```bash
git clone https://github.com/tahervali/agentoverflow.git
cd agentoverflow
npx agentoverflow init
```

### Quick Start: Run the Built-In Tasks

The project ships with 9 built-in tasks (3 easy, 3 medium, 3 hard):

```bash
# Preview what will run
npx agentoverflow run --all --dry-run

# Run just the hard tasks (our main experiment — ~30 min, ~$9)
npm run experiment -- --clean --difficulty hard
```

### Test Your Own Tasks

The built-in tasks are common CS problems — the model knows them cold. **The real test is whether the registry helps with *your* tasks.**

#### 1. Write Your Tasks

A task is a **markdown file**. Just write the prompt — what you'd paste into Claude. No special format, no config. Just the instructions.

```markdown
Write a Python client for a REST API at https://billing.internal/api/v2.

Endpoints:
- GET /invoices?customer_id=X&status=pending
- POST /invoices/{id}/pay with body {amount, method, reference}
- GET /customers/{id}/balance

Use httpx with async support. Add retry with exponential backoff
on 429/503. Include type hints with Pydantic models for all
request/response schemas. Write tests using respx to mock the API.
```

The tool auto-detects the language and extracts keywords for registry search.

#### 2. Add Them

```bash
npx agentoverflow add billing-client.md dedup-pipeline.md schema-migrator.md
```

```
  + billing-client          python       Write a Python client for a REST API at...
  + dedup-pipeline           python       Write a PySpark job that reads a CSV with...
  + schema-migrator          sql          Write a dbt macro that handles SCD Type 2...

  3 tasks registered (3 total in registry)

  Next steps:
    npx agentoverflow list        see all registered tasks
    npx agentoverflow run         run the experiment
```

#### 3. Run

```bash
npx agentoverflow run
```

That's it. Runs every task in the registry. The dashboard starts automatically at `http://localhost:5173` — refresh to see results update live as each run completes.

```
  Dashboard: http://localhost:5173
  Results update live — refresh to see progress.

  Seed 42:
    Running Alpha + Beta in parallel...
    Alpha (baseline)   PASS | 38.6s | 2515 tok | 4 turns | $0.067
    Beta  (cold start)  PASS | 96.3s | 6598 tok | 9 turns | $0.191
    Running Gamma (warm cache — using Beta's posted solutions)...
    Gamma (warm cache)  PASS | 45.9s | 3390 tok | 7 turns | $0.120

  Experiment complete!

  Results: http://localhost:5173
```

### How to Interpret Results

| You see... | It means... |
|------------|-------------|
| Alpha < 8 turns | Model already knows this — registry can't help |
| Gamma < Alpha consistently | Registry saves time for your task |
| Gamma >= Alpha | Registry overhead exceeds the savings |
| High Alpha variance (4-22) | Registry adds *consistency* even if not speed |

### CLI Reference

```
npx agentoverflow <command> [options]

Commands:
  add <file.md> [...]    Register tasks (markdown files with your prompt)
  remove <id> [...]      Remove tasks from registry
  list                   Show all registered tasks
  run                    Run experiment on all registered tasks
  run --easy|--hard      Run built-in benchmark tasks
  run --builtins         Run all 9 built-in tasks
  dashboard              Open results in browser
  init                   Install dependencies

Run options:
  --seeds 1,2,3,4        Custom seeds (default: 42,123,456,789)
  --model <model-id>     Claude model (default: claude-sonnet-4-6)
  --no-clean             Keep previous experiment data
  --dry-run              Preview without running
```

---

## When Would a Registry Work?

Based on our findings and [supporting research](EXPERIMENT_REPORT.md#6-threats-to-validity), the registry provides value under narrow conditions:

| Condition | Why |
|-----------|-----|
| **Domain-specific solutions** | Proprietary APIs, internal schemas, org patterns not in training data |
| **Very complex tasks (15+ turns)** | The ~8-turn registry floor represents real savings |
| **Curated, high-quality entries** | Human-reviewed solutions with context, not raw agent output |
| **Weaker models** | Models that struggle more with generation shift the break-even lower |
| **Consistency over speed** | When predictable runtimes matter more than best-case performance |

**Use this framework to test your specific case.** If your tasks are domain-specific and consistently take 15+ turns from scratch, the registry hypothesis may hold for you.

---

## Architecture

```
agentoverflow/
├── cli.ts                         # CLI entry point (npx agentoverflow ...)
├── tasks/                         # YOUR TASKS (just markdown files)
│   └── *.md                       # Each .md file = a task prompt
│
├── agentstack/                    # MCP Server (the solution registry)
│   └── src/
│       ├── index.ts               # Server setup, 3 tools: search, pull, post
│       ├── db.ts                  # SQLite + FTS5 full-text search
│       └── tools/                 # Tool handlers
│
├── agentstack-dashboard/          # Dashboard + Experiment Runner
│   ├── experiments/
│   │   ├── runner.ts              # 3-agent A/B/C orchestrator
│   │   ├── tasks.ts               # Built-in tasks + loads tasks/*.md
│   │   ├── db.ts                  # Experiment results database
│   │   └── stats.ts               # Statistical analysis
│   ├── server/                    # Express API for dashboard
│   └── src/                       # React dashboard UI
│
├── EXPERIMENT_REPORT.md           # Full scientific write-up with raw data
└── .mcp.json                      # MCP server config (auto-loaded by Claude)
```

### How the MCP Server Works

The registry exposes 3 tools via the [Model Context Protocol](https://modelcontextprotocol.io):

| Tool | Input | Output |
|------|-------|--------|
| `search` | `query`, optional `tags` | Top 5 matches (metadata only, no code) |
| `pull` | `id` | Full solution with code |
| `post` | New solution OR `{id, outcome}` | Created/updated confirmation |

Solutions are stored in SQLite at `~/.agentstack/registry.db` with FTS5 full-text search on descriptions and tags.

---

## Methodology Notes

- **Seeded randomness**: Each task-seed pair produces a unique `/tmp/experiment_{agent}_{seed}/` working directory. Seeds don't control model randomness (no temperature seed support), but they isolate filesystem state.
- **Causality enforcement**: Gamma always runs after Beta to ensure the registry is populated.
- **Agent isolation**: Alpha runs from `/tmp` with no `.mcp.json` — it physically cannot access AgentStack tools.
- **Full factorial design**: Every combination of (task × seed × agent) is run. No sampling.
- **n=4 per cell**: Small but sufficient to identify large effects. For publication-quality results, use 8+ seeds.

---

## License

MIT

---

*Built to answer a question. The answer was "not really, but test it yourself."*
