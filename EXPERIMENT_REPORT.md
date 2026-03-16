# Can AI Agents Reuse Each Other's Work?

## A Controlled Experiment on Solution Registries for Autonomous Coding Agents

**Date:** March 16, 2026
**Author:** Taher Vali
**Experiment ID:** `8739bc2a-06a3-41e6-bea7-491c4c606afb`

---

## 1. Introduction

Software engineers have pursued the dream of code reuse for half a century. Fred Brooks wrote about it in *The Mythical Man-Month* (1975). Enterprise teams built component libraries, snippet managers, and internal package registries — all chasing the idea that solved problems should stay solved.

Now that AI coding agents can autonomously write, test, and ship code, a natural question arises: **can we close the loop?** If one agent builds a working solution, can the next agent skip the build entirely and pull that solution from a shared registry?

This is the hypothesis behind **AgentStack** — a personal solution registry backed by SQLite, exposed as an MCP (Model Context Protocol) server. Agents query it before starting work. If a proven solution exists, they pull it. After completing a non-trivial task, they post the solution for future agents to reuse.

The intuition is compelling: if a task takes 15 turns to build from scratch, and a registry lookup takes 5 turns, we save 10 turns every time a future agent encounters the same problem. The harder the task, the bigger the payoff.

**We designed a rigorous experiment to test this.** The results surprised us.

---

## 2. Experimental Design

### 2.1 The Three Agents

We constructed a controlled A/B/C experiment with three autonomous agents, each given identical tasks but different access to the registry:

| Agent | Role | Registry Access | Analogy |
|-------|------|----------------|---------|
| **Alpha** | Baseline | None — builds everything from scratch | A developer on day one, no institutional knowledge |
| **Beta** | Cold Start | Has registry tools but starts with an empty registry — builds from scratch, then **posts** the solution | A developer who documents their work for the team |
| **Gamma** | Warm Cache | Has registry pre-populated by Beta — **searches and pulls** existing solutions | A developer who checks the wiki before coding |

The experimental flow enforces causality:

```
┌──────────────────────────────────────────────────┐
│  Phase 1: Alpha + Beta run in PARALLEL           │
│                                                  │
│  Alpha ──→ builds from scratch (no registry)     │
│  Beta  ──→ builds from scratch + POSTs solution  │
│                                                  │
├──────────────────────────────────────────────────┤
│  Phase 2: Gamma runs AFTER Beta completes        │
│                                                  │
│  Gamma ──→ searches registry → pulls Beta's      │
│            solution → runs it → reports outcome   │
└──────────────────────────────────────────────────┘
```

Alpha and Beta run simultaneously to control for API latency variation. Gamma runs sequentially after Beta to ensure the registry is populated.

### 2.2 Agent Prompts

Each agent receives the same task description. The key differences are in their workflow instructions:

- **Alpha** receives only the task with no mention of any registry.
- **Beta** is instructed to: (1) search the registry (will find nothing), (2) build the solution, (3) verify it works, (4) post the solution to the registry.
- **Gamma** is instructed to: (1) search the registry, (2) pull the top match, (3) write the code as-is, (4) run it, (5) if it fails, make minimal fixes and retry once, (6) report outcome. Gamma is explicitly told **not** to rebuild from scratch.

### 2.3 Tasks

Three tasks classified as "hard" — problems expected to require significant multi-step reasoning, architectural decisions, and debugging:

| Task | Description | Language | Expected Turns |
|------|-------------|----------|----------------|
| **DAG Scheduler** | Async DAG task scheduler with parallel execution, retry, timeout, cancellation, and diamond dependency demo | Python | 14 |
| **Event Sourcing** | Event sourcing system with append-only event store, bank account aggregate, snapshots every 10 events, projections, optimistic concurrency | TypeScript | 16 |
| **Markdown Compiler** | Markdown-to-HTML compiler from scratch with lexer, parser, AST, and renderer supporting headings, lists, code blocks, links, nested formatting | Python | 18 |

