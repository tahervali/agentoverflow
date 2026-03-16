#!/usr/bin/env npx tsx
// ─── AgentOverflow CLI ───
//
// Usage:
//   npx agentoverflow add <task.md> [task2.md ...]  — register tasks
//   npx agentoverflow run                           — run all registered tasks
//   npx agentoverflow list                          — see registered tasks
//   npx agentoverflow dashboard                     — view results
//   npx agentoverflow init                          — setup

import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const TASKS_DIR = path.join(ROOT, "tasks");
const RUNNER = path.join(ROOT, "agentstack-dashboard/experiments/runner.ts");

// ─── Colors ───
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

// ─── Helpers ───

function ensureTasksDir() {
  if (!fs.existsSync(TASKS_DIR)) fs.mkdirSync(TASKS_DIR, { recursive: true });
}

function getTaskFiles(): string[] {
  ensureTasksDir();
  return fs.readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort();
}

function inferLanguage(text: string): string {
  const patterns: [RegExp, string][] = [
    [/\btypescript\b|\b\.ts\b/i, "typescript"],
    [/\bpython\b|\bpyspark\b|\b\.py\b/i, "python"],
    [/\brust\b/i, "rust"],
    [/\bgo\b|\bgolang\b/i, "go"],
    [/\bsql\b|\bdbt\b/i, "sql"],
    [/\bjavascript\b|\bnode\b/i, "javascript"],
  ];
  for (const [re, lang] of patterns) {
    if (re.test(text)) return lang;
  }
  return "python";
}

function parseTaskPreview(filePath: string): { id: string; language: string; lines: number; firstLine: string } {
  const id = path.basename(filePath, ".md");
  const raw = fs.readFileSync(filePath, "utf-8").trim();

  let body = raw;
  const fmMatch = raw.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
  if (fmMatch) body = fmMatch[1].trim();

  const language = inferLanguage(body);
  const lines = body.split("\n").length;
  const firstLine = body.split("\n")[0].slice(0, 60) + (body.split("\n")[0].length > 60 ? "..." : "");

  return { id, language, lines, firstLine };
}

// ─── Commands ───

function cmdAdd(paths: string[]) {
  if (paths.length === 0) {
    console.error(red(`\n  Usage: npx agentoverflow add <task.md> [task2.md ...]\n`));
    process.exit(1);
  }

  ensureTasksDir();

  const added: string[] = [];

  for (const taskPath of paths) {
    const absPath = path.resolve(taskPath);

    if (!fs.existsSync(absPath)) {
      console.error(red(`  File not found: ${absPath}`));
      continue;
    }
    if (!absPath.endsWith(".md")) {
      console.error(red(`  Not a .md file: ${absPath}`));
      continue;
    }

    const filename = path.basename(absPath);
    const destPath = path.join(TASKS_DIR, filename);
    const id = path.basename(filename, ".md");

    fs.copyFileSync(absPath, destPath);

    const p = parseTaskPreview(destPath);
    console.log(`  ${green("+")} ${cyan(id.padEnd(25))} ${p.language.padEnd(12)} ${dim(p.firstLine)}`);
    added.push(id);
  }

  if (added.length === 0) {
    process.exit(1);
  }

  const total = getTaskFiles().length;
  console.log(`
  ${bold(`${added.length} task${added.length > 1 ? "s" : ""} registered`)} (${total} total in registry)

  ${bold("Next steps:")}
    ${cyan("npx agentoverflow list")}        ${dim("see all registered tasks")}
    ${cyan("npx agentoverflow run")}         ${dim("run the experiment")}
`);
}

function cmdRemove(ids: string[]) {
  if (ids.length === 0) {
    console.error(red(`\n  Usage: npx agentoverflow remove <task-id> [task-id ...]\n`));
    process.exit(1);
  }

  for (const id of ids) {
    const taskFile = path.join(TASKS_DIR, `${id}.md`);
    if (fs.existsSync(taskFile)) {
      fs.unlinkSync(taskFile);
      console.log(`  ${red("-")} Removed: ${id}`);
    } else {
      console.error(`  ${dim("Not found:")} ${id}`);
    }
  }

  const total = getTaskFiles().length;
  console.log(`\n  ${total} task${total !== 1 ? "s" : ""} remaining in registry.\n`);
}

