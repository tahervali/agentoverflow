import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getDb, type Solution } from "./db.js";
import {
  listExperiments,
  getExperiment,
} from "../experiments/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3456;

// API: list solutions with search, filter, sort
app.get("/api/solutions", (req, res) => {
  const db = getDb();
  if (!db) return res.json([]);

  const q = (req.query.q as string) || "";
  const language = (req.query.language as string) || "";
  const sort = (req.query.sort as string) || "recent";

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    for (const word of words) {
      conditions.push("(description LIKE ? OR tags LIKE ?)");
      params.push(`%${word}%`, `%${word}%`);
    }
  }

  if (language) {
    conditions.push("language = ?");
    params.push(language);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let orderBy: string;
  switch (sort) {
    case "most_used":
      orderBy = "ORDER BY success_count DESC";
      break;
    case "highest_score":
      orderBy = "ORDER BY CASE WHEN (success_count + fail_count) = 0 THEN 0 ELSE CAST(success_count AS REAL) / (success_count + fail_count) END DESC";
      break;
    default:
      orderBy = "ORDER BY created_at DESC";
  }

  const rows = db
    .prepare(
      `SELECT id, description, language, tags, build_cost_turns, success_count, fail_count, created_at, updated_at
       FROM solutions ${where} ${orderBy}`
    )
    .all(...params);

  res.json(rows);
});

// API: get single solution with full code
app.get("/api/solutions/:id", (req, res) => {
  const db = getDb();
  if (!db) return res.status(404).json({ error: "Database not found" });

  const row = db.prepare("SELECT * FROM solutions WHERE id = ?").get(req.params.id) as Solution | undefined;
  if (!row) return res.status(404).json({ error: "Solution not found" });

  res.json(row);
});

// API: aggregate stats
app.get("/api/stats", (_req, res) => {
  const db = getDb();
  if (!db) {
    return res.json({
      total: 0,
      totalSuccess: 0,
      totalFail: 0,
      byLanguage: [],
      avgBuildCost: 0,
      mostReused: [],
      recentlyAdded: [],
    });
  }

  const totals = db
    .prepare(
      `SELECT COUNT(*) as total,
              COALESCE(SUM(success_count), 0) as totalSuccess,
              COALESCE(SUM(fail_count), 0) as totalFail,
              COALESCE(AVG(build_cost_turns), 0) as avgBuildCost
       FROM solutions`
    )
    .get() as { total: number; totalSuccess: number; totalFail: number; avgBuildCost: number };

  const byLanguage = db
    .prepare("SELECT language, COUNT(*) as count FROM solutions GROUP BY language ORDER BY count DESC")
    .all();

  const mostReused = db
    .prepare(
      `SELECT id, description, language, success_count, fail_count
       FROM solutions ORDER BY success_count DESC LIMIT 5`
    )
    .all();

  const recentlyAdded = db
    .prepare(
      `SELECT id, description, language, created_at
       FROM solutions ORDER BY created_at DESC LIMIT 5`
    )
    .all();

  res.json({
    ...totals,
    byLanguage,
    mostReused,
    recentlyAdded,
  });
});

// API: live activity feed — recent solution events (created, success, fail)
app.get("/api/activity", (_req, res) => {
  const db = getDb();
  if (!db) return res.json({ solutions: [], count: 0 });

  const solutions = db
    .prepare(
      `SELECT id, description, language, tags, success_count, fail_count, created_at, updated_at
       FROM solutions ORDER BY updated_at DESC LIMIT 20`
    )
    .all();

  const count = (db.prepare("SELECT COUNT(*) as c FROM solutions").get() as any).c;

  res.json({ solutions, count });
});

// ─── Experiment API ───

app.get("/api/experiments", (_req, res) => {
  try {
    const experiments = listExperiments();
    res.json(experiments);
  } catch (err: any) {
    res.json([]);
  }
});

app.get("/api/experiments/:id", (req, res) => {
  try {
    const experiment = getExperiment(req.params.id);
    if (!experiment) return res.status(404).json({ error: "Experiment not found" });
    res.json(experiment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static files in production
const clientDist = path.join(__dirname, "..", "dist-client");
app.use(express.static(clientDist));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`AgentStack Dashboard running at http://localhost:${PORT}`);
});
