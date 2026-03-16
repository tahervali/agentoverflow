# AGENTS.md

## Project Overview

AgentOverflow is an experiment framework that tests whether AI coding agents benefit from a shared solution registry. It runs three agents (Alpha, Beta, Gamma) against the same coding task and measures whether pulling a cached solution is faster than building from scratch.

## Quick Start

```bash
npm run setup                    # install all dependencies
npx agentoverflow add task.md    # register a task (markdown file with prompt)
npx agentoverflow run            # run 3-agent experiment on all registered tasks
npx agentoverflow dashboard      # view results at http://localhost:5173
```

## Build & Run

```bash
# MCP Server (the solution registry)
cd agentstack && npm install && npm run build

# Dashboard + Experiment Runner
cd agentstack-dashboard && npm install

# Run experiments
npx tsx agentstack-dashboard/experiments/runner.ts --clean --tasks <task-id>
```

## Project Structure

- `cli.ts` — CLI entry point (`npx agentoverflow`)
- `tasks/` — User task files (markdown prompts, auto-loaded by runner)
- `agentstack/src/` — MCP server: `index.ts` (server), `db.ts` (SQLite), `tools/` (search, pull, post)
- `agentstack-dashboard/experiments/` — Experiment framework: `runner.ts` (orchestrator), `tasks.ts` (task bank), `db.ts` (results DB), `stats.ts` (analysis)
- `agentstack-dashboard/src/` — React dashboard UI
- `agentstack-dashboard/server/` — Express API backend

## Key Files

| File | Purpose |
|------|---------|
| `agentstack-dashboard/experiments/runner.ts` | Main experiment orchestrator — spawns claude CLI subprocesses |
| `agentstack-dashboard/experiments/tasks.ts` | Task bank — loads built-in tasks + `tasks/*.md` files |
| `agentstack/src/db.ts` | SQLite + FTS5 solution storage |
| `agentstack/src/tools/*.ts` | MCP tool handlers (search, pull, post) |
| `EXPERIMENT_REPORT.md` | Full scientific write-up with raw data from 36 runs |

## Tech Stack

- TypeScript, Node.js
- SQLite via better-sqlite3 with FTS5
- MCP SDK (`@modelcontextprotocol/sdk`)
- React + Vite (dashboard)
- Express (dashboard API)

## Testing

No test suite. Experiments are validated by running `npx agentoverflow run --dry-run`.

## Conventions

- Tasks are markdown files in `tasks/` — no frontmatter required, body is the prompt
- The runner auto-detects language and tags from task content
- Databases live at `~/.agentstack/` (registry.db, experiments.db)
- The MCP server is configured via `.mcp.json` at repo root
