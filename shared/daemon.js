#!/usr/bin/env node

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dingTalk from "./dingtalk-webhook.js";
import { todoSummary, bookSummary } from "./summary-tasks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const logsDir = path.join(projectRoot, "logs");
const pidFile = path.join(logsDir, "daemon.pid");

// Ensure logs dir
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// --- Logger ---
function todayLogFile() {
  const d = new Date();
  const name = `daemon-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.log`;
  return path.join(logsDir, name);
}

let logStream = null;
function getLogStream() {
  const target = todayLogFile();
  if (!logStream || logStream.path !== target) {
    if (logStream) logStream.end();
    logStream = fs.createWriteStream(target, { flags: "a" });
    logStream.path = target;
  }
  return logStream;
}

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    getLogStream().write(line + "\n");
  } catch {}
}

// --- PID management ---
function writePid() {
  fs.writeFileSync(pidFile, String(process.pid));
}
function removePid() {
  try { fs.unlinkSync(pidFile); } catch {}
}

// --- Scheduler ---
function parseTime(str) {
  // "08:00" -> { h: 8, m: 0 }
  const parts = str.split(":");
  return { h: parseInt(parts[0], 10), m: parseInt(parts[1], 10) };
}

const morningTime = parseTime(process.env.SCHEDULE_MORNING || "08:00");
const afternoonTime = parseTime(process.env.SCHEDULE_AFTERNOON || "14:00");

let lastRunDate = ""; // prevent duplicate runs within same minute

function checkAndRun() {
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const today = now.toDateString();

  // Morning run
  if (hh === morningTime.h && mm === morningTime.m && lastRunDate !== `${today}-morning`) {
    lastRunDate = `${today}-morning`;
    runTasks(false); // full summary
  }
  // Afternoon run
  if (hh === afternoonTime.h && mm === afternoonTime.m && lastRunDate !== `${today}-afternoon`) {
    lastRunDate = `${today}-afternoon`;
    runTasks(true); // urgent only
  }
}

async function runTasks(urgentOnly) {
  log(urgentOnly ? "--- Afternoon run (urgent only) ---" : "--- Morning run (full summary) ---");

  try {
    const todo = await todoSummary(urgentOnly);
    log(todo.log);
    if (todo.notify) dingTalk(todo.notify);
  } catch (e) {
    log(`[Todolist] Error: ${e.message}`);
  }

  try {
    const books = await bookSummary(urgentOnly);
    log(books.log);
    if (books.notify) dingTalk(books.notify);
  } catch (e) {
    log(`[图书馆] Error: ${e.message}`);
  }

  log("--- Run complete ---");
}

// --- Main ---
async function main() {
  writePid();
  log(`[Daemon] 服务已启动 (PID ${process.pid})`);
  log(`[Daemon] 推送时间: ${morningTime.h}:${String(morningTime.m).padStart(2, "0")} (全量), ${afternoonTime.h}:${String(afternoonTime.m).padStart(2, "0")} (紧急)`);
  dingTalk(`[Daemon] 服务已启动，推送时间: ${process.env.SCHEDULE_MORNING || "08:00"} / ${process.env.SCHEDULE_AFTERNOON || "14:00"}`);

  // Check every 30 seconds
  const timer = setInterval(checkAndRun, 30_000);
  // Also run immediately on start
  checkAndRun();

  // Graceful shutdown
  function shutdown(sig) {
    log(`[Daemon] Received ${sig}, shutting down...`);
    clearInterval(timer);
    removePid();
    if (logStream) logStream.end();
    dingTalk("[Daemon] 服务已停止");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  log(`[Daemon] Fatal: ${e.message}`);
  removePid();
  process.exit(1);
});
