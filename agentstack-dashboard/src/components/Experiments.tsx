import { useState, useEffect } from "react";
import {
  useExperiments,
  useExperimentDetail,
  type ExperimentSummary,
  type TripleComparison,
  type TaskResult,
  type RunResult,
} from "../hooks/useExperiments.js";
import { timeAgo } from "../utils/format.js";

// Agent colors and labels
const AGENTS = {
  alpha: { name: "Agent Alpha", label: "Baseline", color: "text-gray-400", bg: "bg-gray-700/50", bar: "bg-gray-500" },
  beta:  { name: "Agent Beta",  label: "Cold Start", color: "text-cyan-400", bg: "bg-cyan-900/50", bar: "bg-cyan-500" },
  gamma: { name: "Agent Gamma", label: "Warm Cache", color: "text-orange-400", bg: "bg-orange-900/50", bar: "bg-orange-500" },
} as const;

// ─── Live Activity Feed ───

interface ActivityEvent {
  id: string; description: string; language: string; tags: string;
  success_count: number; fail_count: number; created_at: string; updated_at: string;
}

function useLiveActivity(pollMs = 3000) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const data = await (await fetch("/api/activity")).json();
        if (active) { setEvents(data.solutions || []); setCount(data.count || 0); }
      } catch {}
    };
    poll();
    const i = setInterval(poll, pollMs);
    return () => { active = false; clearInterval(i); };
  }, [pollMs]);
  return { events, count };
}

// ─── Main Component ───

