// ─── Task Bank ───
// Built-in coding tasks + custom tasks loaded from tasks/*.md files.
//
// Custom tasks are just markdown files — the body IS the prompt.
// No frontmatter required. The tool auto-infers language and tags
// from the content. Optional frontmatter overrides the defaults.
//
// Minimal task file (just a prompt):
//
//   Write a Python function that parses CSV files and detects column types...
//
// With optional overrides:
//
//   ---
//   language: typescript
//   tags: api, client, billing
//   ---
//
//   Write a TypeScript client for...
//

import fs from "fs";
import path from "path";
import type { Task } from "./types.js";

// ─── Auto-detect language from task description ───

function inferLanguage(text: string): string {
  const lower = text.toLowerCase();

  // Check for explicit language mentions
  const patterns: [RegExp, string][] = [
    [/\btypescript\b|\b\.ts\b|\btsx\b/i, "typescript"],
    [/\bpython\b|\b\.py\b|\bpip\b|\bpytest\b|\bpydantic\b/i, "python"],
    [/\brust\b|\bcargo\b|\b\.rs\b/i, "rust"],
    [/\bgo\b|\bgolang\b|\b\.go\b/i, "go"],
    [/\bjava\b(?!script)|\b\.java\b|\bmaven\b|\bgradle\b/i, "java"],
    [/\bruby\b|\b\.rb\b|\bgem\b/i, "ruby"],
    [/\bsql\b|\bpostgres\b|\bmysql\b|\bsqlite\b|\bdbt\b/i, "sql"],
    [/\bjavascript\b|\b\.js\b|\bnode\b|\bnpm\b/i, "javascript"],
    [/\bswift\b|\b\.swift\b/i, "swift"],
    [/\bc\+\+\b|\bcpp\b/i, "cpp"],
    [/\bpyspark\b|\bspark\b/i, "python"],
  ];

  for (const [re, lang] of patterns) {
    if (re.test(text)) return lang;
  }

  return "python"; // default
}

// ─── Extract tags from task description (top keywords) ───

function inferTags(text: string, id: string): string[] {
  // Start with words from the ID
  const idWords = id.split("-").filter((w) => w.length > 2);

  // Extract likely keywords from the description
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "it", "that", "this", "as", "be",
    "are", "was", "were", "been", "have", "has", "had", "do", "does",
    "did", "will", "would", "could", "should", "may", "might", "can",
    "write", "create", "build", "make", "use", "using", "include",
    "function", "class", "method", "should", "must", "each", "all",
    "not", "into", "also", "then", "when", "if", "else", "which",
    "their", "your", "its", "you", "they", "we", "our", "any", "some",
  ]);

  const words = text.toLowerCase().match(/\b[a-z][a-z0-9_]+\b/g) || [];
  const freq = new Map<string, number>();
  for (const w of words) {
    if (w.length > 2 && !stopWords.has(w)) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }

  // Sort by frequency, take top keywords
  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  // Combine ID words + top content words, deduplicate
  const combined = [...new Set([...idWords, ...topWords])];
  return combined.slice(0, 8);
}

// ─── Parse a task .md file ───

function parseTaskFile(filePath: string): Task | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return null;

    // Derive ID from filename (e.g., "spark-dedup.md" → "spark-dedup")
    const id = path.basename(filePath, ".md");

    // Skip template file
    if (id.startsWith("_")) return null;

    let body: string;
    const meta: Record<string, string> = {};

    // Check if file has frontmatter (optional)
    const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (fmMatch) {
      // Has frontmatter — parse it
      for (const line of fmMatch[1].split("\n")) {
        const match = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
        if (match) meta[match[1]] = match[2].trim();
      }
      body = fmMatch[2].trim();
    } else {
      // No frontmatter — entire file is the prompt
      body = raw;
    }

    if (!body) return null;

    // Auto-infer fields from content (frontmatter overrides)
    const language = meta.language || inferLanguage(body);
    const tags = meta.tags
      ? meta.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : inferTags(body, id);

    // Derive a readable name from the ID
    const name = meta.name || id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    return {
      id,
      name,
      description: body,
      difficulty: (meta.difficulty as Task["difficulty"]) || "medium",
      language,
      tags,
      verification: { type: "code_runs", criteria: name },
      expectedTurns: parseInt(meta.expected_turns || "10"),
    };
  } catch {
    return null;
  }
}

// ─── Load all .md files from tasks/ directory ───