function cmdList() {
  const files = getTaskFiles();

  if (files.length === 0) {
    console.log(`
  ${dim("No tasks in registry.")}

  ${bold("Add tasks:")}
    ${cyan("npx agentoverflow add my-task.md")}

  ${dim("A task is just a markdown file — write what you'd paste into Claude.")}
`);
    return;
  }

  console.log(`\n  ${bold("Task Registry")} (${files.length} task${files.length > 1 ? "s" : ""})\n`);

  for (const file of files) {
    const p = parseTaskPreview(path.join(TASKS_DIR, file));
    console.log(`    ${cyan(p.id.padEnd(25))} ${p.language.padEnd(12)} ${dim(p.firstLine)}`);
  }

  console.log(`
  ${bold("Run experiment on all registered tasks:")}
    ${cyan("npx agentoverflow run")}
`);
}

function cmdRun(args: string[]) {
  let clean = true;
  let seeds = "";
  let model = "";
  let dryRun = false;
  let difficulty = "";
  let builtins = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--no-clean") { clean = false; }
    else if (arg === "--dry-run") { dryRun = true; }
    else if (arg === "--easy") { difficulty = "easy"; builtins = true; }
    else if (arg === "--medium") { difficulty = "medium"; builtins = true; }
    else if (arg === "--hard") { difficulty = "hard"; builtins = true; }
    else if (arg === "--builtins") { builtins = true; }
    else if (arg === "--seeds" && args[i + 1]) { seeds = args[++i]; }
    else if (arg === "--model" && args[i + 1]) { model = args[++i]; }
  }

  // Default: run all registered tasks in tasks/
  const files = getTaskFiles();

  if (!builtins && files.length === 0) {
    console.log(`
  ${red("No tasks registered.")} Add some first:

    ${cyan("npx agentoverflow add my-task.md")}

  Or run the built-in benchmark tasks:

    ${cyan("npx agentoverflow run --easy")}      ${dim("3 easy tasks (~5 min, ~$1)")}
    ${cyan("npx agentoverflow run --hard")}      ${dim("3 hard tasks (~30 min, ~$9)")}
    ${cyan("npx agentoverflow run --builtins")}  ${dim("all 9 built-in tasks")}
`);
    process.exit(1);
  }

  // Build runner args
  const runnerArgs: string[] = [];
  if (clean) runnerArgs.push("--clean");
  if (dryRun) runnerArgs.push("--dry-run");

  if (builtins && difficulty) {
    // Run built-in tasks by difficulty
    runnerArgs.push("--difficulty", difficulty);
  } else if (builtins) {
    // Run all built-in tasks (no filter = runner picks up all including built-in)
    // Don't pass --tasks, let runner use full bank
  } else {
    // Run only the user's registered tasks
    const taskIds = files.map((f) => path.basename(f, ".md"));
    runnerArgs.push("--tasks", taskIds.join(","));
  }

  if (seeds) runnerArgs.push("--seeds", seeds);
  if (model) runnerArgs.push("--model", model);

  // Calculate counts for display
  const difficultyCount: Record<string, number> = { easy: 3, medium: 3, hard: 3 };
  let taskCount: number;
  let taskLabel: string;

  if (builtins && difficulty) {
    taskCount = difficultyCount[difficulty] || 3;
    taskLabel = `${difficulty} built-ins (${taskCount})`;
  } else if (builtins) {
    taskCount = 9;
    taskLabel = `all built-ins (${taskCount})`;
  } else {
    taskCount = files.length;
    taskLabel = `${taskCount} registered task${taskCount > 1 ? "s" : ""}`;
  }

  const seedCount = seeds ? seeds.split(",").length : 4;
  const totalRuns = taskCount * seedCount * 3;

  console.log(`
  ${bold("Starting experiment")}

    Tasks:  ${taskLabel}
    Seeds:  ${seedCount} ${dim(`(${seeds || "42, 123, 456, 789"})`)}
    Runs:   ${totalRuns} total ${dim(`(${taskCount} x ${seedCount} seeds x 3 agents)`)}
    Model:  ${model || "claude-sonnet-4-6"}
`);

  // Start dashboard in background before the experiment
  if (!dryRun) {
    const dashboard = spawn("npm", ["run", "dev"], {
      cwd: path.join(ROOT, "agentstack-dashboard"),
      stdio: "ignore",
      detached: true,
      env: { ...process.env },
    });
    dashboard.unref();

    console.log(`  ${bold("Dashboard:")} ${cyan("http://localhost:5173")}
  ${dim("Results update live — refresh to see progress.")}\n`);
  }

  // Spawn runner
  const proc = spawn("npx", ["tsx", RUNNER, ...runnerArgs], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env },
  });

  proc.on("close", (code) => {
    if (code === 0) {
      console.log(`
  ${green("Experiment complete!")}

  ${bold("Results:")} ${cyan("http://localhost:5173")}

  ${bold("What to look for:")}
    Alpha turns < 8?   ${dim("Registry overhead exceeds task complexity")}
    Gamma < Alpha?     ${dim("Registry helped — your task benefits from caching")}
    Gamma >= Alpha?    ${dim("Model builds it faster from scratch")}
`);
    }
    process.exit(code || 0);
  });
}

