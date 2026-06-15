import "dotenv/config";

import express from "express";
import { formatActionList, getAction } from "./action-registry.js";
import { runAction, runSummaryTasks, truncateOutput } from "./action-runner.js";
import {
  listServices,
  restartService,
  serviceStatus,
  startService,
  stopService,
} from "./service-manager.js";
import { sendDingTalkText } from "./dingtalk-webhook.js";

const DEFAULT_PORT = 8787;
const DEFAULT_PATH = "/dingtalk/callback";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_REPLY_CHARS = 3500;

function botEnabled() {
  return process.env.ENABLE_DINGTALK_BOT === "true";
}

function dingTalkTextResponse(content) {
  return {
    msgtype: "text",
    text: {
      content,
    },
  };
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

function extractMessageText(body) {
  return String(
    body?.text?.content ??
      body?.content ??
      body?.msg ??
      body?.message ??
      ""
  ).trim();
}

function requireToken(req) {
  const token = process.env.DINGTALK_BOT_TOKEN;
  if (!token) return true;
  return req.query.token === token || req.get("x-zlb-token") === token;
}

function botHelp() {
  return [
    "ZJU-live-better bot commands:",
    "- help/menu/actions: 查看命令或功能列表",
    "- services: 查看 daemon/autosign 状态",
    "- status [daemon|autosign]: 查看服务状态",
    "- start [daemon|autosign]: 启动服务",
    "- stop [daemon|autosign]: 停止服务",
    "- restart [daemon|autosign]: 重启服务",
    "- full: 执行全量汇总",
    "- urgent: 执行紧急汇总",
    "- run <action-id> [args...]: 执行可后台运行的功能",
    "- test: 发送钉钉测试消息",
    "",
    "示例:",
    "- status autosign",
    "- start autosign",
    "- run todolist",
    "- run reliable-todolist",
    "- run zhihuishu-help",
    "- run zhihuishu-fetch",
    "- run zhihuishu -c <courseId>",
    "- run webplus-save-doc -u https://example.zju.edu.cn/...",
  ].join("\n");
}

function isLongCommand(tokens) {
  const command = tokens[0]?.toLowerCase();
  return ["full", "urgent", "run", "执行", "全量", "紧急", "汇总"].includes(command);
}

function replyTarget(body) {
  return body?.sessionWebhook || "";
}

async function sendAsyncReply(body, text) {
  const sessionWebhook = replyTarget(body);
  if (sessionWebhook) {
    return sendDingTalkText(text, { webhook: sessionWebhook, force: true });
  }
  return sendDingTalkText(text, { force: true });
}

async function runBotCommand(text) {
  const tokens = splitCommand(text);
  const command = tokens[0]?.toLowerCase();

  if (!command || ["help", "菜单", "帮助"].includes(command)) {
    return { text: botHelp() };
  }

  if (["menu", "actions", "list", "功能"].includes(command)) {
    return {
      text: `可用 bot 功能:\n${formatActionList({ botOnly: true })}\n\n终端专用功能:\n${formatActionList({ terminalOnly: true })}`,
    };
  }

  if (["status", "状态"].includes(command)) {
    return { text: serviceStatus(tokens[1] || "daemon").message };
  }

  if (["services", "服务"].includes(command)) {
    return {
      text: listServices()
        .map((service) => `${service.id}: ${serviceStatus(service.id).message}`)
        .join("\n"),
    };
  }

  if (["start", "启动"].includes(command)) {
    const result = await startService(tokens[1] || "daemon");
    return { text: result.message };
  }

  if (["stop", "停止"].includes(command)) {
    const serviceId = tokens[1] || "daemon";
    if (serviceId !== "daemon") {
      const result = await stopService(serviceId);
      return { text: result.message };
    }
    return {
      text: "Daemon stopping...",
      afterResponse: () => setTimeout(() => stopService("daemon", { wait: false }), 200),
    };
  }

  if (["restart", "重启"].includes(command)) {
    const result = await restartService(tokens[1] || "daemon");
    return { text: result.message };
  }

  if (command === "autosign" || command === "自动签到") {
    const action = tokens[1]?.toLowerCase() || "status";
    if (["start", "启动"].includes(action)) {
      return { text: (await startService("autosign")).message };
    }
    if (["stop", "停止"].includes(action)) {
      return { text: (await stopService("autosign")).message };
    }
    if (["restart", "重启"].includes(action)) {
      return { text: (await restartService("autosign")).message };
    }
    return { text: serviceStatus("autosign").message };
  }

  if (["full", "全量", "汇总"].includes(command)) {
    const result = await runSummaryTasks(false, { notify: false });
    return { text: result.output };
  }

  if (["urgent", "紧急"].includes(command)) {
    const result = await runSummaryTasks(true, { notify: false });
    return { text: result.output };
  }

  if (["test", "测试"].includes(command)) {
    const result = await sendDingTalkText("[DingTalk] bot 连接测试成功", {
      force: true,
    });
    return {
      text: result.ok ? "DingTalk test message sent." : "DingTalk test message skipped or failed.",
    };
  }

  if (["run", "执行"].includes(command)) {
    const actionId = tokens[1];
    if (!actionId) {
      return { text: `Usage: run <action-id> [args...]\n\n${formatActionList({ botOnly: true })}` };
    }

    const action = getAction(actionId);
    if (!action) {
      return { text: `Unknown action: ${actionId}\n\n${formatActionList({ botOnly: true })}` };
    }
    if (!action.botRunnable) {
      const usage = action.usage ? `\n${action.usage}` : "";
      return {
        text: `${action.name} 目前仍是终端交互功能，不能直接在 bot 后台运行。${usage}`,
      };
    }

    const timeoutMs = action.botTimeoutMs ?? Number.parseInt(
      process.env.DINGTALK_BOT_RUN_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS),
      10
    );
    const result = await runAction(action, tokens.slice(2), {
      capture: true,
      allowInteractive: false,
      timeoutMs,
    });
    const status = result.ok ? "OK" : "FAILED";
    const output = result.error
      ? `${result.output}\n${result.error}`.trim()
      : result.output;
    return {
      text: `[${status}] ${action.id}\n${output || "No output."}`,
    };
  }

  return {
    text: `Unknown command: ${tokens[0]}\n\n${botHelp()}`,
  };
}

