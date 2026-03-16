import type { SolutionMeta } from "../hooks/useSolutions.js";
import { timeAgo } from "../utils/format.js";

export default function Timeline({ solutions }: { solutions: SolutionMeta[] }) {
  const recent = solutions.slice(0, 20);

  if (recent.length === 0) return null;

  return (
    <div className="border-t border-gray-800 bg-[#161b22]">
      <div className="px-6 py-3 border-b border-gray-800">
        <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider">
          Activity Timeline
        </h3>
      </div>
      <div className="px-6 py-2 overflow-x-auto">
        <div className="flex gap-4 pb-2">
          {recent.map((s) => (
            <div
              key={s.id}
              className="flex-shrink-0 w-64 p-3 rounded-lg bg-[#0d1117] border border-gray-800"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-900/50 text-purple-300">
                  {s.language}
                </span>
                <span className="text-[10px] font-mono text-gray-600 ml-auto">
                  {timeAgo(s.created_at)}
                </span>
              </div>
              <p className="text-xs text-gray-400 line-clamp-2">{s.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
