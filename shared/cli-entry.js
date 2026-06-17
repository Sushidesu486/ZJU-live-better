#!/usr/bin/env node

import "./load-env.js";

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
  latestLogFile,
  listServices,
  readLastLines,
  restartService,
  serviceStatus,
  startService,
  stopService,
  systemdLogArgs,
} from "./service-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function printUsage() {
  console.log(`Usage: zbl <command>

Commands:
  menu                  Open the interactive menu
  tui                   Open the background service manager
  start [service]       Start daemon or autosign in background
  stop [service]        Stop daemon or autosign
  restart [service]     Restart daemon or autosign
  status [service]      Show service status
  services              List managed services
  logs [service]        Tail the latest service log
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

function normalizeServiceId(value) {
  return value || "daemon";
}

function splitCommand(input) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

async function promptActionArgs(action, args = []) {
  if (args.length > 0 || !process.stdin.isTTY) return args;

  if (action.id === "zhihuishu") {
    const { mode } = await inquirer.prompt([
      {
        type: "list",
        name: "mode",
        message: "智慧树运行方式:",
        choices: [
          { name: "使用 execution.json / 自动处理已保存课程", value: "default" },
          { name: "指定普通课程 ID", value: "course" },
          { name: "指定 AI 课程 ID 和班级 ID", value: "ai" },
          { name: "手动输入完整参数", value: "raw" },
        ],
      },
    ]);

    if (mode === "course") {
      const { courseIds } = await inquirer.prompt([
        {
          type: "input",
          name: "courseIds",
          message: "课程 ID，多个用空格分隔:",
          validate: (value) => value.trim() ? true : "请输入课程 ID",
        },
      ]);
      return ["-c", ...splitCommand(courseIds)];
    }

    if (mode === "ai") {
      const answer = await inquirer.prompt([
        {
          type: "input",
          name: "courseId",
          message: "AI 课程 ID:",
          validate: (value) => value.trim() ? true : "请输入 AI 课程 ID",
        },
        {
          type: "input",
          name: "classId",
          message: "班级 ID:",
          validate: (value) => value.trim() ? true : "请输入班级 ID",
        },
      ]);
      return ["-ai", answer.courseId.trim(), answer.classId.trim()];
    }

    if (mode === "raw") {
      const { raw } = await inquirer.prompt([
        {
          type: "input",
          name: "raw",
          message: "main.py 参数:",
          filter: (value) => value.trim(),
        },
      ]);
      return splitCommand(raw);
    }
  }

  if (action.requiresArgs) {
    const { raw } = await inquirer.prompt([
      {
        type: "input",
        name: "raw",
        message: `参数 (${action.usage || action.id}):`,
        filter: (value) => value.trim(),
      },
    ]);
    return splitCommand(raw);
  }

  return args;
}

async function followLogs(serviceId = "daemon") {
  const logFile = latestLogFile(serviceId);
  if (!logFile) {
    const journalArgs = systemdLogArgs(serviceId, { follow: true, lines: 40 });
    if (journalArgs) {
      console.log(`Tailing systemd journal for ${serviceId} (Ctrl+C to exit)\n`);
      await new Promise((resolve) => {
        const child = spawn("journalctl", journalArgs, {
          stdio: "inherit",
        });
        child.on("exit", () => resolve());
        child.on("error", (error) => {
          console.error(`Failed to read journal: ${error.message}`);
          resolve();
        });
      });
      return;
    }
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

  const finalArgs = await promptActionArgs(action, args);
  const result = await runAction(action, finalArgs, {
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
        message: "zbl 统一管理入口:",
        choices: [
          { name: "后台服务管理", value: "__services__" },
          new inquirer.Separator(),
          ...categories.map((category) => ({
            name: category.name,
            value: category.id,
          })),
          new inquirer.Separator(),
          { name: "退出", value: EXIT },
        ],
        pageSize: 12,
      },
    ]);

    if (categoryId === EXIT) break;
    if (categoryId === "__services__") {
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
    const result = await startService(normalizeServiceId(args[0]));
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "stop") {
    const result = await stopService(normalizeServiceId(args[0]));
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "restart") {
    const result = await restartService(normalizeServiceId(args[0]));
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "status") {
    console.log(serviceStatus(normalizeServiceId(args[0])).message);
    return;
  }

  if (command === "services") {
    for (const service of listServices()) {
      console.log(`${service.id}: ${serviceStatus(service.id).message}`);
    }
    return;
  }

  if (command === "logs") {
    await followLogs(normalizeServiceId(args[0]));
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
