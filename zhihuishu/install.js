#!/usr/bin/env node

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const venvDir = path.join(__dirname, ".venv");
const python = process.env.PYTHON || "python3";
const venvPython = process.platform === "win32"
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");

function spawnCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
}

function tryRun(command, args, options = {}) {
  const result = spawnCommand(command, args, options);
  return result.status === 0;
}

function run(command, args, options = {}) {
  const result = spawnCommand(command, args, options);
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function hasPip() {
  return fs.existsSync(venvPython)
    && tryRun(venvPython, ["-m", "pip", "--version"], { stdio: "ignore" });
}

function createOrRepairVenv() {
  if (fs.existsSync(venvPython)) {
    console.log(`[zhihuishu] Python venv exists but pip is unavailable; repairing ${venvDir}`);
  } else {
    console.log(`[zhihuishu] Creating Python venv at ${venvDir}`);
  }

  if (tryRun(python, ["-m", "venv", venvDir])) return;

  console.log("[zhihuishu] python -m venv failed; trying python -m virtualenv");
  if (tryRun(python, ["-m", "virtualenv", venvDir])) return;

  console.error("[zhihuishu] Failed to create a usable Python virtual environment.");
  console.error("[zhihuishu] Install python3-venv, or install virtualenv for this user and rerun this command.");
  process.exit(1);
}

if (!hasPip()) {
  createOrRepairVenv();
}

if (!hasPip()) {
  console.error("[zhihuishu] Python virtual environment is missing pip.");
  process.exit(1);
}

console.log("[zhihuishu] Installing Python dependencies");
run(venvPython, ["-m", "pip", "install", "-r", path.join(__dirname, "requirements.txt")]);
console.log("[zhihuishu] Ready");
