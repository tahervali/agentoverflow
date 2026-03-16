#!/usr/bin/env tsx
// ─── 3-Agent Simulator (no API calls) ───

import { randomUUID } from "crypto";
import { TASK_BANK, getTaskById } from "./tasks.js";
import { saveExperiment, saveRun, updateExperimentStatus } from "./db.js";
import type { ExperimentConfig, RunResult, AgentName, Task } from "./types.js";

const PROFILES = {
  easy:   { alpha: { t: 4, tok: 8000, ms: 25000 }, beta: { t: 5, tok: 9500, ms: 30000 }, gamma: { t: 2.5, tok: 4500, ms: 14000 }, failA: 0.05, failB: 0.05, failG: 0.02 },
  medium: { alpha: { t: 8, tok: 18000, ms: 55000 }, beta: { t: 9, tok: 20000, ms: 60000 }, gamma: { t: 4, tok: 9000, ms: 28000 }, failA: 0.15, failB: 0.12, failG: 0.08 },
  hard:   { alpha: { t: 15, tok: 35000, ms: 120000 }, beta: { t: 16, tok: 38000, ms: 130000 }, gamma: { t: 7, tok: 16000, ms: 55000 }, failA: 0.25, failB: 0.20, failG: 0.10 },
};

function mulberry32(seed: number) {
  return () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function norm(rng: () => number, mean: number, std: number) { return Math.max(0, mean + Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng()) * std); }

function simRun(task: Task, agent: AgentName, seed: number, idx: number, expId: string): RunResult {
  const p = PROFILES[task.difficulty];
  const rng = mulberry32(seed * 1000 + idx * 100 + (agent === "alpha" ? 0 : agent === "beta" ? 1 : 2));
  const prof = agent === "alpha" ? p.alpha : agent === "beta" ? p.beta : p.gamma;
  const failRate = agent === "alpha" ? p.failA : agent === "beta" ? p.failB : p.failG;
  const success = rng() > failRate;
  const turns = Math.max(1, Math.round(norm(rng, prof.t, prof.t * 0.3)));
  const totalTokens = Math.max(500, Math.round(norm(rng, prof.tok, prof.tok * 0.25)));
  const wallClockMs = Math.max(2000, Math.round(norm(rng, prof.ms, prof.ms * 0.25)));
  const inputTokens = Math.round(totalTokens * 0.6);
  const outputTokens = totalTokens - inputTokens;
  const costUsd = inputTokens * 3e-6 + outputTokens * 15e-6;

  let searches = 0, pulls = 0;
  if (agent === "beta") { searches = Math.ceil(rng() * 2); }
  if (agent === "gamma") { searches = Math.ceil(rng() * 2); pulls = rng() < 0.8 ? Math.ceil(rng() * 2) : 0; }

  return {
    id: randomUUID(), experimentId: expId, taskId: task.id, agent, seed, runIndex: idx,
    success, failureReason: success ? undefined : "error", errorLog: success ? [] : ["Simulated failure"],
    metrics: { wallClockMs, totalTokens, inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, turns, humanInterventions: 0, costUsd },
    model: "claude-sonnet-4-6", systemPromptHash: "sim",
    startedAt: new Date(Date.now() - wallClockMs).toISOString(), completedAt: new Date().toISOString(),
    agentStackSearches: searches, agentStackPulls: pulls, agentStackHits: pulls,
  };
}

function main() {
  const tasks = TASK_BANK;
  const seeds = [42, 123, 456, 789];

  const config: ExperimentConfig = {
    id: randomUUID(), name: `simulated-${new Date().toISOString().split("T")[0]}`,
    description: `Simulated 3-agent: Alpha vs Beta vs Gamma — ${tasks.length} tasks × ${seeds.length} seeds`,
    tasks: tasks.map((t) => t.id), seeds, model: "claude-sonnet-4-6", maxTurns: 25, timeoutMs: 300000,
    createdAt: new Date().toISOString(),
  };

  console.log(`\n  Simulating ${tasks.length * seeds.length * 3} runs...`);
  saveExperiment(config, "running");

  for (const task of tasks) {
    for (let i = 0; i < seeds.length; i++) {
      for (const agent of ["alpha", "beta", "gamma"] as AgentName[]) {
        saveRun(simRun(task, agent, seeds[i], i, config.id));
      }
    }
  }

  updateExperimentStatus(config.id, "completed", new Date().toISOString());
  console.log(`  Done. ID: ${config.id}\n`);
}

main();