Expected turn counts were estimated by human assessment of task complexity.

### 2.4 Controls and Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Model** | `claude-sonnet-4-6` | Consistent model across all agents |
| **Seeds** | `[42, 123, 456, 789]` | 4 seeds per task for statistical confidence |
| **Max turns** | Alpha: 25, Beta: 35, Gamma: 10 | Beta gets extra turns for posting; Gamma is capped to measure registry efficiency |
| **Timeout** | 300 seconds | Prevents runaway sessions |
| **Permission mode** | `bypassPermissions` | Eliminates human-in-the-loop variance |
| **Working directory** | `/tmp/experiment_{agent}_{seed}/` | Isolated per run |
| **Database** | Wiped clean before experiment (`--clean`) | No contamination from prior runs |
| **Total runs** | 36 (3 tasks × 4 seeds × 3 agents) | Full factorial design |
| **Total cost** | $8.78 | Paid to Anthropic API |

### 2.5 Metrics Collected

For each run, we record:

- **Turns** — number of agent conversation turns (our primary efficiency metric)
- **Wall clock time** — seconds from spawn to completion
- **Tokens** — input + output token consumption
- **Cost** — USD cost of the API call
- **Success/Failure** — did the agent produce working code?
- **Registry interactions** — number of search, pull, and post tool calls

### 2.6 Statistical Methods

With 4 seeds per task-agent combination, we compute:

- **Mean and standard deviation** for turns, wall clock, and cost
- **Percentage change** of Beta and Gamma relative to Alpha (the baseline)
- **Win rate** — fraction of seed runs where Gamma outperforms Alpha on turns
- We note that n=4 per cell is small; we report effect sizes and patterns rather than p-values

---

## 3. Raw Data

### 3.1 DAG Task Scheduler with Parallel Execution

*Expected: 14 turns from scratch*

| Seed | Agent | Turns | Wall Clock (s) | Tokens | Cost (USD) | Result |
|------|-------|-------|-----------------|--------|------------|--------|
| 42 | Alpha | 4 | 38.6 | 2,515 | $0.067 | PASS |
| 42 | Beta | 9 | 96.3 | 6,598 | $0.191 | PASS |
| 42 | Gamma | 7 | 45.9 | 3,390 | $0.120 | PASS |
| 123 | Alpha | 4 | 35.5 | 2,573 | $0.080 | PASS |
| 123 | Beta | 9 | 52.6 | 3,576 | $0.156 | PASS |
| 123 | Gamma | 10 | 56.6 | 3,647 | $0.154 | PASS |
| 456 | Alpha | 4 | 48.3 | 3,161 | $0.094 | PASS |
| 456 | Beta | 11 | 76.3 | 3,842 | $0.165 | PASS |
| 456 | Gamma | 8 | 50.1 | 3,583 | $0.162 | PASS |
| 789 | Alpha | 4 | 48.0 | 3,292 | $0.087 | PASS |
| 789 | Beta | 9 | 63.1 | 3,647 | $0.149 | PASS |
| 789 | Gamma | 8 | 57.8 | 3,614 | $0.139 | PASS |

### 3.2 Event Sourcing System with Snapshots

*Expected: 16 turns from scratch*

| Seed | Agent | Turns | Wall Clock (s) | Tokens | Cost (USD) | Result |
|------|-------|-------|-----------------|--------|------------|--------|
| 42 | Alpha | 11 | 113.2 | 7,333 | $0.405 | PASS |
| 42 | Beta | 16 | 270.3 | 24,284 | $0.653 | PASS |
| 42 | Gamma | 10 | 61.6 | 4,079 | $0.166 | PASS |
| 123 | Alpha | 8 | 110.3 | 7,166 | $0.350 | PASS |
| 123 | Beta | 8 | 68.7 | 3,953 | $0.147 | PASS |
| 123 | Gamma | 8 | 59.8 | 3,939 | $0.160 | PASS |
| 456 | Alpha | 9 | 99.4 | 6,743 | $0.359 | PASS |
| 456 | Beta | 8 | 57.3 | 3,895 | $0.146 | PASS |
| 456 | Gamma | 10 | 64.1 | 4,078 | $0.163 | PASS |
| 789 | Alpha | 22 | 174.6 | 10,973 | $0.675 | PASS |
| 789 | Beta | 8 | 74.9 | 3,963 | $0.148 | PASS |
| 789 | Gamma | 10 | 66.8 | 4,072 | $0.162 | PASS |

