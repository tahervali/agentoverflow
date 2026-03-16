import { v4 as uuidv4 } from "uuid";
import { insertSolution, updateOutcome } from "../db.js";

export interface PostNewInput {
  description: string;
  code: string;
  language: string;
  inputs: string;
  outputs: string;
  tags: string;
  build_cost_turns: number;
}

export interface PostUpdateInput {
  id: string;
  outcome: "success" | "fail";
}

export type PostInput = PostNewInput | PostUpdateInput;

function isUpdate(input: PostInput): input is PostUpdateInput {
  return "id" in input && "outcome" in input;
}

// Session-level dedup: each MCP server process (one per agent run) tracks
// which solution IDs have already had outcomes reported. Prevents the LLM
// from inflating success_count by calling post(id, outcome) multiple times.
const reportedOutcomes = new Set<string>();

export function handlePost(input: PostInput): { id: string; status: "created" | "updated" | "already_reported" } {
  if (isUpdate(input)) {
    const key = `${input.id}:${input.outcome}`;
    if (reportedOutcomes.has(key)) {
      return { id: input.id, status: "already_reported" };
    }
    const updated = updateOutcome(input.id, input.outcome);
    if (!updated) {
      throw new Error(`Solution not found: ${input.id}`);
    }
    reportedOutcomes.add(key);
    return { id: input.id, status: "updated" };
  }

  const id = uuidv4();
  insertSolution({
    id,
    description: input.description,
    code: input.code,
    language: input.language,
    inputs: input.inputs || "",
    outputs: input.outputs || "",
    tags: input.tags || "",
    build_cost_turns: input.build_cost_turns || 0,
  });
  return { id, status: "created" };
}
