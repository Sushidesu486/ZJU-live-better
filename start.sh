#!/usr/bin/env bash
set -euo pipefail

# Resolve project root from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="logs/daemon.pid"

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || echo "")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
  fi
  return 1
}

cmd_start() {
  if pid="$(is_running)"; then
    echo "Daemon already running (PID $pid)"
    return 0
  fi
  mkdir -p logs
  echo "Starting daemon..."
  node shared/daemon.js >> logs/daemon-stdout.log 2>> logs/daemon-stderr.log &
  disown
  sleep 1
  if pid="$(is_running)"; then
    echo "Daemon started (PID $pid)"
  else
    echo "Failed to start daemon, check logs/daemon-stderr.log"
    return 1
  fi
}

cmd_stop() {
  if pid="$(is_running)"; then
    echo "Stopping daemon (PID $pid)..."
    kill -TERM "$pid"
    for _ in {1..10}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    rm -f "$PID_FILE"
    echo "Daemon stopped"
  else
    echo "Daemon is not running"
  fi
}

cmd_status() {
  if pid="$(is_running)"; then
    echo "Daemon running (PID $pid)"
  else
    echo "Daemon not running"
  fi
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_logs() {
  local latest
  latest="$(ls -1t logs/daemon-*.log 2>/dev/null | head -1)"
  if [[ -z "$latest" ]]; then
    echo "No log files found"
    return 1
  fi
  echo "Tailing $latest (Ctrl+C to exit)"
  tail -f "$latest"
}

cmd_tui() {
  node shared/tui.js
}

usage() {
  cat <<EOF
Usage: ./start.sh <command>

Commands:
  start    Start the daemon in background
  stop     Stop the daemon
  restart  Restart the daemon
  status   Show daemon status
  tui      Open the TUI management interface
  logs     Tail the latest daemon log
EOF
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  tui)     cmd_tui ;;
  logs)    cmd_logs ;;
  *)       usage; exit 1 ;;
esac
