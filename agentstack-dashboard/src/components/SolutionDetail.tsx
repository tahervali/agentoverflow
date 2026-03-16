import { useEffect, useRef } from "react";
import type { SolutionFull } from "../hooks/useSolutions.js";
import { timeAgo, successRate } from "../utils/format.js";

declare global {
  interface Window {
    hljs: { highlightElement: (el: HTMLElement) => void };
  }
}

export default function SolutionDetail({
  solution,
  loading,
}: {
  solution: SolutionFull | null;
  loading: boolean;
}) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (solution && codeRef.current && window.hljs) {
      codeRef.current.removeAttribute("data-highlighted");
      window.hljs.highlightElement(codeRef.current);
    }
  }, [solution]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-600 font-mono text-sm">Loading...</div>;
  }

  if (!solution) {
    return <div className="flex items-center justify-center h-full text-gray-600 font-mono text-sm">Select a solution to view details</div>;
  }

  const totalUses = solution.success_count + solution.fail_count;
  const score = totalUses > 0 ? (solution.success_count / totalUses) * 100 : 0;
  const scoreColor = totalUses === 0 ? "text-gray-500" : score >= 80 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Description */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-2">{solution.description}</h2>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="px-2 py-1 rounded bg-purple-900/50 text-purple-300 font-semibold">
            {solution.language}
          </span>
          <span className="text-gray-500">Built in {solution.build_cost_turns} turns</span>
        </div>
      </div>

      {/* Trust Scorecard */}
      <div className="bg-[#161b22] rounded-lg p-4 border border-gray-800">
        <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
          Trust Scorecard
        </h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-400">{totalUses}</div>
            <div className="text-[10px] font-mono text-gray-500">Times Pulled</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400">{solution.success_count}</div>
            <div className="text-[10px] font-mono text-gray-500">Pull → Pass</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">{solution.fail_count}</div>
            <div className="text-[10px] font-mono text-gray-500">Pull → Fail</div>
          </div>
          <div>
            <div className={`text-2xl font-bold ${scoreColor}`}>
              {totalUses > 0 ? `${score.toFixed(0)}%` : "N/A"}
            </div>
            <div className="text-[10px] font-mono text-gray-500">Trust Score</div>
          </div>
        </div>

        {/* Score bar */}
        {totalUses > 0 && (
          <div className="mt-3">
            <div className="flex rounded-full h-2 overflow-hidden bg-gray-800">
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${score}%` }}
              ></div>
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${100 - score}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-gray-600 mt-1">
              <span>{solution.success_count} passed</span>
              <span>{solution.fail_count} failed</span>
            </div>
          </div>
        )}

        {totalUses === 0 && (
          <div className="mt-2 text-[11px] font-mono text-gray-600 text-center">
            Not yet used by any agent. Score will update when agents pull and report outcomes.
          </div>
        )}
      </div>

      {/* Tags */}
      {solution.tags && (
        <div className="flex gap-2 flex-wrap">
          {solution.tags.split(",").map((tag) => (
            <span key={tag} className="px-2 py-1 rounded text-xs font-mono bg-gray-800 text-gray-400">
              {tag.trim()}
            </span>
          ))}
        </div>
      )}

      {/* Code */}
      <div>
        <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Code</h3>
        <pre className="rounded-lg overflow-x-auto">
          <code ref={codeRef} className={`language-${solution.language}`}>
            {solution.code}
          </code>
        </pre>
      </div>

      {/* Inputs */}
      {solution.inputs && (
        <div>
          <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1">Inputs</h3>
          <p className="text-sm text-gray-300 bg-[#161b22] rounded p-3 font-mono">{solution.inputs}</p>
        </div>
      )}

      {/* Outputs */}
      {solution.outputs && (
        <div>
          <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1">Outputs</h3>
          <p className="text-sm text-gray-300 bg-[#161b22] rounded p-3 font-mono">{solution.outputs}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="border-t border-gray-800 pt-4">
        <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Metadata</h3>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="text-gray-500">ID</div>
          <div className="text-gray-400 break-all">{solution.id}</div>
          <div className="text-gray-500">Created</div>
          <div className="text-gray-400">
            {new Date(solution.created_at).toLocaleString()} ({timeAgo(solution.created_at)})
          </div>
          <div className="text-gray-500">Updated</div>
          <div className="text-gray-400">
            {new Date(solution.updated_at).toLocaleString()} ({timeAgo(solution.updated_at)})
          </div>
        </div>
      </div>
    </div>
  );
}
