#!/usr/bin/env node

import "dotenv/config";

import { spawn } from "child_process";
import fs from "fs";
import inquirer from "inquirer";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import {
  formatActionList,
  getAction,
  getActionCategories,
} from "./action-registry.js";
import { runAction, runSummaryTasks } from "./action-runner.js";
import dingTalk from "./dingtalk-webhook.js";
import {
  daemonStatus,
  latestLogFile,
  readLastLines,
  restartDaemon,
  startDaemon,
  stopDaemon,
} from "./service-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function printUsage() {
  console.log(`Usage: zlb <command>

Commands:
  menu                  Open the script selector
  tui                   Open the daemon management TUI
  start                 Start the daemon in background
  stop                  Stop the daemon
  restart               Restart the daemon
  status                Show daemon status
  logs                  Tail the latest daemon log
  actions               List registered actions
  run <action> [args]   Run a registered action
  full                  Run full summary and push notifications
  urgent                Run urgent summary and push notifications
  send [message]        Send a DingTalk text message
  test                  Send a DingTalk test message
  help                  Show this help
`);
}

async function pressEnter() {
  console.log("\n按回车返回菜单...");
  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

function runNodeFile(relativePath, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(projectRoot, relativePath), ...args], {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => resolve(code || 0));
  });
}

async function followLogs() {
  const logFile = latestLogFile();
  if (!logFile) {
    console.error("No log files found");
    process.exitCode = 1;
    return;
  }

  console.log(`Tailing ${logFile} (Ctrl+C to exit)\n`);
  const initial = readLastLines(logFile, 40);
  if (initial) console.log(initial);

  let lastSize = fs.statSync(logFile).size;
  const watcher = fs.watch(logFile, () => {
    try {
      const stat = fs.statSync(logFile);
      if (stat.size > lastSize) {
        fs.createReadStream(logFile, { start: lastSize, end: stat.size }).pipe(process.stdout);
        lastSize = stat.size;
      } else if (stat.size < lastSize) {
        lastSize = 0;
      }
    } catch {}
  });

  await new Promise((resolve) => {
    process.on("SIGINT", () => {
      watcher.close();
      resolve();
    });
  });
}

async function runActionFromCli(actionId, args = []) {
  const action = getAction(actionId);
  if (!action) {
    console.error(`Unknown action: ${actionId}`);
    console.log(formatActionList());
    process.exitCode = 1;
    return;
  }

  const result = await runAction(action, args, {
    allowInteractive: process.stdin.isTTY,
    capture: false,
    notify: true,
  });
  if (result.output) console.log(result.output);
  if (!result.ok) process.exitCode = 1;
}

async function sendMessage(args) {
  let msg = args.join(" ").trim();
  if (!msg) {
    const answer = await inquirer.prompt([
      { type: "input", name: "msg", message: "输入消息内容:" },
    ]);
    msg = answer.msg.trim();
  }
  if (!msg) return;
  await dingTalk(msg);
  console.log("已发送");
}

async function interactiveMenu() {
  const BACK = "__back__";
  const EXIT = "__exit__";

  while (true) {
    const categories = getActionCategories();
    const { categoryId } = await inquirer.prompt([
      {
        type: "list",
        name: "categoryId",
        message: "请选择分类:",
        choices: [
          ...categories.map((category) => ({
            name: category.name,
            value: category.id,
          })),
          new inquirer.Separator(),
          { name: "Daemon TUI", value: "__tui__" },
          { name: "退出", value: EXIT },
        ],
        pageSize: 12,
      },
    ]);

    if (categoryId === EXIT) break;
    if (categoryId === "__tui__") {
      await runNodeFile("shared/tui.js");
      continue;
    }

    const category = categories.find((item) => item.id === categoryId);
    if (!category) continue;

    while (true) {
      const { actionId } = await inquirer.prompt([
        {
          type: "list",
          name: "actionId",
          message: `${category.name} >`,
          choices: [
            { name: "返回上级", value: BACK },
            new inquirer.Separator(),
            ...category.actions.map((action) => ({
              name: `${action.name} (${action.id})`,
              value: action.id,
            })),
            ...(category.id === "dingtalk"
              ? [{ name: "发送消息", value: "__dingtalk_send__" }]
              : []),
          ],
          pageSize: 14,
        },
      ]);

      if (actionId === BACK) break;
      if (actionId === "__dingtalk_send__") {
        await sendMessage([]);
        await pressEnter();
        continue;
      }

      await runActionFromCli(actionId);
      await pressEnter();
    }
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "menu") {
    await interactiveMenu();
    return;
  }

  if (["help", "-h", "--help"].includes(command)) {
    printUsage();
    return;
  }

  if (command === "tui") {
    process.exitCode = await runNodeFile("shared/tui.js", args);
    return;
  }

  if (command === "start") {
    const result = await startDaemon();
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "stop") {
    const result = await stopDaemon();
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "restart") {
    const result = await restartDaemon();
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "status") {
    console.log(daemonStatus().message);
    return;
  }

  if (command === "logs") {
    await followLogs();
    return;
  }

  if (command === "actions") {
    console.log(formatActionList());
    return;
  }

  if (command === "run") {
    await runActionFromCli(args[0], args.slice(1));
    return;
  }

  if (command === "full") {
    const result = await runSummaryTasks(false, { notify: true });
    console.log(result.output);
    return;
  }

  if (command === "urgent") {
    const result = await runSummaryTasks(true, { notify: true });
    console.log(result.output);
    return;
  }

  if (command === "send") {
    await sendMessage(args);
    return;
  }

  if (command === "test") {
    await runActionFromCli("dingtalk-test");
    return;
  }

  if (getAction(command)) {
    await runActionFromCli(command, args);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