function startDingTalkBotServer({ log = console.log } = {}) {
  if (!botEnabled()) {
    log("[DingTalk Bot] disabled; set ENABLE_DINGTALK_BOT=true to enable callback server.");
    return null;
  }

  const app = express();
  const port = Number.parseInt(process.env.DINGTALK_BOT_PORT || String(DEFAULT_PORT), 10);
  const host = process.env.DINGTALK_BOT_HOST || "0.0.0.0";
  const callbackPath = process.env.DINGTALK_BOT_PATH || DEFAULT_PATH;

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.get("/healthz", (req, res) => {
    res.json({ ok: true, service: "zju-live-better" });
  });

  app.post(callbackPath, async (req, res) => {
    if (!requireToken(req)) {
      res.status(401).json(dingTalkTextResponse("Unauthorized"));
      return;
    }

    const text = extractMessageText(req.body);
    if (!text) {
      res.json(dingTalkTextResponse(botHelp()));
      return;
    }

    const tokens = splitCommand(text);
    const shouldRunAsync = isLongCommand(tokens) && Boolean(replyTarget(req.body));

    if (shouldRunAsync) {
      res.json(dingTalkTextResponse(`收到: ${text}\n正在后台执行，完成后会返回结果。`));
      runBotCommand(text)
        .then(async (result) => {
          await sendAsyncReply(
            req.body,
            truncateOutput(result.text, MAX_REPLY_CHARS)
          );
          if (result.afterResponse) result.afterResponse();
        })
        .catch((error) => {
          sendAsyncReply(req.body, `[ERROR] ${error.message}`);
        });
      return;
    }

    try {
      const result = await runBotCommand(text);
      res.json(dingTalkTextResponse(truncateOutput(result.text, MAX_REPLY_CHARS)));
      if (result.afterResponse) result.afterResponse();
    } catch (error) {
      res.json(dingTalkTextResponse(`[ERROR] ${error.message}`));
    }
  });

  const server = app.listen(port, host, () => {
    log(`[DingTalk Bot] listening on ${host}:${port}${callbackPath}`);
    if (!process.env.DINGTALK_BOT_TOKEN) {
      log("[DingTalk Bot] DINGTALK_BOT_TOKEN is not set; callback endpoint has no token check.");
    }
  });
  server.on("error", (error) => {
    log(`[DingTalk Bot] failed to listen on ${host}:${port}: ${error.message}`);
  });

  return {
    server,
    close: () =>
      new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
      }),
  };
}

export { botEnabled, runBotCommand, startDingTalkBotServer };
