#!/usr/bin/env node

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const venvPython = process.platform === "win32"
  ? path.join(__dirname, ".venv", "Scripts", "python.exe")
  : path.join(__dirname, ".venv", "bin", "python");

function resolvePython() {
  if (process.env.ZHS_PYTHON) return process.env.ZHS_PYTHON;
  if (fs.existsSync(venvPython)) return venvPython;
  return process.env.PYTHON || "python3";
}

const args = process.argv.slice(2);
const child = spawn(resolvePython(), [path.join(__dirname, "main.py"), ...args], {
  cwd: __dirname,
  stdio: "inherit",
  env: {
    ...process.env,
    PYTHONIOENCODING: process.env.PYTHONIOENCODING || "utf-8",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`[zhihuishu] Failed to start Python: ${error.message}`);
  console.error("[zhihuishu] Run `zbl run zhihuishu-install` first, or set ZHS_PYTHON.");
  process.exit(1);
});
