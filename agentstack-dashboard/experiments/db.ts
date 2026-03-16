// ─── Experiment Results Database ───

import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import type { ExperimentConfig, RunResult, ExperimentSummary, TaskResult, AgentName } from "./types.js";
import { computeTripleComparison } from "./stats.js";
import { getTaskById } from "./tasks.js";

const DB_DIR = path.join(os.homedir(), ".agentstack");
const DB_PATH = path.join(DB_DIR, "experiments.db");

let db: Database.Database | null = null;
let dbInode: number | null = null;

export function getExperimentsDb(): Database.Database {
  // Detect if DB was deleted and recreated (by --clean)
  if (db && fs.existsSync(DB_PATH)) {
    const stat = fs.statSync(DB_PATH);
    if (dbInode !== null && stat.ino !== dbInode) {
      try { db.close(); } catch {}
      db = null;
    }
  } else if (db && !fs.existsSync(DB_PATH)) {
    try { db.close(); } catch {}
    db = null;
  }

  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  dbInode = fs.statSync(DB_PATH).ino;
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      config TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      seed INTEGER NOT NULL,
      run_index INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      failure_reason TEXT,
      error_log TEXT NOT NULL DEFAULT '[]',
      metrics TEXT NOT NULL,
      model TEXT NOT NULL,
      system_prompt_hash TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      agentstack_searches INTEGER DEFAULT 0,
      agentstack_pulls INTEGER DEFAULT 0,
      agentstack_hits INTEGER DEFAULT 0,
      pulled_solution_ids TEXT DEFAULT '[]',
      posted_solution_ids TEXT DEFAULT '[]',
      FOREIGN KEY (experiment_id) REFERENCES experiments(id)
    );

    CREATE INDEX IF NOT EXISTS idx_runs_experiment ON runs(experiment_id);
    CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(experiment_id, task_id);
    CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs(experiment_id, agent);
  `);

  return db;
}

// ─── Write ───

export function saveExperiment(config: ExperimentConfig, status = "pending"): void {
  const db = getExperimentsDb();
  db.prepare(`
    INSERT OR REPLACE INTO experiments (id, name, description, config, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(config.id, config.name, config.description, JSON.stringify(config), status, config.createdAt);
}

export function updateExperimentStatus(id: string, status: string, completedAt?: string): void {
  const db = getExperimentsDb();
  if (completedAt) {
    db.prepare("UPDATE experiments SET status = ?, completed_at = ? WHERE id = ?").run(status, completedAt, id);
  } else {
    db.prepare("UPDATE experiments SET status = ? WHERE id = ?").run(status, id);
  }
}

export function saveRun(run: RunResult): void {
  const db = getExperimentsDb();
  db.prepare(`
    INSERT OR REPLACE INTO runs (
      id, experiment_id, task_id, agent, seed, run_index,
      success, failure_reason, error_log, metrics, model,
      system_prompt_hash, started_at, completed_at,
      agentstack_searches, agentstack_pulls, agentstack_hits,
      pulled_solution_ids, posted_solution_ids
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id, run.experimentId, run.taskId, run.agent, run.seed, run.runIndex,
    run.success ? 1 : 0, run.failureReason || null, JSON.stringify(run.errorLog),
    JSON.stringify(run.metrics), run.model, run.systemPromptHash,
    run.startedAt, run.completedAt,
    run.agentStackSearches || 0, run.agentStackPulls || 0, run.agentStackHits || 0,
    JSON.stringify(run.pulledSolutionIds || []),
    JSON.stringify(run.postedSolutionIds || [])
  );
}

// ─── Read ───

export function listExperiments(): ExperimentSummary[] {
  const db = getExperimentsDb();
  const experiments = db.prepare("SELECT * FROM experiments ORDER BY created_at DESC").all() as any[];

  return experiments.map((exp) => {
    const config: ExperimentConfig = JSON.parse(exp.config);
    const runs = db.prepare("SELECT * FROM runs WHERE experiment_id = ?").all(exp.id) as any[];
    const totalRuns = config.tasks.length * config.seeds.length * 3; // 3 agents

    const summary: ExperimentSummary = {
      experimentId: exp.id,
      name: exp.name,
      description: exp.description,
      status: exp.status,
      createdAt: exp.created_at,
      completedAt: exp.completed_at,
      totalTasks: config.tasks.length,
      completedTasks: new Set(runs.map((r: any) => r.task_id)).size,
      totalRuns,
      completedRuns: runs.length,
    };

    if (runs.length > 0) {
      summary.results = buildResults(config, runs);
    }

    return summary;
  });
}

export function getExperiment(id: string): ExperimentSummary | null {
  const db = getExperimentsDb();
  const exp = db.prepare("SELECT * FROM experiments WHERE id = ?").get(id) as any;
  if (!exp) return null;

  const config: ExperimentConfig = JSON.parse(exp.config);
  const runs = db.prepare("SELECT * FROM runs WHERE experiment_id = ?").all(id) as any[];
  const totalRuns = config.tasks.length * config.seeds.length * 3;

  const summary: ExperimentSummary = {
    experimentId: exp.id,
    name: exp.name,
    description: exp.description,
    status: exp.status,
    createdAt: exp.created_at,
    completedAt: exp.completed_at,
    totalTasks: config.tasks.length,
    completedTasks: new Set(runs.map((r: any) => r.task_id)).size,
    totalRuns,
    completedRuns: runs.length,
  };

  if (runs.length > 0) {
    summary.results = buildResults(config, runs);
  }

  return summary;
}

function buildResults(config: ExperimentConfig, rawRuns: any[]) {
  const runs: RunResult[] = rawRuns.map(parseRun);

  const taskResults: TaskResult[] = config.tasks.map((taskId) => {
    const task = getTaskById(taskId);
    const taskRuns = runs.filter((r) => r.taskId === taskId);

    return {
      taskId,
      taskName: task?.name || taskId,
      difficulty: task?.difficulty || "unknown",
      alpha: taskRuns.filter((r) => r.agent === "alpha"),
      beta: taskRuns.filter((r) => r.agent === "beta"),
      gamma: taskRuns.filter((r) => r.agent === "gamma"),
    };
  });

  const allAlpha = taskResults.flatMap((t) => t.alpha);
  const allBeta = taskResults.flatMap((t) => t.beta);
  const allGamma = taskResults.flatMap((t) => t.gamma);
  const overall = computeTripleComparison(allAlpha, allBeta, allGamma);

  return { tasks: taskResults, overall };
}

function parseRun(raw: any): RunResult {
  return {
    id: raw.id,
    experimentId: raw.experiment_id,
    taskId: raw.task_id,
    agent: raw.agent as AgentName,
    seed: raw.seed,
    runIndex: raw.run_index,
    success: raw.success === 1,
    failureReason: raw.failure_reason || undefined,
    errorLog: JSON.parse(raw.error_log),
    metrics: JSON.parse(raw.metrics),
    model: raw.model,
    systemPromptHash: raw.system_prompt_hash,
    startedAt: raw.started_at,
    completedAt: raw.completed_at,
    agentStackSearches: raw.agentstack_searches,
    agentStackPulls: raw.agentstack_pulls,
    agentStackHits: raw.agentstack_hits,
    pulledSolutionIds: JSON.parse(raw.pulled_solution_ids || "[]"),
    postedSolutionIds: JSON.parse(raw.posted_solution_ids || "[]"),
  };
}
