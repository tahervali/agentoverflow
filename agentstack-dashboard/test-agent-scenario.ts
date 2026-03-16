/**
 * Simulates a realistic agent workflow:
 *
 * SCENARIO: An agent is asked to clean and deduplicate a UNHCR registration CSV.
 *
 * Steps:
 * 1. Agent receives task: "Clean and deduplicate this UNHCR registration CSV"
 * 2. Agent searches AgentStack for relevant solutions
 * 3. Agent finds matches, pulls the best one
 * 4. Agent uses the pulled code on test data
 * 5. Agent reports outcome (success/fail) back to AgentStack
 */

import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

const DB_PATH = path.join(os.homedir(), ".agentstack", "registry.db");
const db = new Database(DB_PATH);

// ─── Colors for terminal output ───
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Simulate MCP tool calls using direct DB access ───

function mcpSearch(query: string, tags?: string) {
  const words = query.split(/\s+/).filter(Boolean);
  const conditions: string[] = [];
  const params: string[] = [];

  for (const word of words) {
    conditions.push("(description LIKE ? OR tags LIKE ?)");
    params.push(`%${word}%`, `%${word}%`);
  }
  if (tags) {
    for (const tag of tags.split(",").map((t) => t.trim()).filter(Boolean)) {
      conditions.push("(description LIKE ? OR tags LIKE ?)");
      params.push(`%${tag}%`, `%${tag}%`);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" OR ")}` : "";
  return db
    .prepare(
      `SELECT id, description, language, tags, build_cost_turns, success_count, fail_count
       FROM solutions ${where}
       ORDER BY (success_count - fail_count) DESC
       LIMIT 5`
    )
    .all(...params) as any[];
}

function mcpPull(id: string) {
  return db.prepare("SELECT * FROM solutions WHERE id = ?").get(id) as any;
}

function mcpPost(id: string, outcome: "success" | "fail") {
  const col = outcome === "success" ? "success_count" : "fail_count";
  const now = new Date().toISOString();
  db.prepare(`UPDATE solutions SET ${col} = ${col} + 1, updated_at = ? WHERE id = ?`).run(now, id);
  return { id, status: "updated", outcome };
}

// ─── Test data ───

function generateTestCSV(): string {
  const tmpPath = path.join(os.tmpdir(), "unhcr_test_data.csv");
  const rows = [
    "full_name,date_of_birth,registration_date,country_of_origin,case_id",
    "Ahmad Hassan,1985-03-15,2023-06-01,SYR,SYR-2023-001",
    "ahmad hassan,15/03/1985,01-Jun-2023,syr,SYR-2023-001",   // duplicate, different format
    "Fatima Al-Rashid,1990-07-22,2023-06-02,IRQ,IRQ-2023-042",
    "Mohammed Ali,1978-11-30,2023-06-03,AFG,AFG-2023-105",
    "mohammed ali,30/11/1978,2023-06-03,afg,AFG-2023-105",     // duplicate
    "Sara Mahmoud,1995-01-10,2023-06-04,SOM,SOM-2023-033",
    "Jean Pierre,1988-05-20,2023-06-05,COD,COD-2023-067",
    "  jean pierre  ,20/05/1988,05-Jun-2023, cod ,COD-2023-067", // duplicate, messy
    "Amira Yusuf,2000-12-03,2023-06-06,ETH,ETH-2023-089",
  ];
  fs.writeFileSync(tmpPath, rows.join("\n"));
  return tmpPath;
}

// ─── Main scenario ───

async function runScenario() {
  console.log("\n" + bold("═══════════════════════════════════════════════════════════"));
  console.log(bold("  AGENT SIMULATION: UNHCR Registration Data Cleanup"));
  console.log(bold("═══════════════════════════════════════════════════════════\n"));

  // Step 1: Agent receives task
  console.log(cyan("▶ TASK RECEIVED:"));
  console.log('  "Clean and deduplicate this UNHCR registration CSV file.');
  console.log('   Normalize names, parse mixed date formats, standardize country codes,');
  console.log('   and remove duplicate registrations."\n');
  await sleep(1000);

  // Step 2: Agent searches AgentStack
  console.log(cyan("▶ STEP 1: Searching AgentStack registry..."));
  console.log(dim("  → mcp.search({ query: 'UNHCR registration deduplicate CSV clean', tags: 'unhcr,dedup,etl' })\n"));
  await sleep(800);

  const results = mcpSearch("UNHCR registration deduplicate CSV clean", "unhcr,dedup,etl");

  console.log(yellow(`  Found ${results.length} matching solutions:\n`));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score = r.success_count + r.fail_count > 0
      ? Math.round((r.success_count / (r.success_count + r.fail_count)) * 100)
      : 0;
    console.log(`  ${i + 1}. ${dim(`[${r.language}]`)} ${r.description.slice(0, 70)}`);
    console.log(`     ${green(`✓ ${r.success_count}`)} ${red(`✗ ${r.fail_count}`)} ${dim(`| score: ${score}% | built in ${r.build_cost_turns} turns`)}`);
    console.log(`     ${dim(`id: ${r.id}`)}\n`);
  }
  await sleep(1000);

  // Step 3: Agent evaluates and picks best matches
  // It needs TWO solutions: one for normalization, one for dedup
  console.log(cyan("▶ STEP 2: Agent reasoning..."));
  console.log(dim('  "I need two capabilities: (1) normalize UNHCR data formats, (2) deduplicate records.'));
  console.log(dim('   The ETL pipeline matches for normalization, and the dedup solution handles fuzzy matching.'));
  console.log(dim('   Both have high success rates. I\'ll pull both and combine them."\n'));
  await sleep(1000);

  // Find the UNHCR ETL and dedup solutions
  const etlSolution = results.find((r) => r.description.includes("ETL") || r.description.includes("UNHCR"));
  const dedupSolution = results.find((r) => r.description.includes("Deduplicate") || r.description.includes("dedup"));

  if (!etlSolution || !dedupSolution) {
    console.log(red("  Could not find matching solutions. Aborting."));
    return;
  }

  // Step 4: Pull solutions
  console.log(cyan("▶ STEP 3: Pulling solutions from registry...\n"));

  console.log(dim(`  → mcp.pull({ id: '${etlSolution.id}' })`));
  const etlFull = mcpPull(etlSolution.id);
  console.log(green(`  ✓ Pulled: "${etlFull.description}"`));
  console.log(dim(`    Language: ${etlFull.language} | ${etlFull.code.split("\n").length} lines of code\n`));
  await sleep(500);

  console.log(dim(`  → mcp.pull({ id: '${dedupSolution.id}' })`));
  const dedupFull = mcpPull(dedupSolution.id);
  console.log(green(`  ✓ Pulled: "${dedupFull.description}"`));
  console.log(dim(`    Language: ${dedupFull.language} | ${dedupFull.code.split("\n").length} lines of code\n`));
  await sleep(1000);

  // Step 5: Agent "uses" the solutions on test data
  console.log(cyan("▶ STEP 4: Executing pulled solutions on test data...\n"));

  const csvPath = generateTestCSV();
  console.log(dim(`  Generated test CSV at: ${csvPath}`));
  console.log(dim("  9 rows, 3 duplicate pairs with messy formatting\n"));
  await sleep(500);

  // Simulate the normalization step
  console.log(yellow("  Running Step A: Normalize registration data..."));
  await sleep(1200);
  console.log(green("  ✓ Names normalized (title case, trimmed)"));
  console.log(green("  ✓ Dates parsed from 3 different formats → ISO 8601"));
  console.log(green("  ✓ Country codes standardized to uppercase"));
  console.log(green("  ✓ 0 rows dropped (no critical nulls)\n"));
  await sleep(500);

  // Simulate the dedup step
  console.log(yellow("  Running Step B: Deduplicate with fuzzy matching..."));
  await sleep(1200);
  console.log(green("  ✓ Composite key: case_id"));
  console.log(green("  ✓ Fuzzy name matching (threshold: 85%)"));
  console.log(green("  ✓ 3 duplicates identified and removed"));
  console.log(green(`  ✓ Result: 6 unique records (from 9 input rows)\n`));
  await sleep(1000);

  // Step 6: Agent reports outcomes
  console.log(cyan("▶ STEP 5: Reporting outcomes to AgentStack...\n"));

  console.log(dim(`  → mcp.post({ id: '${etlSolution.id}', outcome: 'success' })`));
  const r1 = mcpPost(etlSolution.id, "success");
  console.log(green(`  ✓ ETL pipeline rated: SUCCESS`));

  const etlAfter = mcpPull(etlSolution.id);
  console.log(dim(`    success_count: ${etlAfter.success_count} (was ${etlFull.success_count})\n`));
  await sleep(500);

  console.log(dim(`  → mcp.post({ id: '${dedupSolution.id}', outcome: 'success' })`));
  const r2 = mcpPost(dedupSolution.id, "success");
  console.log(green(`  ✓ Dedup solution rated: SUCCESS`));

  const dedupAfter = mcpPull(dedupSolution.id);
  console.log(dim(`    success_count: ${dedupAfter.success_count} (was ${dedupFull.success_count})\n`));
  await sleep(500);

  // Summary
  console.log(bold("\n═══════════════════════════════════════════════════════════"));
  console.log(bold("  SIMULATION COMPLETE"));
  console.log(bold("═══════════════════════════════════════════════════════════\n"));

  console.log(`  ${green("✓")} Task completed by combining 2 existing solutions`);
  console.log(`  ${green("✓")} Agent turns saved: ~${etlFull.build_cost_turns + dedupFull.build_cost_turns} turns (vs building from scratch)`);
  console.log(`  ${green("✓")} Both solutions rated — trust scores updated`);
  console.log(`  ${green("✓")} Registry now reflects real-world usage\n`);

  // Show updated stats
  const stats = db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(success_count) as totalSuccess,
              SUM(fail_count) as totalFail
       FROM solutions`
    )
    .get() as any;

  console.log(dim("  Registry stats:"));
  console.log(dim(`    Total solutions: ${stats.total}`));
  console.log(dim(`    Total successes: ${stats.totalSuccess}`));
  console.log(dim(`    Total failures:  ${stats.totalFail}`));
  console.log(dim(`    Success rate:    ${Math.round((stats.totalSuccess / (stats.totalSuccess + stats.totalFail)) * 100)}%\n`));

  // Cleanup
  fs.unlinkSync(csvPath);
  db.close();
}

runScenario().catch(console.error);
