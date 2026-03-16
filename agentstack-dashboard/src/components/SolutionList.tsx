import type { SolutionMeta } from "../hooks/useSolutions.js";
import { timeAgo } from "../utils/format.js";

interface Props {
  solutions: SolutionMeta[];
  loading: boolean;
  languages: string[];
  selectedId: string | null;
  query: string;
  language: string;
  sort: string;
  onSelect: (id: string) => void;
  onQueryChange: (q: string) => void;
  onLanguageChange: (lang: string) => void;
  onSortChange: (sort: string) => void;
}

export default function SolutionList({
  solutions,
  loading,
  languages,
  selectedId,
  query,
  language,
  sort,
  onSelect,
  onQueryChange,
  onLanguageChange,
  onSortChange,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-4 border-b border-gray-800">
        <input
          type="text"
          placeholder="Search solutions..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full px-3 py-2 bg-[#0d1117] border border-gray-700 rounded-md text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-gray-800 flex flex-wrap gap-2">
        <button
          onClick={() => onLanguageChange("")}
          className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
            language === ""
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          All
        </button>
        {languages.map((lang) => (
          <button
            key={lang}
            onClick={() => onLanguageChange(lang)}
            className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
              language === lang
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {lang}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="px-4 py-2 border-b border-gray-800">
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="bg-[#0d1117] border border-gray-700 rounded text-xs font-mono text-gray-300 px-2 py-1 focus:outline-none"
        >
          <option value="recent">Recent</option>
          <option value="most_used">Most Used</option>
          <option value="highest_score">Highest Score</option>
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-8 text-center text-gray-600 font-mono text-sm">Loading...</div>
        )}
        {!loading && solutions.length === 0 && (
          <div className="p-8 text-center text-gray-600 font-mono text-sm">
            No solutions yet. Start working and your agents will populate the registry.
          </div>
        )}
        {solutions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`px-4 py-3 border-b border-gray-800 cursor-pointer transition-colors ${
              selectedId === s.id
                ? "bg-[#1c2333] border-l-2 border-l-blue-500"
                : "hover:bg-[#161b22]"
            }`}
          >
            <p className="text-sm text-gray-200 line-clamp-2 mb-2">{s.description}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-900/50 text-purple-300">
                {s.language}
              </span>
              {s.tags &&
                s.tags
                  .split(",")
                  .slice(0, 3)
                  .map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-800 text-gray-500"
                    >
                      {tag.trim()}
                    </span>
                  ))}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-gray-500">
              <span>Built in {s.build_cost_turns}t</span>
              <span className="text-blue-400" title="Times pulled">{s.success_count + s.fail_count} pulls</span>
              <span className="text-green-500">&#10003;{s.success_count}</span>
              <span className="text-red-500">&#10007;{s.fail_count}</span>
              {(s.success_count + s.fail_count) > 0 && (
                <span className={
                  (s.success_count / (s.success_count + s.fail_count)) >= 0.8 ? "text-green-400" :
                  (s.success_count / (s.success_count + s.fail_count)) >= 0.5 ? "text-yellow-400" : "text-red-400"
                }>
                  {Math.round((s.success_count / (s.success_count + s.fail_count)) * 100)}%
                </span>
              )}
              <span className="ml-auto">{timeAgo(s.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
