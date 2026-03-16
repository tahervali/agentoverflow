import { searchSolutions } from "../db.js";

export interface SearchInput {
  query: string;
  tags?: string;
}

export function handleSearch(input: SearchInput) {
  const results = searchSolutions(input.query, input.tags);
  return results;
}