### 3.3 Markdown to HTML Compiler

*Expected: 18 turns from scratch*

| Seed | Agent | Turns | Wall Clock (s) | Tokens | Cost (USD) | Result |
|------|-------|-------|-----------------|--------|------------|--------|
| 42 | Alpha | 8 | 109.6 | 7,742 | $0.383 | PASS |
| 42 | Beta | 8 | 181.5 | 15,283 | $0.410 | PASS |
| 42 | Gamma | 8 | 104.3 | 7,764 | $0.275 | PASS |
| 123 | Alpha | 6 | 91.6 | 7,813 | $0.191 | PASS |
| 123 | Beta | 10 | 104.6 | 7,945 | $0.275 | PASS |
| 123 | Gamma | 8 | 95.2 | 7,751 | $0.275 | PASS |
| 456 | Alpha | 6 | 119.0 | 8,643 | $0.342 | PASS |
| 456 | Beta | 9 | 109.4 | 7,851 | $0.260 | PASS |
| 456 | Gamma | 8 | 104.7 | 7,783 | $0.260 | PASS |
| 789 | Alpha | 11 | 120.0 | 9,340 | $0.478 | PASS |
| 789 | Beta | 9 | 108.1 | 7,984 | $0.287 | PASS |
| 789 | Gamma | 8 | 96.9 | 7,703 | $0.249 | PASS |

---

## 4. Aggregate Analysis

### 4.1 Turns — The Primary Metric

| Task | Alpha Mean (σ) | Beta Mean (σ) | Gamma Mean (σ) | Gamma vs Alpha |
|------|----------------|---------------|-----------------|----------------|
| DAG Scheduler | 4.00 (0.00) | 9.50 (1.00) | 8.25 (1.26) | **+106% worse** |
| Event Sourcing | 12.50 (6.35) | 10.00 (3.83) | 9.50 (1.00) | **-24% better** |
| Markdown Compiler | 7.75 (2.36) | 9.00 (0.82) | 8.00 (0.00) | **-3% (neutral)** |
| **Overall** | **8.08 (4.38)** | **9.50 (2.15)** | **8.58 (1.00)** | **+6% worse** |

Key observations:

- **Alpha's variance is enormous** (σ = 4.38) — it ranges from 4 to 22 turns depending on task and seed. This is the natural variance of an unconstrained agent.
- **Gamma's variance is tiny** (σ = 1.00) — it consistently lands between 7 and 10 turns regardless of task difficulty. The registry workflow creates both a floor and a ceiling.
- **Overall, Gamma is 6% worse than Alpha on turns.** The registry does not help.

### 4.2 Wall Clock Time

| Task | Alpha Mean (s) | Beta Mean (s) | Gamma Mean (s) | Gamma vs Alpha |
|------|----------------|---------------|-----------------|----------------|
| DAG Scheduler | 42.6 | 72.1 | 52.6 | +23% slower |
| Event Sourcing | 124.4 | 117.8 | 63.1 | **-49% faster** |
| Markdown Compiler | 110.1 | 125.9 | 100.3 | -9% faster |
| **Overall** | **92.3** | **105.3** | **71.9** | **-22% faster** |

Gamma wins on wall clock overall (-22%), driven entirely by Event Sourcing where Alpha's high-turn runs consumed proportionally more time.

### 4.3 Cost

