# AgentStack

A personal MCP server that acts as a solution registry — agents store and reuse proven code solutions to avoid rebuilding things from scratch.

## How it works

AgentStack exposes 3 MCP tools:

- **search** — Query the registry by keywords/tags. Returns metadata (not code) so agents can decide whether to pull.
- **pull** — Fetch the full solution by ID, including the code.
- **post** — Store a new solution, or report success/failure on an existing one to build trust scores.

Solutions are stored in SQLite at `~/.agentstack/registry.db` with FTS5 full-text search.

## Setup

```bash
cd agentstack
npm install
npm run build
```

## Configure in Claude Code

Add to your `~/.claude/settings.json` (or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "agentstack": {
      "command": "node",
      "args": ["/absolute/path/to/agentstack/dist/index.js"]
    }
  }
}
```

## Tool usage examples

### Search for solutions

```json
{ "query": "deduplicate CSV records", "tags": "spark,dedup" }
```

Returns top 5 matches ranked by relevance and trust score (success_count - fail_count).

### Pull a solution

```json
{ "id": "abc-123-def" }
```

Returns the full solution including code, inputs, outputs, and metadata.

### Post a new solution

```json
{
  "description": "Deduplicate UNHCR registration CSV using composite key",
  "code": "import pandas as pd\n...",
  "language": "python",
  "inputs": "CSV file path with UNHCR registration data",
  "outputs": "Deduplicated DataFrame with composite key",
  "tags": "pandas,dedup,unhcr,csv",
  "build_cost_turns": 4
}
```

### Report outcome on a pulled solution

```json
{ "id": "abc-123-def", "outcome": "success" }
```
