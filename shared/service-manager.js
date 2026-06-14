import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const logsDir = path.join(projectRoot, "logs");
const daemonPath = path.join(__dirname, "daemon.js");

const serviceDefinitions = {
  daemon: {
    id: "daemon",
    name: "Daemon",
    entryPath: daemonPath,
    pidFile: path.join(logsDir, "daemon.pid"),
    stdoutLog: path.join(logsDir, "daemon-stdout.log"),
    stderrLog: path.join(logsDir, "daemon-stderr.log"),
  },
  autosign: {
    id: "autosign",
    name: "Auto Sign-in",
    entryPath: path.join(projectRoot, "courses.zju/autosign.js"),
    pidFile: path.join(logsDir, "autosign.pid"),
    stdoutLog: path.join(logsDir, "autosign-stdout.log"),
    stderrLog: path.join(logsDir, "autosign-stderr.log"),
  },
};

const pidFile = serviceDefinitions.daemon.pidFile;

function ensureLogsDir() {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getServiceDefinition(serviceId = "daemon") {
  const service = serviceDefinitions[serviceId];
  if (!service) {
    throw new Error(`Unknown service: ${serviceId}`);
  }
  return service;
}

function listServices() {
  return Object.values(serviceDefinitions);
}

function getServicePid(serviceId = "daemon") {
  const service = getServiceDefinition(serviceId);
  let pid = null;
  try {
    pid = Number.parseInt(fs.readFileSync(service.pidFile, "utf8").trim(), 10);
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
      fs.unlinkSync(service.pidFile);
    } catch {}
    return null;
  }
}

function getDaemonPid() {
  return getServicePid("daemon");
}

async function waitForStatus(serviceId, expectedRunning, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const pid = getServicePid(serviceId);
    if (expectedRunning ? pid : !pid) return pid;
    await sleep(200);
  }
  return getServicePid(serviceId);
}

async function startService(serviceId = "daemon", { wait = true } = {}) {
  const service = getServiceDefinition(serviceId);
  ensureLogsDir();
  const currentPid = getServicePid(service.id);
  if (currentPid) {
    return {
      ok: true,
      changed: false,
      pid: currentPid,
      message: `${service.name} already running (PID ${currentPid})`,
    };
  }

  const out = fs.openSync(service.stdoutLog, "a");
  const err = fs.openSync(service.stderrLog, "a");
  const child = spawn(process.execPath, [service.entryPath], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", out, err],
    env: process.env,
  });
  fs.writeFileSync(service.pidFile, String(child.pid));
  child.unref();

  const pid = wait ? await waitForStatus(service.id, true) : child.pid;
  if (!pid) {
    return {
      ok: false,
      changed: false,
      pid: null,
      message: `Failed to start ${service.name}, check ${path.relative(projectRoot, service.stderrLog)}`,
    };
  }

  return {
    ok: true,
    changed: true,
    pid,
    message: `${service.name} started (PID ${pid})`,
  };
}

async function startDaemon(options = {}) {
  return startService("daemon", options);
}

async function stopService(serviceId = "daemon", { wait = true } = {}) {
  const service = getServiceDefinition(serviceId);
  const pid = getServicePid(service.id);
  if (!pid) {
    return {
      ok: true,
      changed: false,
      pid: null,
      message: `${service.name} is not running`,
    };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    return {
      ok: false,
      changed: false,
      pid,
      message: `Failed to stop ${service.name} (PID ${pid}): ${error.message}`,
    };
  }
  if (!wait) {
    return {
      ok: true,
      changed: true,
      pid,
      message: `Stop signal sent to ${service.name} (PID ${pid})`,
    };
  }
  const alivePid = await waitForStatus(service.id, false);
  try {
    if (!alivePid) fs.unlinkSync(service.pidFile);
  } catch {}

  return {
    ok: !alivePid,
    changed: true,
    pid,
    message: alivePid
      ? `${service.name} did not stop (PID ${pid})`
      : `${service.name} stopped (PID ${pid})`,
  };
}

async function stopDaemon(options = {}) {
  return stopService("daemon", options);
}

async function restartService(serviceId = "daemon") {
  const stopped = await stopService(serviceId);
  const started = await startService(serviceId);
  return {
    ok: stopped.ok && started.ok,
    message: `${stopped.message}\n${started.message}`,
    stopped,
    started,
  };
}

async function restartDaemon() {
  return restartService("daemon");
}

function serviceStatus(serviceId = "daemon") {
  const service = getServiceDefinition(serviceId);
  const pid = getServicePid(service.id);
  return {
    running: Boolean(pid),
    pid,
    message: pid ? `${service.name} running (PID ${pid})` : `${service.name} not running`,
  };
}

function daemonStatus() {
  return serviceStatus("daemon");
}

function latestLogFile(serviceId = "daemon") {
  const service = getServiceDefinition(serviceId);
  if (!fs.existsSync(logsDir)) return null;
  const files = fs
    .readdirSync(logsDir)
    .filter((file) => file.startsWith(`${service.id}-`) && file.endsWith(".log"))
    .map((file) => path.join(logsDir, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files.length > 0 ? files[0] : null;
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
  getServiceDefinition,
  getServicePid,
  latestLogFile,
  listServices,
  logsDir,
  pidFile,
  projectRoot,
  readLastLines,
  restartDaemon,
  restartService,
  serviceStatus,
  startDaemon,
  startService,
  stopDaemon,
  stopService,
};
