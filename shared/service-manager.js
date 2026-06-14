import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const logsDir = path.join(projectRoot, "logs");
const pidFile = path.join(logsDir, "daemon.pid");
const daemonPath = path.join(__dirname, "daemon.js");

function ensureLogsDir() {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDaemonPid() {
  let pid = null;
  try {
    pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (!pid) return null;
  } catch {
    return null;
  }

  try {
    process.kill(pid, 0);
    return pid;
  } catch (error) {
    if (error.code === "EPERM") return pid;
    try {
      fs.unlinkSync(pidFile);
    } catch {}
    return null;
  }
}

async function waitForStatus(expectedRunning, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const pid = getDaemonPid();
    if (expectedRunning ? pid : !pid) return pid;
    await sleep(200);
  }
  return getDaemonPid();
}

async function startDaemon({ wait = true } = {}) {
  ensureLogsDir();
  const currentPid = getDaemonPid();
  if (currentPid) {
    return {
      ok: true,
      changed: false,
      pid: currentPid,
      message: `Daemon already running (PID ${currentPid})`,
    };
  }

  const out = fs.openSync(path.join(logsDir, "daemon-stdout.log"), "a");
  const err = fs.openSync(path.join(logsDir, "daemon-stderr.log"), "a");
  const child = spawn(process.execPath, [daemonPath], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", out, err],
    env: process.env,
  });
  child.unref();

  const pid = wait ? await waitForStatus(true) : child.pid;
  if (!pid) {
    return {
      ok: false,
      changed: false,
      pid: null,
      message: "Failed to start daemon, check logs/daemon-stderr.log",
    };
  }

  return {
    ok: true,
    changed: true,
    pid,
    message: `Daemon started (PID ${pid})`,
  };
}

async function stopDaemon({ wait = true } = {}) {
  const pid = getDaemonPid();
  if (!pid) {
    return {
      ok: true,
      changed: false,
      pid: null,
      message: "Daemon is not running",
    };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    return {
      ok: false,
      changed: false,
      pid,
      message: `Failed to stop daemon (PID ${pid}): ${error.message}`,
    };
  }
  if (!wait) {
    return {
      ok: true,
      changed: true,
      pid,
      message: `Stop signal sent to daemon (PID ${pid})`,
    };
  }
  const alivePid = await waitForStatus(false);
  try {
    if (!alivePid) fs.unlinkSync(pidFile);
  } catch {}

  return {
    ok: !alivePid,
    changed: true,
    pid,
    message: alivePid ? `Daemon did not stop (PID ${pid})` : `Daemon stopped (PID ${pid})`,
  };
}

async function restartDaemon() {
  const stopped = await stopDaemon();
  const started = await startDaemon();
  return {
    ok: stopped.ok && started.ok,
    message: `${stopped.message}\n${started.message}`,
    stopped,
    started,
  };
}

function daemonStatus() {
  const pid = getDaemonPid();
  return {
    running: Boolean(pid),
    pid,
    message: pid ? `Daemon running (PID ${pid})` : "Daemon not running",
  };
}

function latestLogFile() {
  if (!fs.existsSync(logsDir)) return null;
  const files = fs
    .readdirSync(logsDir)
    .filter((file) => file.startsWith("daemon-") && file.endsWith(".log"))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(logsDir, files[0]) : null;
}

function readLastLines(filePath, count = 30) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  return lines.slice(Math.max(0, lines.length - count)).join("\n").trim();
}

export {
  daemonPath,
  daemonStatus,
  ensureLogsDir,
  getDaemonPid,
  latestLogFile,
  logsDir,
  pidFile,
  projectRoot,
  readLastLines,
  restartDaemon,
  startDaemon,
  stopDaemon,
};
