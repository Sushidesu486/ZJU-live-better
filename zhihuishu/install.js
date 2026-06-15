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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!fs.existsSync(venvPython)) {
  console.log(`[zhihuishu] Creating Python venv at ${venvDir}`);
  run(python, ["-m", "venv", venvDir]);
}

console.log("[zhihuishu] Installing Python dependencies");
run(venvPython, ["-m", "pip", "install", "-r", path.join(__dirname, "requirements.txt")]);
console.log("[zhihuishu] Ready");
