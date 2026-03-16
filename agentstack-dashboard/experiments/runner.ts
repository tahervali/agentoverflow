#!/usr/bin/env tsx
// ─── 3-Agent Experiment Runner ───
//
// Agent Alpha  — Baseline: no AgentStack, builds from scratch
// Agent Beta   — Cold Start: AgentStack available, empty registry → builds + POSTs
// Agent Gamma  — Warm Cache: AgentStack available, registry seeded by Beta → PULLs + adapts
//
// Flow per task:
//   1. Agent Alpha + Agent Beta run in parallel (same seed)
//      - Alpha builds without AgentStack
//      - Beta builds with AgentStack, POSTs solution to registry
//   2. Agent Gamma runs after Beta completes (needs Beta's posted solution)
//      - Gamma searches registry, PULLs Beta's solution, adapts it
//   3. Repeat for each seed
//
// Usage:
//   npx tsx experiments/runner.ts --clean true                      # Clean start, all tasks
//   npx tsx experiments/runner.ts --clean true --tasks csv-parser    # Single task
//   npx tsx experiments/runner.ts --clean true --difficulty easy     # Easy tasks only
//   npx tsx experiments/runner.ts --dry-run true                     # Preview

import { randomUUID } from "crypto";
import { spawn, execSync } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { TASK_BANK, getTaskById } from "./tasks.js";
import { saveExperiment, saveRun, updateExperimentStatus } from "./db.js";
import type { ExperimentConfig, RunResult, AgentName, Task } from "./types.js";

// ─── Config ───

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const MCP_CONFIG_PATH = path.join(REPO_ROOT, ".mcp.json");
// Resolve claude binary path at startup
const CLAUDE_BIN = process.env.CLAUDE_BIN || (() => {
  try { return execSync("which claude", { encoding: "utf-8" }).trim(); } catch { return "claude"; }
})();
const DEFAULT_SEEDS = [42, 123, 456, 789];
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TURNS = 25;
const TIMEOUT_MS = 5 * 60 * 1000;

// ─── CLI Args ───

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  const boolFlags = new Set(["clean", "dry-run"]);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (boolFlags.has(key)) {
        // Boolean flag: peek at next arg — if it's "true"/"false" consume it, otherwise just set true
        if (args[i + 1] === "true" || args[i + 1] === "false") {
          opts[key] = args[i + 1];
          i++;
        } else {
          opts[key] = "true";
        }
      } else {
        opts[key] = args[i + 1] || "true";
        i++;
      }
    }
  }

  let tasks: string[];
  if (opts.tasks) {
    tasks = opts.tasks.split(",").map((t) => t.trim());
  } else if (opts.difficulty) {
    tasks = TASK_BANK.filter((t) => t.difficulty === opts.difficulty).map((t) => t.id);
  } else {
    tasks = TASK_BANK.map((t) => t.id);
  }

  return {
    tasks,
    seeds: opts.seeds ? opts.seeds.split(",").map((s) => parseInt(s.trim())) : DEFAULT_SEEDS,
    model: opts.model || DEFAULT_MODEL,
    name: opts.name || `experiment-${new Date().toISOString().split("T")[0]}`,
    dryRun: opts["dry-run"] === "true",
    clean: opts.clean === "true",
  };
}

// ─── Clean ───

function cleanDatabases() {
  const registryPath = path.join(os.homedir(), ".agentstack", "registry.db");
  const experimentsPath = path.join(os.homedir(), ".agentstack", "experiments.db");

  console.log("\n  [CLEAN] Wiping databases for fresh experiment...");

  for (const dbPath of [registryPath, experimentsPath]) {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      for (const ext of ["-wal", "-shm"]) {
        if (fs.existsSync(dbPath + ext)) fs.unlinkSync(dbPath + ext);
      }
      console.log(`  [CLEAN] Deleted ${path.basename(dbPath)}`);
    }
  }

  const tmpDirs = fs.readdirSync("/tmp").filter((d) => d.startsWith("experiment_"));
  for (const d of tmpDirs) fs.rmSync(path.join("/tmp", d), { recursive: true, force: true });
  if (tmpDirs.length > 0) console.log(`  [CLEAN] Removed ${tmpDirs.length} temp dirs`);

  console.log("  [CLEAN] Done — blank slate.\n");
}

// ─── Agent Execution ───

interface AgentOutput {
  success: boolean;
  output: string;
  turns: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  wallClockMs: number;
  costUsd: number;
  errorLog: string[];
  agentStackSearches: number;
  agentStackPulls: number;
  timedOut: boolean;
}

