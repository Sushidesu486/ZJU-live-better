import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import dingTalk from "./dingtalk-webhook.js";
import { getAction } from "./action-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_CAPTURE_CHARS = 20_000;

class ActionNotRunnableError extends Error {
  constructor(action) {
    const suffix = action.usage ? ` 用法: ${action.usage}` : "";
    super(`${action.name} 仍需要终端交互，暂不能直接通过 bot 后台运行。${suffix}`);
    this.name = "ActionNotRunnableError";
  }
}

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function truncateOutput(value, maxChars = MAX_CAPTURE_CHARS) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.floor(maxChars / 2))}\n\n... output truncated ...\n\n${value.slice(-Math.floor(maxChars / 2))}`;
}

async function runSummaryTasks(urgentOnly = false, { notify = false } = {}) {
  const { bookSummary, todoSummary } = await import("./summary-tasks.js");
  const lines = [];

  try {
    const todo = await todoSummary(urgentOnly);
    lines.push(todo.log);
    if (notify && todo.notify) await dingTalk(todo.notify);
  } catch (error) {
    lines.push(`[Todolist] Error: ${error.message}`);
  }

  try {
    const books = await bookSummary(urgentOnly);
    lines.push(books.log);
    if (notify && books.notify) await dingTalk(books.notify);
  } catch (error) {
    lines.push(`[图书馆] Error: ${error.message}`);
  }

  return {
    ok: true,
    output: lines.filter(Boolean).join("\n\n") || "No summary output.",
  };
}

function runScript(action, args = [], options = {}) {
  const {
    allowInteractive = false,
    capture = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  if ((action.interactive || action.longRunning) && !allowInteractive) {
    throw new ActionNotRunnableError(action);
  }

  const scriptPath = path.join(projectRoot, action.script);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: projectRoot,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = capture
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, timeoutMs)
      : null;

    if (capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > MAX_CAPTURE_CHARS * 2) {
          stdout = stdout.slice(-MAX_CAPTURE_CHARS);
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > MAX_CAPTURE_CHARS * 2) {
          stderr = stderr.slice(-MAX_CAPTURE_CHARS);
        }
      });
    }

    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        output: "",
        error: error.message,
      });
    });

    child.on("exit", (code, signal) => {
      if (timer) clearTimeout(timer);
      const cleanOutput = stripAnsi([stdout.trim(), stderr.trim()].filter(Boolean).join("\n"));
      resolve({
        ok: code === 0 && !timedOut,
        code,
        signal,
        timedOut,
        output: truncateOutput(cleanOutput || (code === 0 ? "Script completed." : "")),
        error: timedOut ? `Timed out after ${timeoutMs} ms.` : null,
      });
    });
  });
}

async function runAction(actionId, args = [], options = {}) {
  const action = typeof actionId === "string" ? getAction(actionId) : actionId;
  if (!action) {
    return {
      ok: false,
      output: `Unknown action: ${actionId}`,
    };
  }

  if (action.type === "summary") {
    return runSummaryTasks(action.urgentOnly, options);
  }

  if (action.type === "dingtalk-test") {
    await dingTalk("[DingTalk] 连接测试成功！");
    return {
      ok: true,
      output: "DingTalk test message sent.",
    };
  }

  if (action.type === "script") {
    if (action.requiresArgs && args.length === 0 && !options.allowInteractive) {
      return {
        ok: false,
        output: `Action requires arguments. Usage: ${action.usage}`,
      };
    }
    return runScript(action, args, options);
  }

  return {
    ok: false,
    output: `Unsupported action type: ${action.type}`,
  };
}

export {
  ActionNotRunnableError,
  projectRoot,
  runAction,
  runScript,
  runSummaryTasks,
  truncateOutput,
};
