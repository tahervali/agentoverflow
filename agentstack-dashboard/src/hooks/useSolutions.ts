import { useState, useEffect, useCallback } from "react";

export interface SolutionMeta {
  id: string;
  description: string;
  language: string;
  tags: string;
  build_cost_turns: number;
  success_count: number;
  fail_count: number;
  created_at: string;
  updated_at: string;
}

export interface SolutionFull extends SolutionMeta {
  code: string;
  inputs: string;
  outputs: string;
}

export interface Stats {
  total: number;
  totalSuccess: number;
  totalFail: number;
  avgBuildCost: number;
  byLanguage: { language: string; count: number }[];
  mostReused: { id: string; description: string; language: string; success_count: number; fail_count: number }[];
  recentlyAdded: { id: string; description: string; language: string; created_at: string }[];
}

export function useSolutions(query: string, language: string, sort: string) {
  const [solutions, setSolutions] = useState<SolutionMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSolutions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (language) params.set("language", language);
    if (sort) params.set("sort", sort);

    const res = await fetch(`/api/solutions?${params}`);
    const data = await res.json();
    setSolutions(data);
    setLoading(false);
  }, [query, language, sort]);

  useEffect(() => {
    fetchSolutions();
  }, [fetchSolutions]);

  return { solutions, loading, refetch: fetchSolutions };
}

export function useSolutionDetail(id: string | null) {
  const [solution, setSolution] = useState<SolutionFull | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setSolution(null);
      return;
    }
    setLoading(true);
    fetch(`/api/solutions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setSolution(data);
        setLoading(false);
      });
  }, [id]);

  return { solution, loading };
}

export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  return stats;
}
