// ─── Statistical Analysis for 3-Agent Comparison ───

import type { AgentMetricSummary, AgentName, TripleComparison, RunResult } from "./types.js";

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function pctChange(baseline: number, comparison: number): number {
  if (baseline === 0) return 0;
  return ((comparison - baseline) / baseline) * 100;
}

function agentSummary(agent: AgentName, runs: RunResult[], extract: (r: RunResult) => number): AgentMetricSummary {
  const values = runs.map(extract);
  return {
    agent,
    mean: mean(values),
    stdDev: stdDev(values),
    successRate: runs.length > 0 ? runs.filter((r) => r.success).length / runs.length : 0,
  };
}

export function computeTripleComparison(
  alphaRuns: RunResult[],
  betaRuns: RunResult[],
  gammaRuns: RunResult[]
): TripleComparison {
  const timeAlpha = agentSummary("alpha", alphaRuns, (r) => r.metrics.wallClockMs);
  const timeBeta = agentSummary("beta", betaRuns, (r) => r.metrics.wallClockMs);
  const timeGamma = agentSummary("gamma", gammaRuns, (r) => r.metrics.wallClockMs);

  const tokAlpha = agentSummary("alpha", alphaRuns, (r) => r.metrics.totalTokens);
  const tokBeta = agentSummary("beta", betaRuns, (r) => r.metrics.totalTokens);
  const tokGamma = agentSummary("gamma", gammaRuns, (r) => r.metrics.totalTokens);

  const turnAlpha = agentSummary("alpha", alphaRuns, (r) => r.metrics.turns);
  const turnBeta = agentSummary("beta", betaRuns, (r) => r.metrics.turns);
  const turnGamma = agentSummary("gamma", gammaRuns, (r) => r.metrics.turns);

  const alphaSuccessRate = alphaRuns.length > 0 ? alphaRuns.filter((r) => r.success).length / alphaRuns.length : 0;
  const betaSuccessRate = betaRuns.length > 0 ? betaRuns.filter((r) => r.success).length / betaRuns.length : 0;
  const gammaSuccessRate = gammaRuns.length > 0 ? gammaRuns.filter((r) => r.success).length / gammaRuns.length : 0;

  return {
    time: { alpha: timeAlpha, beta: timeBeta, gamma: timeGamma },
    tokens: { alpha: tokAlpha, beta: tokBeta, gamma: tokGamma },
    turns: { alpha: turnAlpha, beta: turnBeta, gamma: turnGamma },
    successRates: { alpha: alphaSuccessRate, beta: betaSuccessRate, gamma: gammaSuccessRate },
    gammaSavingsVsAlpha: {
      timePct: pctChange(timeAlpha.mean, timeGamma.mean),
      tokensPct: pctChange(tokAlpha.mean, tokGamma.mean),
      turnsPct: pctChange(turnAlpha.mean, turnGamma.mean),
    },
    betaOverheadVsAlpha: {
      timePct: pctChange(timeAlpha.mean, timeBeta.mean),
      tokensPct: pctChange(tokAlpha.mean, tokBeta.mean),
      turnsPct: pctChange(turnAlpha.mean, turnBeta.mean),
    },
  };
}