function buildPrompt(task: Task, agent: AgentName, seed: number): string {
  const base = `You are an autonomous coding agent. Complete the following task independently.
Do NOT ask for clarification — make reasonable assumptions and proceed.
Do NOT explain what you're doing — just write the code.
Write all code to a single file in /tmp/experiment_${agent}_${seed}/.

TASK: ${task.description}

Requirements:
- Write complete, working code
- Include a demonstration/test at the end that proves the code works
- The code must execute without errors`;

  if (agent === "beta") {
    return `${base}

You have access to AgentStack registry tools (search, pull, post).

WORKFLOW — follow these steps IN ORDER:
1. Search the registry for "${task.name}" — it may be empty, that's fine
2. Build the solution from scratch
3. Run and verify the code works
4. IMMEDIATELY after verifying, post your solution to the registry:
   - Use the post tool with: description, code (the full file contents), language "${task.language}", tags "${task.tags.join(",")}", inputs, outputs
   - Do NOT skip this step — a future agent depends on it

CRITICAL: You MUST call the post tool before finishing. Do not stop until you have posted.`;
  }

  if (agent === "gamma") {
    return `You are an autonomous coding agent. You have access to a pre-populated solution registry.

WORKFLOW — follow these steps IN ORDER:
1. Search the registry for "${task.name}" or keywords: ${task.tags.join(", ")}
2. Pull the top matching solution using its ID
3. Write the pulled code AS-IS to /tmp/experiment_${agent}_${seed}/ — do NOT rewrite, refactor, or "adapt" before running
4. Run it
5. If it works → report outcome ONCE via post (solution id + outcome "success"), then STOP immediately
6. If it fails → make MINIMAL fixes only (wrong paths, missing imports, small typos) and retry ONCE
7. After the retry, report final outcome ONCE via post (solution id + outcome "success" or "fail"), then STOP immediately

TASK: ${task.description}

RULES:
- Try the pulled code AS-IS first. No preemptive changes.
- You get ONE retry if it fails. Fix only what the error message tells you. Do not rewrite.
- Do NOT rebuild from scratch. Do NOT enter an extended debugging loop.
- Report outcome exactly once, then stop. No duplicate post calls.
- Total steps should be: search, pull, write, run, (optional: fix + rerun), report. That's it.`;
  }

  // Alpha: no AgentStack instructions
  return base;
}