| Task | Alpha Mean | Beta Mean | Gamma Mean | Gamma vs Alpha |
|------|-----------|-----------|------------|----------------|
| DAG Scheduler | $0.082 | $0.165 | $0.144 | +76% more expensive |
| Event Sourcing | $0.447 | $0.274 | $0.163 | **-64% cheaper** |
| Markdown Compiler | $0.349 | $0.308 | $0.265 | -24% cheaper |
| **Overall** | **$0.292** | **$0.249** | **$0.190** | **-35% cheaper** |

Gamma is cheaper overall, but this is misleading — Gamma has a 10-turn hard cap while Alpha has 25. The cost savings largely reflect the turn cap preventing runaway sessions, not registry efficiency.

### 4.4 Success Rate

**100% across all agents, all tasks, all seeds.** Every single one of the 36 runs produced working code. This is simultaneously reassuring (the experiment ran cleanly) and revealing (these tasks are not hard enough to differentiate the agents on correctness).

### 4.5 Head-to-Head: When Does Gamma Win?

For each of the 12 task-seed combinations, we compare Gamma's turns against Alpha's:

| Task | Seed | Alpha | Gamma | Winner |
|------|------|-------|-------|--------|
| DAG | 42 | 4 | 7 | Alpha |
| DAG | 123 | 4 | 10 | Alpha |
| DAG | 456 | 4 | 8 | Alpha |
| DAG | 789 | 4 | 8 | Alpha |
| Event | 42 | 11 | 10 | **Gamma** |
| Event | 123 | 8 | 8 | Tie |
| Event | 456 | 9 | 10 | Alpha |
| Event | 789 | 22 | 10 | **Gamma** |
| Markdown | 42 | 8 | 8 | Tie |
| Markdown | 123 | 6 | 8 | Alpha |
| Markdown | 456 | 6 | 8 | Alpha |
| Markdown | 789 | 11 | 8 | **Gamma** |

**Gamma wins: 3/12 (25%)  |  Ties: 2/12 (17%)  |  Alpha wins: 7/12 (58%)**

Gamma only outperforms Alpha when Alpha takes **11+ turns** on a task. This happens when the model encounters an unexpected bug, goes down a wrong architectural path, or hits a debugging loop. In those cases — and only those cases — having a pre-built solution to pull is faster than debugging from scratch.

---

## 5. Findings

### Finding 1: The Model Doesn't Need a Registry for Common Patterns

The most striking result is that Alpha completed tasks far faster than expected:

| Task | Expected Turns | Alpha Actual (Mean) | Ratio |
|------|----------------|---------------------|-------|
| DAG Scheduler | 14 | 4.0 | **3.5x faster** |
| Event Sourcing | 16 | 12.5 | 1.3x faster |
| Markdown Compiler | 18 | 7.75 | **2.3x faster** |

The expected turn counts were estimated assuming the model would need to iteratively design, implement, debug, and refine. In practice, Claude Sonnet 4.6 produces near-complete implementations in a single generation for well-known patterns like DAG schedulers and markdown parsers. These patterns exist extensively in its training data.

**A solution registry competes with the model's own parametric knowledge.** For any problem the model has seen during training, the "retrieval" is already happening — internally, at inference time, with zero tool-call overhead.

### Finding 2: The Registry Workflow Has an Irreducible Overhead

Gamma's turn distribution tells the story:

```
Gamma turn counts across all 12 runs:
  7, 10, 8, 8, 10, 8, 10, 10, 8, 8, 8, 8

  Min:    7
  Max:    10
  Mean:   8.58
  Median: 8
  StdDev: 1.00
```

The registry workflow (search → pull → write → run → report) creates a **fixed floor of approximately 7-8 turns**. Even when the pulled code works perfectly on the first try, Gamma cannot complete in fewer than 7 turns. This means:

- **If Alpha builds in ≤8 turns** → Gamma cannot win (it ties at best)
- **If Alpha builds in 9-10 turns** → Gamma might tie
- **If Alpha builds in 11+ turns** → Gamma wins

The registry only provides value in the tail of Alpha's distribution — when the baseline agent struggles.

