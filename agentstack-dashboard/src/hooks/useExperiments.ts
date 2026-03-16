import { useState, useEffect, useCallback } from "react";

export interface AgentMetricSummary {
  agent: string;
  mean: number;
  stdDev: number;
  successRate: number;
}

export interface TripleComparison {
  time: { alpha: AgentMetricSummary; beta: AgentMetricSummary; gamma: AgentMetricSummary };
  tokens: { alpha: AgentMetricSummary; beta: AgentMetricSummary; gamma: AgentMetricSummary };
  turns: { alpha: AgentMetricSummary; beta: AgentMetricSummary; gamma: AgentMetricSummary };
  successRates: { alpha: number; beta: number; gamma: number };
  gammaSavingsVsAlpha: { timePct: number; tokensPct: number; turnsPct: number };
  betaOverheadVsAlpha: { timePct: number; tokensPct: number; turnsPct: number };
}

export interface RunResult {
  id: string;
  taskId: string;
  agent: "alpha" | "beta" | "gamma";
  seed: number;
  success: boolean;
  metrics: {
    wallClockMs: number;
    totalTokens: number;
    turns: number;
    humanInterventions: number;
    costUsd: number;
  };
  agentStackSearches?: number;
  agentStackPulls?: number;
  pulledSolutionIds?: string[];
  postedSolutionIds?: string[];
}

export interface TaskResult {
  taskId: string;
  taskName: string;
  difficulty: string;
  alpha: RunResult[];
  beta: RunResult[];
  gamma: RunResult[];
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

export function useExperiments() {
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExperiments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/experiments");
      setExperiments(await res.json());
    } catch { setExperiments([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchExperiments(); }, [fetchExperiments]);
  return { experiments, loading, refetch: fetchExperiments };
}

export function useExperimentDetail(id: string | null) {
  const [experiment, setExperiment] = useState<ExperimentSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) { setExperiment(null); return; }
    setLoading(true);
    fetch(`/api/experiments/${id}`)
      .then((r) => r.json())
      .then((data) => { setExperiment(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  return { experiment, loading };
}