function cmdDashboard() {
  console.log(`
  ${bold("Starting dashboard...")}
  ${dim("http://localhost:5173")}
`);

  const proc = spawn("npm", ["run", "dev"], {
    cwd: path.join(ROOT, "agentstack-dashboard"),
    stdio: "inherit",
    env: { ...process.env },
  });

  proc.on("error", (err) => {
    console.error(red(`\n  Failed to start dashboard: ${err.message}`));
    console.error(dim("  Run 'npx agentoverflow init' first.\n"));
    process.exit(1);
  });
}

function cmdInit() {
  console.log(`\n  ${bold("Setting up AgentOverflow...")}\n`);

  try {
    const ver = execSync("claude --version", { encoding: "utf-8" }).trim();
    console.log(`  ${green("+")} Claude CLI found ${dim(`(${ver})`)}`);
  } catch {
    console.error(`  ${red("x")} Claude CLI not found\n`);
    console.error(`    Install:  ${cyan("npm install -g @anthropic-ai/claude-code")}`);
    console.error(`    Then:     ${cyan("claude login")} ${dim("(Claude Max/Pro subscription)")}`);
    console.error(`    Or set:   ${cyan("export ANTHROPIC_API_KEY=sk-...")} ${dim("(API key, pay-per-use)")}\n`);
    process.exit(1);
  }

  console.log(`  ${dim("Installing dependencies...")}`);
  execSync("npm run setup", { cwd: ROOT, stdio: "inherit" });
  ensureTasksDir();

  console.log(`
  ${green("Setup complete!")}

  ${bold("Quick start:")}

    1. Write a task ${dim("(just a prompt in a .md file):")}

       ${dim("Write a Python function that parses CSV files")}
       ${dim("and auto-detects column types...")}

    2. ${cyan("npx agentoverflow add my-task.md")}
    3. ${cyan("npx agentoverflow run")}
    4. ${cyan("npx agentoverflow dashboard")}

  ${bold("Or try the built-in benchmarks:")}

    ${cyan("npx agentoverflow run --easy")}
`);
}

function cmdHelp() {
  console.log(`
  ${bold("AgentOverflow")} — Do AI agents need a code reuse registry?

  A controlled experiment: three AI agents attempt the same task.
  One builds from scratch, one caches the solution, one pulls from cache.
  Does the cache help? Run it on your tasks and find out.

  ${bold("Commands:")}

    ${cyan("add")} <task.md> [...]     Register tasks (markdown files with your prompt)
    ${cyan("remove")} <id> [...]       Remove tasks from registry
    ${cyan("list")}                    Show all registered tasks
    ${cyan("run")}                     Run experiment on all registered tasks
    ${cyan("run")} --easy|--hard       Run built-in benchmark tasks
    ${cyan("run")} --builtins          Run all 9 built-in tasks
    ${cyan("dashboard")}               Open results in browser
    ${cyan("init")}                    Install dependencies

  ${bold("Run options:")}

    --seeds 42,123,456       Custom seeds ${dim("(default: 42,123,456,789)")}
    --model claude-opus-4-6  Use a different model
    --no-clean               Keep previous experiment data
    --dry-run                Preview without running

  ${bold("Workflow:")}

    1. Write a .md file with your task prompt
    2. ${cyan("npx agentoverflow add my-task.md")}
    3. ${cyan("npx agentoverflow run")}
    4. ${cyan("npx agentoverflow dashboard")}

  ${bold("The three agents:")}

    ${bold("Alpha")}  builds from scratch ${dim("(baseline)")}
    ${bold("Beta")}   builds + saves to registry ${dim("(cold start)")}
    ${bold("Gamma")}  pulls from registry ${dim("(warm cache)")}

    If Gamma is faster, the registry helps.
    If Alpha is faster, the model already knows it.
`);
}

// ─── Main ───

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "add":
    cmdAdd(args);
    break;
  case "remove":
  case "rm":
    cmdRemove(args);
    break;
  case "run":
    cmdRun(args);
    break;
  case "list":
  case "ls":
    cmdList();
    break;
  case "dashboard":
    cmdDashboard();
    break;
  case "init":
    cmdInit();
    break;
  case "help":
  case "--help":
  case "-h":
    cmdHelp();
    break;
  default:
    if (!cmd) { cmdHelp(); break; }
    console.error(red(`\n  Unknown command: ${cmd}\n`));
    cmdHelp();
    process.exit(1);
}
