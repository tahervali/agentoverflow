import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDb } from "./db.js";
import { handleSearch } from "./tools/search.js";
import { handlePull } from "./tools/pull.js";
import { handlePost } from "./tools/post.js";

const server = new McpServer({
  name: "AgentStack",
  version: "1.0.0",
});

server.tool(
  "search",
  "Search the solution registry for reusable code. Returns metadata (no code) so you can decide whether to pull.",
  {
    query: z.string().describe("Natural language search query"),
    tags: z.string().optional().describe("Comma-separated tags to filter by"),
  },
  async ({ query, tags }) => {
    const results = handleSearch({ query, tags });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.tool(
  "pull",
  "Pull the full solution (including code) by ID.",
  {
    id: z.string().describe("Solution ID to retrieve"),
  },
  async ({ id }) => {
    try {
      const solution = handlePull({ id });
      return {
        content: [{ type: "text", text: JSON.stringify(solution, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: e.message }) }],
        isError: true,
      };
    }
  }
);

server.tool(
  "post",
  "Post a new solution to the registry, or update the outcome (success/fail) of an existing one.",
  {
    id: z.string().optional().describe("Solution ID (for outcome updates only)"),
    outcome: z.enum(["success", "fail"]).optional().describe("Report success or failure of a pulled solution"),
    description: z.string().optional().describe("What the solution does"),
    code: z.string().optional().describe("The solution code"),
    language: z.string().optional().describe("Programming language"),
    inputs: z.string().optional().describe("Expected inputs"),
    outputs: z.string().optional().describe("Expected outputs"),
    tags: z.string().optional().describe("Comma-separated tags"),
    build_cost_turns: z.number().optional().describe("Agent turns it took to build"),
  },
  async (args) => {
    try {
      if (args.id && args.outcome) {
        const result = handlePost({ id: args.id, outcome: args.outcome });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (!args.description || !args.code || !args.language) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "New solutions require description, code, and language" }) }],
          isError: true,
        };
      }

      const result = handlePost({
        description: args.description,
        code: args.code,
        language: args.language,
        inputs: args.inputs || "",
        outputs: args.outputs || "",
        tags: args.tags || "",
        build_cost_turns: args.build_cost_turns || 0,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: e.message }) }],
        isError: true,
      };
    }
  }
);

async function main() {
  // Initialize the database on startup
  getDb();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AgentStack MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