export default function Experiments() {
  const { experiments, loading, refetch } = useExperiments();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { experiment: detail, loading: detailLoading } = useExperimentDetail(selectedId);
  const { events: liveEvents, count: solutionCount } = useLiveActivity(3000);

  useEffect(() => { const i = setInterval(refetch, 5000); return () => clearInterval(i); }, [refetch]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar */}
      <div className="w-[320px] border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Experiments</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-gray-500">{solutionCount} solutions</span>
            <button onClick={refetch} className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700">Refresh</button>
          </div>
        </div>

        {/* Live feed */}
        {liveEvents.length > 0 && (
          <div className="border-b border-gray-800 max-h-[180px] overflow-y-auto">
            <div className="px-4 py-2 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              <span className="text-[10px] font-mono text-green-400 uppercase tracking-wider">Live Registry</span>
            </div>
            {liveEvents.slice(0, 6).map((ev) => (
              <div key={ev.id + ev.updated_at} className="px-4 py-1 border-t border-gray-800/50 text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-900/50 text-purple-300">{ev.language}</span>
                  <span className="text-gray-400 truncate flex-1">{ev.description.slice(0, 45)}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-600">
                  <span className="text-green-500">+{ev.success_count}</span>
                  <span className="text-red-500">-{ev.fail_count}</span>
                  <span className="ml-auto">{timeAgo(ev.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Experiment list */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-8 text-center text-gray-600 text-sm">Loading...</div>}
          {!loading && experiments.length === 0 && (
            <div className="p-6 text-center text-gray-600 text-sm">
              <p className="mb-2">No experiments yet.</p>
              <p className="text-[10px] text-gray-700"><code className="bg-gray-800 px-1 rounded">npx tsx experiments/runner.ts --clean true --tasks csv-parser</code></p>
            </div>
          )}
          {experiments.map((exp) => (
            <div
              key={exp.experimentId}
              onClick={() => setSelectedId(exp.experimentId)}
              className={`px-4 py-3 border-b border-gray-800 cursor-pointer transition-colors ${
                selectedId === exp.experimentId ? "bg-[#1c2333] border-l-2 border-l-blue-500" : "hover:bg-[#161b22]"
              }`}
            >
              <p className="text-sm text-gray-200 font-medium mb-1">{exp.name}</p>
              <div className="flex items-center gap-2 text-[11px] font-mono text-gray-500">
                <StatusBadge status={exp.status} />
                <span>{exp.totalTasks} tasks</span>
                <span>{exp.completedRuns}/{exp.totalRuns} runs</span>
              </div>
              <div className="text-[10px] text-gray-600 mt-1">{timeAgo(exp.createdAt)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right detail */}
      <div className="flex-1 overflow-y-auto">
        {detailLoading && <div className="flex items-center justify-center h-full text-gray-600 text-sm">Loading...</div>}
        {!detailLoading && !detail && <div className="flex items-center justify-center h-full text-gray-600 text-sm">Select an experiment</div>}
        {!detailLoading && detail && <ExperimentDetail experiment={detail} />}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    pending: "bg-yellow-900/50 text-yellow-400", running: "bg-blue-900/50 text-blue-400",
    completed: "bg-green-900/50 text-green-400", failed: "bg-red-900/50 text-red-400",
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${c[status] || c.pending}`}>{status}</span>;
}

// ─── Experiment Detail ───

function ExperimentDetail({ experiment }: { experiment: ExperimentSummary }) {
  const [tab, setTab] = useState<"overview" | "tasks" | "raw">("overview");
  const r = experiment.results;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">{experiment.name}</h2>
        <p className="text-sm text-gray-400 mb-3">{experiment.description}</p>
        {/* Agent legend */}
        <div className="flex gap-4 mb-3">
          {(["alpha", "beta", "gamma"] as const).map((a) => (
            <div key={a} className="flex items-center gap-2 text-xs font-mono">
              <span className={`inline-block w-3 h-3 rounded ${AGENTS[a].bg}`}></span>
              <span className={AGENTS[a].color}>{AGENTS[a].name}</span>
              <span className="text-gray-600">({AGENTS[a].label})</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
          <StatusBadge status={experiment.status} />
          <span>{experiment.totalTasks} tasks</span>
          <span>{experiment.completedRuns}/{experiment.totalRuns} runs</span>
        </div>
      </div>

      <div className="flex border-b border-gray-800">
        {(["overview", "tasks", "raw"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider ${
              tab === t ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-500 hover:text-gray-300"
            }`}>{t}</button>
        ))}
      </div>

      {tab === "overview" && r && <OverviewTab overall={r.overall} tasks={r.tasks} />}
      {tab === "tasks" && r && <TasksTab tasks={r.tasks} />}
      {tab === "raw" && <pre className="bg-[#161b22] rounded-lg p-4 text-xs font-mono text-gray-400 overflow-auto max-h-[600px]">{JSON.stringify(experiment, null, 2)}</pre>}
      {!r && <div className="text-center text-gray-600 py-12 text-sm">No results yet.</div>}
    </div>
  );
}

// ─── Overview Tab ───

function OverviewTab({ overall, tasks }: { overall: TripleComparison; tasks: TaskResult[] }) {
  return (
    <div className="space-y-8">
      {/* Headline savings */}
      <div className="grid grid-cols-3 gap-4">
        <SavingsCard label="Time Saved (Gamma vs Alpha)" value={overall.gammaSavingsVsAlpha.timePct}
          detail={`${(overall.time.alpha.mean / 1000).toFixed(1)}s → ${(overall.time.gamma.mean / 1000).toFixed(1)}s`} />
        <SavingsCard label="Tokens Saved (Gamma vs Alpha)" value={overall.gammaSavingsVsAlpha.tokensPct}
          detail={`${(overall.tokens.alpha.mean / 1000).toFixed(1)}k → ${(overall.tokens.gamma.mean / 1000).toFixed(1)}k`} />
        <SavingsCard label="Turns Saved (Gamma vs Alpha)" value={overall.gammaSavingsVsAlpha.turnsPct}
          detail={`${overall.turns.alpha.mean.toFixed(1)} → ${overall.turns.gamma.mean.toFixed(1)}`} />
      </div>

      {/* 3-way comparison bars */}
      <div className="bg-[#161b22] rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">3-Agent Comparison</h3>
        <div className="space-y-6">
          <TripleBar label="Wall Clock Time" unit="s" divisor={1000}
            alpha={overall.time.alpha.mean} beta={overall.time.beta.mean} gamma={overall.time.gamma.mean} />
          <TripleBar label="Token Usage" unit="k" divisor={1000}
            alpha={overall.tokens.alpha.mean} beta={overall.tokens.beta.mean} gamma={overall.tokens.gamma.mean} />
          <TripleBar label="Agent Turns" unit="" divisor={1}
            alpha={overall.turns.alpha.mean} beta={overall.turns.beta.mean} gamma={overall.turns.gamma.mean} />
        </div>
      </div>

      {/* Success rates */}
      <div className="bg-[#161b22] rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Success Rates</h3>
        <div className="grid grid-cols-3 gap-4">
          {(["alpha", "beta", "gamma"] as const).map((a) => (
            <div key={a} className="text-center">
              <div className={`text-2xl font-bold ${AGENTS[a].color}`}>
                {(overall.successRates[a] * 100).toFixed(0)}%
              </div>
              <div className="text-xs font-mono text-gray-500 mt-1">{AGENTS[a].name}</div>
              <div className="text-[10px] text-gray-600">{AGENTS[a].label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Beta overhead */}
      <div className="bg-[#161b22] rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Cold Start Overhead (Beta vs Alpha)</h3>
        <p className="text-xs text-gray-500 mb-3">Extra cost of using AgentStack when registry is empty (searching + posting)</p>
        <div className="grid grid-cols-3 gap-4">
          <OverheadCard label="Time" value={overall.betaOverheadVsAlpha.timePct} />
          <OverheadCard label="Tokens" value={overall.betaOverheadVsAlpha.tokensPct} />
          <OverheadCard label="Turns" value={overall.betaOverheadVsAlpha.turnsPct} />
        </div>
      </div>

      {/* Per-difficulty */}
      <div className="bg-[#161b22] rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Gamma Savings by Difficulty</h3>
        <div className="grid grid-cols-3 gap-4">
          {(["easy", "medium", "hard"] as const).map((diff) => {
            const dt = tasks.filter((t) => t.difficulty === diff);
            if (dt.length === 0) return null;
            const alphaTime = avg(dt.flatMap((t) => t.alpha).map((r) => r.metrics.wallClockMs));
            const gammaTime = avg(dt.flatMap((t) => t.gamma).map((r) => r.metrics.wallClockMs));
            const alphaTok = avg(dt.flatMap((t) => t.alpha).map((r) => r.metrics.totalTokens));
            const gammaTok = avg(dt.flatMap((t) => t.gamma).map((r) => r.metrics.totalTokens));
            const alphaTurns = avg(dt.flatMap((t) => t.alpha).map((r) => r.metrics.turns));
            const gammaTurns = avg(dt.flatMap((t) => t.gamma).map((r) => r.metrics.turns));
            return (
              <div key={diff} className="bg-[#0d1117] rounded p-4">
                <DifficultyBadge difficulty={diff} />
                <span className="text-xs text-gray-500 ml-2">{dt.length} tasks</span>
                <div className="mt-3 space-y-1 text-xs font-mono">
                  <PctLine label="Time" value={pct(alphaTime, gammaTime)} />
                  <PctLine label="Tokens" value={pct(alphaTok, gammaTok)} />
                  <PctLine label="Turns" value={pct(alphaTurns, gammaTurns)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Tasks Tab ───

function TasksTab({ tasks }: { tasks: TaskResult[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const isExpanded = expanded === task.taskId;
        return (
          <div key={task.taskId} className="bg-[#161b22] rounded-lg overflow-hidden">
            <div className="px-4 py-3 cursor-pointer hover:bg-[#1c2333] flex items-center justify-between"
              onClick={() => setExpanded(isExpanded ? null : task.taskId)}>
              <div className="flex items-center gap-3">
                <DifficultyBadge difficulty={task.difficulty} />
                <span className="text-sm text-gray-200">{task.taskName}</span>
              </div>
              <span className="text-gray-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
            </div>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-gray-800">
                <div className="grid grid-cols-3 gap-4 mt-4">
                  {(["alpha", "beta", "gamma"] as const).map((agent) => (
                    <div key={agent}>
                      <h4 className={`text-xs font-mono uppercase tracking-wider mb-2 ${AGENTS[agent].color}`}>
                        {AGENTS[agent].name} ({AGENTS[agent].label})
                      </h4>
                      <div className="space-y-1">
                        {task[agent].map((run, i) => <RunRow key={run.id} run={run} index={i} />)}
                      </div>
                      {task[agent].length > 0 && (
                        <div className="mt-2 text-[10px] font-mono text-gray-600">
                          Mean: {(avg(task[agent].map((r) => r.metrics.wallClockMs)) / 1000).toFixed(1)}s |{" "}
                          {avg(task[agent].map((r) => r.metrics.totalTokens)).toFixed(0)} tok |{" "}
                          {avg(task[agent].map((r) => r.metrics.turns)).toFixed(1)} turns
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RunRow({ run, index }: { run: RunResult; index: number }) {
  const hasSearches = (run.agentStackSearches || 0) > 0;
  const hasPulls = (run.agentStackPulls || 0) > 0;

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2 text-[11px] font-mono">
        <span className="text-gray-600 w-5">#{index + 1}</span>
        <span className={run.success ? "text-green-400" : "text-red-400"}>
          {run.success ? "PASS" : "FAIL"}
        </span>
        <span className="text-gray-400">{(run.metrics.wallClockMs / 1000).toFixed(1)}s</span>
        <span className="text-gray-500">{run.metrics.totalTokens} tok</span>
        <span className="text-gray-500">{run.metrics.turns}t</span>
        <span className="text-gray-600">${run.metrics.costUsd?.toFixed(3)}</span>
      </div>
      {hasSearches && (
        <div className="ml-6 mt-0.5 text-[10px] font-mono">
          <span className="text-cyan-400">{run.agentStackSearches} search</span>
          {hasPulls ? (
            <span className="text-orange-400 ml-2 font-semibold">{run.agentStackPulls} pull (reused)</span>
          ) : (
            <span className="text-yellow-500 ml-2">no match — built from scratch</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ───

function SavingsCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  const isSaving = value < 0;
  return (
    <div className="bg-[#161b22] rounded-lg p-4">
      <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-2xl font-bold ${isSaving ? "text-green-400" : value > 0 ? "text-red-400" : "text-gray-400"}`}>
        {isSaving ? "" : "+"}{value.toFixed(1)}%
      </div>
      <div className="text-xs font-mono text-gray-500 mt-1">{detail}</div>
    </div>
  );
}

function OverheadCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#0d1117] rounded p-3 text-center">
      <div className="text-lg font-bold text-cyan-400">{value > 0 ? "+" : ""}{value.toFixed(1)}%</div>
      <div className="text-[10px] font-mono text-gray-500">{label}</div>
    </div>
  );
}

function TripleBar({ label, unit, divisor, alpha, beta, gamma }: {
  label: string; unit: string; divisor: number; alpha: number; beta: number; gamma: number;
}) {
  const aVal = alpha / divisor, bVal = beta / divisor, gVal = gamma / divisor;
  const maxVal = Math.max(aVal, bVal, gVal) || 1;

  return (
    <div>
      <div className="text-xs font-mono text-gray-400 mb-1">{label}</div>
      <div className="space-y-1">
        {([
          { key: "alpha", val: aVal, ...AGENTS.alpha },
          { key: "beta", val: bVal, ...AGENTS.beta },
          { key: "gamma", val: gVal, ...AGENTS.gamma },
        ] as const).map(({ key, val, label: agentLabel, bar, color }) => (
          <div key={key} className="flex items-center gap-2">
            <span className={`text-[10px] font-mono w-16 ${color}`}>{agentLabel}</span>
            <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
              <div className={`h-full ${bar} rounded-full flex items-center justify-end pr-2 transition-all`}
                style={{ width: `${(val / maxVal) * 100}%`, minWidth: val > 0 ? "30px" : "0" }}>
                <span className="text-[9px] font-mono text-white">{val.toFixed(1)}{unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const c: Record<string, string> = {
    easy: "bg-green-900/50 text-green-400", medium: "bg-yellow-900/50 text-yellow-400", hard: "bg-red-900/50 text-red-400",
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold inline-block ${c[difficulty] || "bg-gray-800 text-gray-400"}`}>{difficulty}</span>;
}

function PctLine({ label, value }: { label: string; value: number }) {
  const isSaving = value < 0;
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={isSaving ? "text-green-400" : value > 0 ? "text-red-400" : "text-gray-500"}>
        {isSaving ? "" : "+"}{value.toFixed(1)}%
      </span>
    </div>
  );
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function pct(baseline: number, comparison: number): number {
  return baseline === 0 ? 0 : ((comparison - baseline) / baseline) * 100;
}
