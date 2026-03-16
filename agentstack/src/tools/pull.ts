import { pullSolution } from "../db.js";

export interface PullInput {
  id: string;
}

export function handlePull(input: PullInput) {
  const solution = pullSolution(input.id);
  if (!solution) {
    throw new Error(`Solution not found: ${input.id}`);
  }
  return solution;
}
