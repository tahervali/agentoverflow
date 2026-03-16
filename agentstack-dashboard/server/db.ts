import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

const DB_PATH = path.join(os.homedir(), ".agentstack", "registry.db");

let db: Database.Database | null = null;
let dbInode: number | null = null; // Track file identity to detect recreation

export function getDb(): Database.Database | null {
  // Check if DB file exists
  if (!fs.existsSync(DB_PATH)) {
    // File was deleted — close stale handle
    if (db) { try { db.close(); } catch {} }
    db = null;
    dbInode = null;
    return null;
  }

  // Check if file was recreated (different inode = new file)
  const stat = fs.statSync(DB_PATH);
  if (db && dbInode !== null && stat.ino !== dbInode) {
    // DB file was deleted and recreated — reopen
    try { db.close(); } catch {}
    db = null;
  }

  if (db) return db;

  db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  dbInode = stat.ino;
  return db;
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
