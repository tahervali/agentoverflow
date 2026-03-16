// ─── Experiment Framework Types ───
// 3-agent A/B/C comparison modeled after SWE-bench / GAIA methodology
//
// Agent Alpha  — Baseline: no AgentStack, builds from scratch
// Agent Beta   — Cold Start: has AgentStack, empty registry, builds + POSTs
// Agent Gamma  — Warm Cache: has AgentStack, populated registry, searches + PULLs

export interface Task {
  id: string;
  name: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  language: string;
  tags: string[];
  verification: {
    type: "output_contains" | "file_exists" | "code_runs" | "manual";
    criteria: string;
  };
  expectedTurns?: number;
}

export interface ExperimentConfig {
  id: string;
  name: string;
  description: string;
  tasks: string[];
  seeds: number[];
  model: string;
  maxTurns: number;
  timeoutMs: number;
  createdAt: string;
}

// The 3 agents
export type AgentName = "alpha" | "beta" | "gamma";

export const AGENT_LABELS: Record<AgentName, { name: string; description: string; color: string }> = {
  alpha: {
    name: "Agent Alpha",
    description: "Baseline — no AgentStack, builds from scratch",
    color: "gray",
  },
  beta: {
    name: "Agent Beta",
    description: "Cold Start — empty registry, builds + POSTs solutions",
    color: "cyan",
  },
  gamma: {
    name: "Agent Gamma",
    description: "Warm Cache — populated registry, searches + PULLs solutions",
    color: "orange",
  },
};

export interface RunMetrics {
  wallClockMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turns: number;
  humanInterventions: number;
  costUsd: number;
}

export interface RunResult {
  id: string;
  experimentId: string;
  taskId: string;
  agent: AgentName;
  seed: number;
  runIndex: number;

  success: boolean;
  failureReason?: string;
  errorLog: string[];
  metrics: RunMetrics;

  model: string;
  systemPromptHash: string;
  startedAt: string;
  completedAt: string;

  // AgentStack interaction (beta and gamma only)
  agentStackSearches?: number;
  agentStackPulls?: number;
  agentStackHits?: number;
  // Which solution IDs were pulled (for traceability)
  pulledSolutionIds?: string[];
  // Which solution IDs were posted (for traceability)
  postedSolutionIds?: string[];
}

export interface TaskResult {
  taskId: string;
  taskName: string;
  difficulty: string;

  alpha: RunResult[];  // Baseline runs
  beta: RunResult[];   // Cold start runs
  gamma: RunResult[];  // Warm cache runs
}

export interface AgentMetricSummary {
  agent: AgentName;
  mean: number;
  stdDev: number;
  successRate: number;
}

export interface TripleComparison {
  time: { alpha: AgentMetricSummary; beta: AgentMetricSummary; gamma: AgentMetricSummary };
  tokens: { alpha: AgentMetricSummary; beta: AgentMetricSummary; gamma: AgentMetricSummary };
  turns: { alpha: AgentMetricSummary; beta: AgentMetricSummary; gamma: AgentMetricSummary };
  successRates: { alpha: number; beta: number; gamma: number };
  // Gamma vs Alpha savings (the headline number)
  gammaSavingsVsAlpha: {
    timePct: number;
    tokensPct: number;
    turnsPct: number;
  };
  // Beta overhead vs Alpha (cost of cold start)
  betaOverheadVsAlpha: {
    timePct: number;
    tokensPct: number;
    turnsPct: number;
  };
}

export interface ExperimentSummary {
  experimentId: string;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;

  totalTasks: number;
  completedTasks: number;
  totalRuns: number;
  completedRuns: number;

  results?: {
    tasks: TaskResult[];
    overall: TripleComparison;
  };
}