async function executeAgent(task: Task, agent: AgentName, seed: number, model: string): Promise<AgentOutput> {
  const startTime = performance.now();
  const workDir = `/tmp/experiment_${agent}_${seed}`;
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

  // Alpha runs from a clean dir with NO .mcp.json — ensures no AgentStack contamination
  // Beta/Gamma run from repo root where .mcp.json auto-loads AgentStack
  const cwd = agent === "alpha" ? workDir : REPO_ROOT;

  const prompt = buildPrompt(task, agent, seed);

  const args = [
    "-p", "--output-format", "json",
    "--model", model,
    "--max-turns", String(agent === "beta" ? MAX_TURNS + 10 : agent === "gamma" ? 10 : MAX_TURNS),
    "--permission-mode", "bypassPermissions",
  ];

  // Alpha runs from /tmp (no .mcp.json) — completely isolated, no AgentStack
  // Beta/Gamma run from repo root — .mcp.json auto-loads AgentStack MCP server

  args.push("--", prompt);

  // Debug: log the spawn command
  console.log(`      [${agent}] spawn: ${CLAUDE_BIN} ${args.slice(0, -1).join(" ")} -- "<prompt ${prompt.length} chars>"`);

  return new Promise<AgentOutput>((resolve) => {
    let stdout = "", stderr = "", timedOut = false;

    const proc = spawn(CLAUDE_BIN, args, {
      cwd: cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"],
    });

    const killProc = () => {
      try { proc.kill("SIGTERM"); } catch {}
      // Force kill after 3s if SIGTERM didn't work
      setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 3000);
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      console.log(`      [${agent}] KILLING — exceeded ${TIMEOUT_MS / 1000}s timeout`);
      killProc();
    }, TIMEOUT_MS);

    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => {
      stderr += d;
      // Stream stderr live for debugging
      const line = d.toString().trim();
      if (line) process.stderr.write(`      [${agent} stderr] ${line}\n`);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const wallClockMs = performance.now() - startTime;

      let parsed: any = {};
      try { parsed = JSON.parse(stdout); } catch { parsed = { result: stdout, is_error: true }; }

      let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0;
      if (parsed.modelUsage) {
        for (const m of Object.values(parsed.modelUsage) as any[]) {
          inputTokens += m.inputTokens || 0;
          outputTokens += m.outputTokens || 0;
          cacheReadTokens += m.cacheReadInputTokens || 0;
          cacheWriteTokens += m.cacheCreationInputTokens || 0;
        }
      }

      const fullOutput = JSON.stringify(parsed);
      const agentStackSearches = (fullOutput.match(/mcp__agentstack__search/g) || []).length;
      const agentStackPulls = (fullOutput.match(/mcp__agentstack__pull/g) || []).length;
      // Success: not timed out, exit 0, not an error, and either "success" or hit max turns but produced output
      const success = !timedOut && code === 0 && parsed.is_error !== true &&
        (parsed.subtype === "success" || (parsed.subtype === "error_max_turns" && parsed.result));

      const errorLog: string[] = [];
      if (timedOut) errorLog.push("TIMEOUT");
      if (code !== 0) errorLog.push(`EXIT_CODE: ${code}`);
      if (parsed.subtype === "error_max_turns") errorLog.push(`MAX_TURNS: hit ${MAX_TURNS} turn limit`);
      if (parsed.is_error) errorLog.push(`CLAUDE_ERROR: ${(parsed.result || "unknown").toString().slice(0, 200)}`);
      if (stderr?.trim()) errorLog.push(`STDERR: ${stderr.slice(0, 500)}`);
      if (!success && !stdout.trim()) errorLog.push("NO_OUTPUT");
      if (!success && stdout.trim() && !parsed.type) errorLog.push(`RAW_STDOUT: ${stdout.slice(0, 200)}`);

      resolve({
        success, output: (parsed.result || stdout).slice(0, 5000),
        turns: parsed.num_turns || 1,
        tokens: { input: inputTokens, output: outputTokens, cacheRead: cacheReadTokens, cacheWrite: cacheWriteTokens },
        wallClockMs, costUsd: parsed.total_cost_usd || 0,
        errorLog, agentStackSearches, agentStackPulls, timedOut,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        success: false, output: "", turns: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        wallClockMs: performance.now() - startTime, costUsd: 0,
        errorLog: [`SPAWN_ERROR: ${err.message}`],
        agentStackSearches: 0, agentStackPulls: 0, timedOut: false,
      });
    });
  });
}

function toRunResult(
  output: AgentOutput, experimentId: string, taskId: string,
  agent: AgentName, seed: number, seedIdx: number, model: string
): RunResult {
  return {
    id: randomUUID(),
    experimentId, taskId, agent, seed, runIndex: seedIdx,
    success: output.success,
    failureReason: output.timedOut ? "timeout" : !output.success ? "error" : undefined,
    errorLog: output.errorLog,
    metrics: {
      wallClockMs: output.wallClockMs,
      totalTokens: output.tokens.input + output.tokens.output,
      inputTokens: output.tokens.input,
      outputTokens: output.tokens.output,
      cacheReadTokens: output.tokens.cacheRead,
      cacheWriteTokens: output.tokens.cacheWrite,
      turns: output.turns,
      humanInterventions: 0,
      costUsd: output.costUsd,
    },
    model,
    systemPromptHash: agent,
    startedAt: new Date(Date.now() - output.wallClockMs).toISOString(),
    completedAt: new Date().toISOString(),
    agentStackSearches: output.agentStackSearches,
    agentStackPulls: output.agentStackPulls,
    agentStackHits: output.agentStackPulls,
  };
}

function printRun(label: string, output: AgentOutput) {
  const time = (output.wallClockMs / 1000).toFixed(1);
  const tokens = output.tokens.input + output.tokens.output;
  const status = output.success ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  const registry = output.agentStackSearches > 0
    ? ` | ${output.agentStackSearches}S ${output.agentStackPulls}P`
    : "";
  console.log(`    ${label}  ${status} | ${time}s | ${tokens} tok | ${output.turns} turns | $${output.costUsd.toFixed(3)}${registry}`);
  for (const err of output.errorLog) console.log(`      [err] ${err}`);
}

// ─── Main ───

