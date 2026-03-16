import type { Stats as StatsType } from "../hooks/useSolutions.js";
import { successRate } from "../utils/format.js";

export default function Stats({ stats }: { stats: StatsType | null }) {
  if (!stats) return null;

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#161b22]">
      <h1 className="text-xl font-bold font-mono tracking-tight text-white">
        AgentStack
      </h1>
      <div className="flex gap-6 text-sm font-mono">
        <div>
          <span className="text-gray-500">Solutions </span>
          <span className="text-white font-semibold">{stats.total}</span>
        </div>
        <div>
          <span className="text-gray-500">Reuses </span>
          <span className="text-green-400 font-semibold">{stats.totalSuccess}</span>
        </div>
        <div>
          <span className="text-gray-500">Success rate </span>
          <span className="text-blue-400 font-semibold">
            {successRate(stats.totalSuccess, stats.totalFail)}
          </span>
        </div>
      </div>
    </header>
  );
}
