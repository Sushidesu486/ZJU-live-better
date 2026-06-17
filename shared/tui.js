#!/usr/bin/env node

import "./load-env.js";

import chalk from "chalk";
import { spawn } from "child_process";
import fs from "fs";
import inquirer from "inquirer";
import path from "path";
import readline from "readline";
import { runSummaryTasks } from "./action-runner.js";
import dingTalk from "./dingtalk-webhook.js";
import {
  latestLogFile,
  readLastLines,
  serviceStatus,
  startService,
  stopService,
  systemdLogArgs,
} from "./service-manager.js";

async function pressAnyKey() {
  console.log(chalk.gray("\n按回车返回..."));
  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

async function viewLogs(serviceId = "daemon") {
  const logFile = latestLogFile(serviceId);
  if (!logFile) {
    const journalArgs = systemdLogArgs(serviceId, { follow: true, lines: 30 });
    if (journalArgs) {
      console.clear();
      console.log(chalk.cyan(`=== systemd 日志 ${serviceId} ===`));
      console.log(chalk.gray("按 q 返回菜单\n"));

      const child = spawn("journalctl", journalArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk) => process.stdout.write(chunk));
      child.stderr.on("data", (chunk) => process.stderr.write(chunk));

      await new Promise((resolve) => {
        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        process.stdin.resume();
        let done = false;
        const cleanup = () => {
          if (done) return;
          done = true;
          child.kill("SIGTERM");
          process.stdin.off("keypress", onKeypress);
          if (process.stdin.isTTY) process.stdin.setRawMode(false);
          process.stdin.pause();
          console.clear();
          resolve();
        };
        const onKeypress = (str, key) => {
          if (key && (key.name === "q" || (key.ctrl && key.name === "c"))) cleanup();
        };
        child.on("exit", cleanup);
        process.stdin.on("keypress", onKeypress);
      });
      return;
    }

    console.log(chalk.yellow("No logs found"));
    await pressAnyKey();
    return;
  }

  console.clear();
  console.log(chalk.cyan(`=== 实时日志 ${path.basename(logFile)} ===`));
  console.log(chalk.gray("按 q 返回菜单\n"));
  const lastLines = readLastLines(logFile, 30);
  if (lastLines) console.log(lastLines);

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
        lastSize = 0;
      }
    } catch {}
  });

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    const onKeypress = (str, key) => {
      if (key && (key.name === "q" || (key.ctrl && key.name === "c"))) {
        quit = true;
        watcher.close();
        process.stdin.off("keypress", onKeypress);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
        console.clear();
        resolve();
      }
    };
    process.stdin.on("keypress", onKeypress);
  });
}

async function manualTrigger(urgentOnly) {
  console.log(chalk.blue(urgentOnly ? "正在获取紧急汇总..." : "正在获取全量汇总..."));
  const result = await runSummaryTasks(urgentOnly, { notify: true });
  console.log(result.output);
  console.log(chalk.green("完成；如有可推送内容已推送钉钉。"));
  await pressAnyKey();
}

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

async function main() {
  while (true) {
    const status = serviceStatus("daemon");
    const autosignStatus = serviceStatus("autosign");
    const statusStr = status.running
      ? chalk.green(`● running (PID ${status.pid})`)
      : chalk.red("○ stopped");
    const autosignStatusStr = autosignStatus.running
      ? chalk.green(`● autosign (PID ${autosignStatus.pid})`)
      : chalk.red("○ autosign stopped");

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: `${chalk.bold("ZJU Service TUI")}  daemon: ${statusStr}  ${autosignStatusStr}`,
        choices: [
          { name: status.running ? "停止服务" : "启动服务", value: "toggle" },
          { name: autosignStatus.running ? "停止自动签到" : "启动自动签到", value: "toggle-autosign" },
          { name: "刷新状态", value: "status" },
          { name: "查看 daemon 实时日志", value: "logs" },
          { name: "查看自动签到实时日志", value: "logs-autosign" },
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
      const result = status.running ? await stopService("daemon") : await startService("daemon");
      console.log(result.ok ? chalk.green(result.message) : chalk.red(result.message));
      await pressAnyKey();
    } else if (action === "toggle-autosign") {
      const result = autosignStatus.running
        ? await stopService("autosign")
        : await startService("autosign");
      console.log(result.ok ? chalk.green(result.message) : chalk.red(result.message));
      await pressAnyKey();
    } else if (action === "status") {
      console.log(status.running ? chalk.green(status.message) : chalk.red(status.message));
      console.log(autosignStatus.running ? chalk.green(autosignStatus.message) : chalk.red(autosignStatus.message));
      await pressAnyKey();
    } else if (action === "logs") {
      await viewLogs("daemon");
    } else if (action === "logs-autosign") {
      await viewLogs("autosign");
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