async function main() {
  const opts = parseArgs();
  if (opts.clean) cleanDatabases();

  const validTasks = opts.tasks.filter((id) => {
    if (!getTaskById(id)) { console.error(`  [WARN] Unknown task: ${id}`); return false; }
    return true;
  });
  if (validTasks.length === 0) { console.error("No valid tasks."); process.exit(1); }

  const totalRuns = validTasks.length * opts.seeds.length * 3;

  const config: ExperimentConfig = {
    id: randomUUID(),
    name: opts.name,
    description: `3-agent A/B/C: Alpha(baseline) vs Beta(cold) vs Gamma(warm) — ${validTasks.length} tasks × ${opts.seeds.length} seeds`,
    tasks: validTasks,
    seeds: opts.seeds,
    model: opts.model,
    maxTurns: MAX_TURNS,
    timeoutMs: TIMEOUT_MS,
    createdAt: new Date().toISOString(),
  };

  console.log("\n╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║              3-AGENT A/B/C EXPERIMENT                            ║");
  console.log("╠═══════════════════════════════════════════════════════════════════╣");
  console.log("║  Agent Alpha  — Baseline (no AgentStack)                         ║");
  console.log("║  Agent Beta   — Cold Start (empty registry → build + POST)       ║");
  console.log("║  Agent Gamma  — Warm Cache (seeded registry → PULL + adapt)      ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝");
  console.log(`  Tasks:       ${validTasks.length} (${validTasks.join(", ")})`);
  console.log(`  Seeds:       [${opts.seeds.join(", ")}]`);
  console.log(`  Total runs:  ${totalRuns} (${validTasks.length} × ${opts.seeds.length} × 3 agents)`);
  console.log(`  Model:       ${opts.model}`);
  console.log(`  Timeout:     ${TIMEOUT_MS / 1000}s per run`);
  console.log(`  Clean:       ${opts.clean ? "YES" : "NO"}`);
  if (!opts.clean) {
    const reg = path.join(os.homedir(), ".agentstack", "registry.db");
    if (fs.existsSync(reg)) console.log(`  ⚠ Registry has existing data. Use --clean true for uncontaminated results.`);
  }
  console.log("");

  if (opts.dryRun) { console.log("  [DRY RUN] Exiting."); process.exit(0); }

  saveExperiment(config, "running");

  let completed = 0;
  let totalCost = 0;

  for (const taskId of validTasks) {
    const task = getTaskById(taskId)!;
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  Task: ${task.name} (${task.difficulty})`);
    console.log(`${"─".repeat(60)}`);

    for (let seedIdx = 0; seedIdx < opts.seeds.length; seedIdx++) {
      const seed = opts.seeds[seedIdx];
      console.log(`\n  Seed ${seed}:`);

      // Step 1: Run Alpha + Beta in parallel
      // Alpha builds from scratch, Beta builds + POSTs to registry
      console.log("    Running Alpha + Beta in parallel...");
      const [alphaOut, betaOut] = await Promise.all([
        executeAgent(task, "alpha", seed, opts.model),
        executeAgent(task, "beta", seed, opts.model),
      ]);

      printRun("Alpha (baseline) ", alphaOut);
      printRun("Beta  (cold start)", betaOut);

      const alphaRun = toRunResult(alphaOut, config.id, taskId, "alpha", seed, seedIdx, opts.model);
      const betaRun = toRunResult(betaOut, config.id, taskId, "beta", seed, seedIdx, opts.model);
      saveRun(alphaRun);
      saveRun(betaRun);

      // Step 2: Run Gamma AFTER Beta (needs Beta's posted solution in registry)
      console.log("    Running Gamma (warm cache — using Beta's posted solutions)...");
      const gammaOut = await executeAgent(task, "gamma", seed, opts.model);
      printRun("Gamma (warm cache)", gammaOut);

      const gammaRun = toRunResult(gammaOut, config.id, taskId, "gamma", seed, seedIdx, opts.model);
      saveRun(gammaRun);

      completed += 3;
      totalCost += alphaOut.costUsd + betaOut.costUsd + gammaOut.costUsd;

      // Show registry interaction summary
      if (gammaOut.agentStackPulls > 0) {
        console.log(`    ✓ Gamma reused ${gammaOut.agentStackPulls} solution(s) from registry`);
      } else if (gammaOut.agentStackSearches > 0) {
        console.log(`    ✗ Gamma searched but found nothing to pull`);
      }

      console.log(`    Progress: ${completed}/${totalRuns} | Cost: $${totalCost.toFixed(3)}`);
    }
  }

  updateExperimentStatus(config.id, "completed", new Date().toISOString());

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  EXPERIMENT COMPLETE`);
  console.log(`  Runs: ${completed} | Cost: $${totalCost.toFixed(3)}`);
  console.log(`  View: http://localhost:5173 → Experiments tab`);
  console.log(`  ID: ${config.id}`);
  console.log(`${"═".repeat(60)}\n`);
}

main().catch((err) => { console.error("Experiment failed:", err); process.exit(1); });