function loadMarkdownTasks(): Task[] {
  // Look for tasks/ directory relative to repo root
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const tasksDir = path.join(repoRoot, "tasks");

  if (!fs.existsSync(tasksDir)) return [];

  const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".md"));
  const tasks: Task[] = [];

  for (const file of files) {
    const task = parseTaskFile(path.join(tasksDir, file));
    if (task) tasks.push(task);
  }

  return tasks;
}

// ─── Built-in tasks ───

const BUILTIN_TASKS: Task[] = [
  // ── EASY (< 5 turns expected) ──
  {
    id: "csv-parser",
    name: "CSV Parser with Type Detection",
    description: `Write a Python function called parse_csv that reads a CSV file and automatically detects column types (int, float, date, string). It should return a list of dictionaries with properly typed values. Handle edge cases: empty cells become None, quoted strings with commas, and ISO date formats. Include a main block that demonstrates it on a sample 5-row CSV string.`,
    difficulty: "easy",
    language: "python",
    tags: ["csv", "parsing", "types"],
    verification: {
      type: "code_runs",
      criteria: "Function parse_csv exists, handles type detection, returns list of dicts",
    },
    expectedTurns: 3,
  },
  {
    id: "retry-decorator",
    name: "Retry Decorator with Exponential Backoff",
    description: `Write a Python decorator called retry that retries a function on exception with exponential backoff. Parameters: max_retries (default 3), base_delay (default 1.0), backoff_factor (default 2.0), exceptions (tuple of exception types, default Exception). It should log each retry attempt. Include a test that demonstrates it with a function that fails twice then succeeds.`,
    difficulty: "easy",
    language: "python",
    tags: ["decorator", "retry", "backoff"],
    verification: {
      type: "code_runs",
      criteria: "Decorator retry works with exponential backoff, handles max retries",
    },
    expectedTurns: 3,
  },
  {
    id: "sql-query-builder",
    name: "SQL SELECT Query Builder",
    description: `Write a TypeScript class called QueryBuilder that provides a fluent API for building SQL SELECT queries. Support: select(columns), from(table), where(condition, params), join(table, on), orderBy(column, direction), limit(n), offset(n). The build() method returns { sql: string, params: any[] }. Use parameterized queries (? placeholders) to prevent SQL injection. Include examples.`,
    difficulty: "easy",
    language: "typescript",
    tags: ["sql", "query-builder", "fluent-api"],
    verification: {
      type: "code_runs",
      criteria: "QueryBuilder class with fluent API, parameterized output",
    },
    expectedTurns: 4,
  },

  // ── MEDIUM (5-10 turns expected) ──
  {
    id: "rate-limiter",
    name: "Token Bucket Rate Limiter",
    description: `Write a Python class TokenBucketRateLimiter that implements the token bucket algorithm. Constructor takes: rate (tokens per second), capacity (max burst size). Methods: acquire(tokens=1) -> bool (non-blocking), wait(tokens=1) -> awaitable (async, blocks until tokens available), get_state() -> dict with current_tokens, capacity, rate. Must be thread-safe using threading.Lock. Write a complete async test that shows 10 concurrent requests with rate=5/sec, capacity=10 and prints timestamps to demonstrate rate limiting.`,
    difficulty: "medium",
    language: "python",
    tags: ["rate-limiter", "token-bucket", "concurrency", "async"],
    verification: {
      type: "code_runs",
      criteria: "Rate limiter correctly limits throughput, thread-safe, async wait works",
    },
    expectedTurns: 7,
  },
  {
    id: "json-diff",
    name: "Deep JSON Diff Engine",
    description: `Write a TypeScript function called jsonDiff that computes a structured diff between two JSON objects. It should handle: nested objects, arrays (by index), additions, deletions, modifications, and type changes. Output format: array of { path: string (dot notation), type: 'added' | 'removed' | 'modified' | 'type_changed', oldValue?: any, newValue?: any }. Handle edge cases: null vs undefined, array vs object, circular references (throw). Include comprehensive tests with nested structures.`,
    difficulty: "medium",
    language: "typescript",
    tags: ["json", "diff", "deep-comparison"],
    verification: {
      type: "code_runs",
      criteria: "jsonDiff detects all change types in nested structures",
    },
    expectedTurns: 8,
  },
  {
    id: "log-analyzer",
    name: "Log File Analyzer with Pattern Detection",
    description: `Write a Python script that analyzes server log files (Apache/Nginx common log format). It should: 1) Parse each line extracting IP, timestamp, method, path, status, bytes. 2) Generate a report with: top 10 IPs by request count, requests per hour histogram, status code distribution, top 10 most requested paths, error rate (4xx + 5xx / total). 3) Detect anomalies: IPs with >100 requests/minute (possible DDoS), paths with >50% error rate. Output as formatted text report. Include sample log generation for testing.`,
    difficulty: "medium",
    language: "python",
    tags: ["log-analysis", "parsing", "anomaly-detection"],
    verification: {
      type: "code_runs",
      criteria: "Parses logs, generates report with all sections, detects anomalies",
    },
    expectedTurns: 8,
  },

  // ── HARD (10+ turns expected) ──
  {
    id: "dag-scheduler",
    name: "DAG Task Scheduler with Parallel Execution",
    description: `Write a Python async DAG (Directed Acyclic Graph) task scheduler. Classes: Task(name, func, depends_on=[]), DAG(), Scheduler(max_concurrency). The DAG validates no cycles (topological sort). The Scheduler runs tasks respecting dependencies — tasks with all deps satisfied run in parallel up to max_concurrency. Features: 1) Retry failed tasks (configurable per task), 2) Timeout per task, 3) Real-time status callback (task_name, status, duration), 4) Cancel remaining tasks on critical failure. Write a demo with 8 tasks forming a diamond dependency pattern (A->B,C; B->D; C->D; D->E,F; E->G; F->G; G->H) where each task sleeps random 0.1-0.5s.`,
    difficulty: "hard",
    language: "python",
    tags: ["dag", "scheduler", "async", "concurrency", "graph"],
    verification: {
      type: "code_runs",
      criteria: "DAG validates cycles, scheduler respects deps, parallel execution works, retry and timeout work",
    },
    expectedTurns: 14,
  },
  {
    id: "event-sourcing",
    name: "Event Sourcing System with Snapshots",
    description: `Write a TypeScript event sourcing system for a bank account domain. Components: 1) EventStore class backed by an in-memory append-only log with: append(streamId, events, expectedVersion), read(streamId, fromVersion?). 2) BankAccount aggregate with commands: open(name, initialDeposit), deposit(amount), withdraw(amount), transfer(toAccountId, amount). Events: AccountOpened, MoneyDeposited, MoneyWithdrawn, TransferInitiated, TransferCompleted. 3) Snapshot mechanism: after every 10 events, auto-create a snapshot of current state. Rebuilding from snapshot + remaining events. 4) Projection: build a read model that tracks all account balances and transaction history. 5) Optimistic concurrency: reject writes if expectedVersion doesn't match. Demo: create 2 accounts, do 15 operations, rebuild from snapshots, verify consistency.`,
    difficulty: "hard",
    language: "typescript",
    tags: ["event-sourcing", "cqrs", "snapshots", "domain-driven"],
    verification: {
      type: "code_runs",
      criteria: "Event store, aggregate, snapshots, projections, and concurrency all work correctly",
    },
    expectedTurns: 16,
  },
  {
    id: "markdown-compiler",
    name: "Markdown to HTML Compiler",
    description: `Write a Python markdown-to-HTML compiler from scratch (no libraries). Support: headings (h1-h6), bold (**), italic (*), code blocks (triple backtick with language), inline code (backtick), unordered lists (-, *), ordered lists (1.), links [text](url), images ![alt](src), blockquotes (>), horizontal rules (---), paragraphs, nested lists (2 levels), and escaped characters. The compiler should have: 1) Lexer that tokenizes input, 2) Parser that builds an AST, 3) Renderer that outputs HTML. Include comprehensive tests covering all features and edge cases like nested formatting (**bold *italic* text**).`,
    difficulty: "hard",
    language: "python",
    tags: ["compiler", "markdown", "parser", "lexer", "ast"],
    verification: {
      type: "code_runs",
      criteria: "Lexer, parser, renderer pipeline produces correct HTML for all markdown features",
    },
    expectedTurns: 18,
  },
];

// ─── Merge built-in + markdown tasks (markdown overrides built-in if same ID) ───

export const TASK_BANK: Task[] = (() => {
  const mdTasks = loadMarkdownTasks();
  const mdIds = new Set(mdTasks.map((t) => t.id));
  const builtIn = BUILTIN_TASKS.filter((t) => !mdIds.has(t.id));
  return [...builtIn, ...mdTasks];
})();

export function getTaskById(id: string): Task | undefined {
  return TASK_BANK.find((t) => t.id === id);
}

export function getTasksByDifficulty(difficulty: Task["difficulty"]): Task[] {
  return TASK_BANK.filter((t) => t.difficulty === difficulty);
}