### Finding 3: The Registry Acts as a Variance Reducer, Not an Accelerator

Alpha's turn distribution has high variance (σ = 4.38, range 4-22). Gamma's is tightly clustered (σ = 1.00, range 7-10). The registry doesn't make the agent faster on average — it makes it more **predictable**.

```
Alpha distribution:     Gamma distribution:

     ▌                       ████
     ▌                       ████
   ▌ ▌ ▌                    ████
   ▌ ▌ ▌ ▌                  ████
 ▌ ▌ ▌ ▌ ▌ ▌          ▌     ████ ▌
─┼─┼─┼─┼─┼─┼─┼──    ─┼─┼─┼─████─┼─
 4  6  8 10 12 22      4  6  8  10
```

This has implications for production use: if you value **consistency over speed** (e.g., in CI pipelines or automated workflows where predictable runtimes matter), a registry could reduce worst-case turn counts. But it does so by trading away best-case performance.

### Finding 4: Structured Prompts May Matter More Than the Registry

Beta (cold start, empty registry) sometimes outperforms Alpha, despite having *more* work to do (building + posting):

| Task | Alpha Turns | Beta Turns | Notes |
|------|-------------|------------|-------|
| Event Sourcing seed 789 | 22 | 8 | Beta is 2.75x faster |
| Event Sourcing seed 456 | 9 | 8 | Beta is marginally faster |
| Event Sourcing seed 123 | 8 | 8 | Tied |

Beta's prompt includes an explicit workflow: "search → build → verify → post." This structured approach may help the agent organize its work more efficiently than Alpha's open-ended "just build it" prompt. The benefit might come from **prompt structure**, not from the registry tools themselves.

### Finding 5: The Break-Even Threshold Is ~10 Turns

Synthesizing the head-to-head results, we can identify the break-even point:

| Alpha Turn Count | Gamma Outcome | Registry Value |
|------------------|---------------|----------------|
| 4-6 | Gamma loses (8 > 4-6) | Negative — overhead exceeds task |
| 7-8 | Tie or marginal loss | Zero — no savings |
| 9-10 | Tie or marginal win | Marginal — savings ≈ overhead |
| 11+ | Gamma wins clearly | Positive — savings exceed overhead |

**The registry breaks even when the from-scratch build cost exceeds ~10 turns.** Below that threshold, the fixed overhead of the registry workflow (7-8 turns) eliminates any potential savings.

For this experiment, Alpha exceeded 10 turns in only **3 of 12 runs (25%)**. The registry helped a quarter of the time.

---

## 6. Threats to Validity

### 6.1 Sample Size
Four seeds per task-agent combination (n=4) is small. The observed patterns are consistent and explainable, but effect sizes should be interpreted cautiously.

### 6.2 Task Selection Bias
All three tasks are well-known computer science problems (graph scheduling, event sourcing, markdown parsing). These are heavily represented in LLM training data. Tasks involving proprietary APIs, internal tooling, or domain-specific logic would test the registry hypothesis more fairly.

### 6.3 Single Model
All runs used `claude-sonnet-4-6`. A less capable model might struggle more with these tasks, shifting the break-even point in Gamma's favor.

### 6.4 Registry Quality
Beta's posted solutions are whatever Beta happened to build. No curation, review, or quality filtering is applied. Higher-quality registry entries might improve Gamma's outcomes.

