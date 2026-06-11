#!/usr/bin/env node

import "dotenv/config";
import inquirer from "inquirer";
import chalk from "chalk";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import dingTalk from "./dingtalk-webhook.js";
import { todoSummary, bookSummary } from "./summary-tasks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const logsDir = path.join(projectRoot, "logs");
const pidFile = path.join(logsDir, "daemon.pid");

// --- Service management ---
function getDaemonPid() {
  try {
    const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    process.kill(pid, 0); // check if alive
    return pid;
  } catch {
    return null;
  }
}

function startDaemon() {
  const pid = getDaemonPid();
  if (pid) {
    console.log(chalk.yellow(`Daemon already running (PID ${pid})`));
    return;
  }
  const daemonPath = path.join(__dirname, "daemon.js");
  const out = fs.openSync(path.join(logsDir, "daemon-stdout.log"), "a");
  const err = fs.openSync(path.join(logsDir, "daemon-stderr.log"), "a");
  const child = spawn(process.execPath, [daemonPath], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", out, err],
  });
  child.unref();
  console.log(chalk.green(`Daemon started (PID ${child.pid})`));
}

function stopDaemon() {
  const pid = getDaemonPid();
  if (!pid) {
    console.log(chalk.yellow("Daemon is not running"));
    return;
  }
  process.kill(pid, "SIGTERM");
  console.log(chalk.green(`Daemon stopped (PID ${pid})`));
}

function statusDaemon() {
  const pid = getDaemonPid();
  if (pid) {
    console.log(chalk.green(`Daemon running (PID ${pid})`));
  } else {
    console.log(chalk.red("Daemon not running"));
  }
  return pid;
}

// --- Log viewer ---
function latestLogFile() {
  if (!fs.existsSync(logsDir)) return null;
  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith("daemon-") && f.endsWith(".log"))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(logsDir, files[0]) : null;
}

async function viewLogs() {
  const logFile = latestLogFile();
  if (!logFile) {
    console.log(chalk.yellow("No logs found"));
    await pressAnyKey();
    return;
  }

  console.clear();
  console.log(chalk.cyan(`=== 实时日志 ${path.basename(logFile)} ===`));
  console.log(chalk.gray("按 q 返回菜单\n"));

  // Print last 30 lines first
  const content = fs.readFileSync(logFile, "utf8");
  const lines = content.split("\n");
  const start = Math.max(0, lines.length - 30);
  for (let i = start; i < lines.length; i++) {
    if (lines[i]) console.log(lines[i]);
  }

  // Watch for new lines
  let lastSize = fs.statSync(logFile).size;
  let quit = false;

  const watcher = fs.watch(logFile, () => {
    if (quit) return;
    try {
      const stat = fs.statSync(logFile);
      if (stat.size > lastSize) {
        const stream = fs.createReadStream(logFile, { start: lastSize, end: stat.size });
        stream.on("data", (chunk) => process.stdout.write(chunk));
        lastSize = stat.size;
      } else if (stat.size < lastSize) {
        // File rotated
        lastSize = 0;
      }
    } catch {}
  });

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", (str, key) => {
      if (key && (key.name === "q" || key.ctrl && key.name === "c")) {
        quit = true;
        watcher.close();
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
        console.clear();
        resolve();
      }
    });
  });
}

async function pressAnyKey() {
  console.log(chalk.gray("\n按回车返回..."));
  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => { rl.close(); resolve(); });
  });
}

// --- Manual trigger ---
async function manualTrigger(urgentOnly) {
  console.log(chalk.blue(urgentOnly ? "正在获取紧急汇总..." : "正在获取全量汇总..."));

  try {
    const todo = await todoSummary(urgentOnly);
    console.log(todo.log);
    if (todo.notify) {
      dingTalk(todo.notify);
      console.log(chalk.green("→ 已推送钉钉"));
    }
  } catch (e) {
    console.log(chalk.red(`Todolist error: ${e.message}`));
  }

  try {
    const books = await bookSummary(urgentOnly);
    console.log(books.log);
    if (books.notify) {
      dingTalk(books.notify);
      console.log(chalk.green("→ 已推送钉钉"));
    }
  } catch (e) {
    console.log(chalk.red(`图书馆 error: ${e.message}`));
  }

  await pressAnyKey();
}

// --- Send message ---
async function sendMessage() {
  const { msg } = await inquirer.prompt([
    { type: "input", name: "msg", message: "输入消息内容:" },
  ]);
  if (msg.trim()) {
    await dingTalk(msg.trim());
    console.log(chalk.green("已发送"));
  }
  await pressAnyKey();
}

// --- Main menu ---
async function main() {
  while (true) {
    const pid = getDaemonPid();
    const statusStr = pid
      ? chalk.green(`● running (PID ${pid})`)
      : chalk.red("○ stopped");

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: `${chalk.bold("ZJU Daemon TUI")}  状态: ${statusStr}`,
        choices: [
          { name: pid ? "停止服务" : "启动服务", value: "toggle" },
          { name: "刷新状态", value: "status" },
          { name: "查看实时日志", value: "logs" },
          new inquirer.Separator(),
          { name: "手动推送 - 全量汇总", value: "full" },
          { name: "手动推送 - 紧急汇总", value: "urgent" },
          { name: "发送钉钉消息", value: "send" },
          new inquirer.Separator(),
          { name: "退出", value: "exit" },
        ],
      },
    ]);

    if (action === "exit") break;
    if (action === "toggle") {
      pid ? stopDaemon() : startDaemon();
      await pressAnyKey();
    } else if (action === "status") {
      statusDaemon();
      await pressAnyKey();
    } else if (action === "logs") {
      await viewLogs();
    } else if (action === "full") {
      await manualTrigger(false);
    } else if (action === "urgent") {
      await manualTrigger(true);
    } else if (action === "send") {
      await sendMessage();
    }
  }
  console.clear();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
