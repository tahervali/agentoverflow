import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

const DB_DIR = path.join(os.homedir(), ".agentstack");
const DB_PATH = path.join(DB_DIR, "registry.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(DB_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS solutions (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      code TEXT NOT NULL,
      language TEXT NOT NULL,
      inputs TEXT NOT NULL DEFAULT '',
      outputs TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      build_cost_turns INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Create FTS5 virtual table for full-text search on description and tags
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS solutions_fts USING fts5(
        id UNINDEXED,
        description,
        tags,
        content='solutions',
        content_rowid='rowid'
      );
    `);

    // Triggers to keep FTS index in sync
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS solutions_ai AFTER INSERT ON solutions BEGIN
        INSERT INTO solutions_fts(rowid, id, description, tags)
        VALUES (new.rowid, new.id, new.description, new.tags);
      END;
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS solutions_ad AFTER DELETE ON solutions BEGIN
        INSERT INTO solutions_fts(solutions_fts, rowid, id, description, tags)
        VALUES ('delete', old.rowid, old.id, old.description, old.tags);
      END;
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS solutions_au AFTER UPDATE ON solutions BEGIN
        INSERT INTO solutions_fts(solutions_fts, rowid, id, description, tags)
        VALUES ('delete', old.rowid, old.id, old.description, old.tags);
        INSERT INTO solutions_fts(rowid, id, description, tags)
        VALUES (new.rowid, new.id, new.description, new.tags);
      END;
    `);
  } catch {
    // FTS5 not available — search will fall back to LIKE
  }

  return db;
}

export function hasFts(): boolean {
  try {
    getDb().prepare("SELECT * FROM solutions_fts LIMIT 0").run();
    return true;
  } catch {
    return false;
  }
}

export interface Solution {
  id: string;
  description: string;
  code: string;
  language: string;
  inputs: string;
  outputs: string;
  tags: string;
  build_cost_turns: number;
  success_count: number;
  fail_count: number;
  created_at: string;
  updated_at: string;
}

export type SolutionMeta = Omit<Solution, "code" | "inputs" | "outputs" | "created_at" | "updated_at">;

export function searchSolutions(query: string, tags?: string): SolutionMeta[] {
  const db = getDb();

  if (hasFts()) {
    // Build FTS query: tokenize words, add wildcard
    const ftsTerms = query
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t}"*`)
      .join(" OR ");

    let ftsQuery = ftsTerms;
    if (tags) {
      const tagTerms = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => `"${t}"*`)
        .join(" OR ");
      ftsQuery = [ftsTerms, tagTerms].filter(Boolean).join(" OR ");
    }

    if (!ftsQuery) return [];

    const rows = db
      .prepare(
        `SELECT s.id, s.description, s.language, s.tags,
                s.build_cost_turns, s.success_count, s.fail_count
         FROM solutions_fts f
         JOIN solutions s ON f.id = s.id
         WHERE solutions_fts MATCH ?
         ORDER BY (s.success_count - s.fail_count) DESC, rank
         LIMIT 5`
      )
      .all(ftsQuery) as SolutionMeta[];

    return rows;
  }

  // Fallback: LIKE-based search
  const likePatterns: string[] = [];
  const params: string[] = [];

  for (const word of query.split(/\s+/).filter(Boolean)) {
    likePatterns.push("(s.description LIKE ? OR s.tags LIKE ?)");
    params.push(`%${word}%`, `%${word}%`);
  }

  if (tags) {
    for (const tag of tags.split(",").map((t) => t.trim()).filter(Boolean)) {
      likePatterns.push("(s.description LIKE ? OR s.tags LIKE ?)");
      params.push(`%${tag}%`, `%${tag}%`);
    }
  }

  if (likePatterns.length === 0) return [];

  const where = likePatterns.join(" OR ");
  const rows = db
    .prepare(
      `SELECT s.id, s.description, s.language, s.tags,
              s.build_cost_turns, s.success_count, s.fail_count
       FROM solutions s
       WHERE ${where}
       ORDER BY (s.success_count - s.fail_count) DESC
       LIMIT 5`
    )
    .all(...params) as SolutionMeta[];

  return rows;
}

export function pullSolution(id: string): Solution | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM solutions WHERE id = ?").get(id) as Solution | undefined;
}

export function insertSolution(sol: Omit<Solution, "id" | "success_count" | "fail_count" | "created_at" | "updated_at"> & { id: string }): string {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO solutions (id, description, code, language, inputs, outputs, tags, build_cost_turns, success_count, fail_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  ).run(sol.id, sol.description, sol.code, sol.language, sol.inputs, sol.outputs, sol.tags, sol.build_cost_turns, now, now);
  return sol.id;
}

export function updateOutcome(id: string, outcome: "success" | "fail"): boolean {
  const db = getDb();
  const col = outcome === "success" ? "success_count" : "fail_count";
  const now = new Date().toISOString();
  const result = db
    .prepare(`UPDATE solutions SET ${col} = ${col} + 1, updated_at = ? WHERE id = ?`)
    .run(now, id);
  return result.changes > 0;
}
