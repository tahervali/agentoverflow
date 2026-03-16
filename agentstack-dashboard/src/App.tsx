import { useState, useMemo } from "react";
import SolutionList from "./components/SolutionList.js";
import SolutionDetail from "./components/SolutionDetail.js";
import Timeline from "./components/Timeline.js";
import Experiments from "./components/Experiments.js";
import { useSolutions, useSolutionDetail, useStats } from "./hooks/useSolutions.js";

type Tab = "registry" | "experiments";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("registry");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Debounce search
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const handleQueryChange = (q: string) => {
    setQuery(q);
    clearTimeout((window as any).__searchTimeout);
    (window as any).__searchTimeout = setTimeout(() => setDebouncedQuery(q), 300);
  };

  const { solutions, loading } = useSolutions(debouncedQuery, language, sort);
  const { solution: detail, loading: detailLoading } = useSolutionDetail(selectedId);
  const stats = useStats();

  // Derive unique languages from all solutions (fetch without filters for this)
  const { solutions: allSolutions } = useSolutions("", "", "recent");
  const languages = useMemo(() => {
    const set = new Set(allSolutions.map((s) => s.language));
    return Array.from(set).sort();
  }, [allSolutions]);

  return (
    <div className="h-screen flex flex-col font-mono">
      {/* Header with tabs */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#161b22]">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold font-mono tracking-tight text-white">
            AgentStack
          </h1>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("registry")}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                activeTab === "registry"
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              Registry
            </button>
            <button
              onClick={() => setActiveTab("experiments")}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                activeTab === "experiments"
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              Experiments
            </button>
          </div>
        </div>
        {activeTab === "registry" && stats && (
          <div className="flex gap-6 text-sm font-mono">
            <div>
              <span className="text-gray-500">Solutions </span>
              <span className="text-white font-semibold">{stats.total}</span>
            </div>
            <div>
              <span className="text-gray-500">Pulls </span>
              <span className="text-blue-400 font-semibold">{stats.totalSuccess + stats.totalFail}</span>
            </div>
            <div>
              <span className="text-gray-500">Pass </span>
              <span className="text-green-400 font-semibold">{stats.totalSuccess}</span>
            </div>
            <div>
              <span className="text-gray-500">Fail </span>
              <span className="text-red-400 font-semibold">{stats.totalFail}</span>
            </div>
            <div>
              <span className="text-gray-500">Trust </span>
              <span className={`font-semibold ${
                stats.totalSuccess + stats.totalFail > 0
                  ? (stats.totalSuccess / (stats.totalSuccess + stats.totalFail)) >= 0.8
                    ? "text-green-400" : "text-yellow-400"
                  : "text-gray-500"
              }`}>
                {stats.totalSuccess + stats.totalFail > 0
                  ? `${Math.round((stats.totalSuccess / (stats.totalSuccess + stats.totalFail)) * 100)}%`
                  : "N/A"}
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      {activeTab === "registry" && (
        <>
          <div className="flex flex-1 overflow-hidden">
            <div className="w-[40%] border-r border-gray-800 flex flex-col">
              <SolutionList
                solutions={solutions}
                loading={loading}
                languages={languages}
                selectedId={selectedId}
                query={query}
                language={language}
                sort={sort}
                onSelect={setSelectedId}
                onQueryChange={handleQueryChange}
                onLanguageChange={setLanguage}
                onSortChange={setSort}
              />
            </div>
            <div className="w-[60%] flex flex-col">
              <SolutionDetail solution={detail} loading={detailLoading} />
            </div>
          </div>
          <Timeline solutions={allSolutions} />
        </>
      )}

      {activeTab === "experiments" && (
        <div className="flex-1 overflow-hidden">
          <Experiments />
        </div>
      )}
    </div>
  );
}