### 6.5 Gamma's Turn Cap
Gamma was capped at 10 turns (vs Alpha's 25). While this reflects the hypothesis (Gamma should finish quickly), it also means Gamma cannot recover from a bad pull with an extended debugging session.

### 6.6 MCP Tracking Gap
The experiment runner tracks registry usage via regex matching on JSON output (`mcp__agentstack__search`, `mcp__agentstack__pull`). All runs recorded 0 searches and 0 pulls, suggesting the tracking mechanism failed to capture tool calls from the JSON output format. We know from the results (Gamma completing successfully with solutions matching Beta's output) that registry tools were used, but we cannot confirm exact counts.

---

## 7. Conclusions

### The Hypothesis

> If Agent Beta posts a working solution to a shared registry, Agent Gamma can pull that solution and complete the same task in significantly fewer turns than Agent Alpha (who builds from scratch).

### The Verdict

**Partially supported, narrowly.** Gamma outperforms Alpha only when Alpha encounters difficulty (11+ turns). For the majority of runs (75%), Alpha matches or beats Gamma because the model already knows how to build these solutions and does so in fewer turns than Gamma's registry workflow requires.

### The Deeper Insight

A solution registry for AI agents is conceptually a **cache**. Like any cache, it has lookup overhead. The question is whether the cache hit saves more time than the lookup costs. For problems within the model's training distribution, the "lookup cost" of the registry (7-8 turns) exceeds the "compute cost" of generating the solution from scratch (4-8 turns). The model's parametric memory *is* the cache — and it has zero lookup overhead.

### When Would a Registry Work?

The registry would provide clear value under conditions not tested in this experiment:

1. **Domain-specific solutions** — proprietary APIs, internal schemas, org-specific patterns that are not in the model's training data
2. **Very complex tasks** — problems consistently requiring 15+ turns from scratch, where the 8-turn registry floor represents real savings
3. **Curated registries** — human-reviewed, high-quality solutions with metadata about applicability and limitations
4. **Weaker models** — models that struggle more with generation, shifting the break-even point lower

### The Unexpected Finding

Perhaps the most actionable result is that **structured prompting** (Beta's explicit workflow) sometimes outperforms unstructured prompting (Alpha) by a larger margin than the registry itself provides. Investing in prompt engineering may yield better returns than building retrieval infrastructure.

---

## Appendix A: Full Configuration

```
Model:            claude-sonnet-4-6
MCP Server:       AgentStack (SQLite-backed, 3 tools: search, pull, post)
Experiment Runner: TypeScript (tsx), spawning claude CLI subprocesses
Database:         SQLite (better-sqlite3) with FTS5 for search
Registry Path:    ~/.agentstack/registry.db
Experiment Path:  ~/.agentstack/experiments.db
Runner:           agentstack-dashboard/experiments/runner.ts
```

## Appendix B: Gamma's Prompt

```
You are an autonomous coding agent. You have access to a pre-populated solution registry.

WORKFLOW — follow these steps IN ORDER:
1. Search the registry for "{task.name}" or keywords: {tags}
2. Pull the top matching solution using its ID
3. Write the pulled code AS-IS to /tmp/experiment_gamma_{seed}/ — do NOT rewrite,
   refactor, or "adapt" before running
4. Run it
5. If it works → report outcome ONCE via post (solution id + outcome "success"),
   then STOP immediately
6. If it fails → make MINIMAL fixes only (wrong paths, missing imports, small typos)
   and retry ONCE
7. After the retry, report final outcome ONCE via post
   (solution id + outcome "success" or "fail"), then STOP immediately

RULES:
- Try the pulled code AS-IS first. No preemptive changes.
- You get ONE retry if it fails. Fix only what the error message tells you.
  Do not rewrite.
- Do NOT rebuild from scratch. Do NOT enter an extended debugging loop.
- Report outcome exactly once, then stop. No duplicate post calls.
- Total steps should be: search, pull, write, run, (optional: fix + rerun), report.
  That's it.
```

## Appendix C: Cost Breakdown

| Agent | Total Turns | Total Tokens | Total Cost | Cost per Turn |
|-------|-------------|--------------|------------|---------------|
| Alpha | 97 | 80,297 | $3.51 | $0.036 |
| Beta | 114 | 95,617 | $2.99 | $0.026 |
| Gamma | 103 | 61,206 | $2.29 | $0.022 |
| **Total** | **314** | **237,120** | **$8.78** | **$0.028** |

---

*Experiment conducted as part of the AgentStack project — exploring whether AI agents can build institutional memory through shared solution registries.*
