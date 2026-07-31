#!/bin/bash
# stop-dev.sh - Stop local development environment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Function to kill a process by PID file
kill_pid_file() {
    local pid_file="$1"
    local name="$2"
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Stopping $name (PID $pid)..."
            kill "$pid" 2>/dev/null
            for i in {1..5}; do
                if ! kill -0 "$pid" 2>/dev/null; then
                    break
                fi
                sleep 1
            done
            if kill -0 "$pid" 2>/dev/null; then
                echo "Process $pid did not exit. Force killing..."
                kill -9 "$pid" 2>/dev/null
            fi
        fi
        rm -f "$pid_file"
    fi
}

# Function to kill any process listening on a specific port
kill_port() {
    local port="$1"
    local name="$2"
    local pids
    pids=$(lsof -t -i :"$port" 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "Found processes listening on port $port ($name): $pids. Cleaning up..."
        for pid in $pids; do
            kill "$pid" 2>/dev/null
            sleep 0.5
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null
            fi
        done
    fi
}

# 1. Kill by PID files
kill_pid_file "logs/backend.pid" "Backend"
kill_pid_file "logs/frontend.pid" "Frontend"

# 2. Clean up any remaining processes on the target ports
kill_port 8000 "Backend"
kill_port 5173 "Frontend"

echo "Development environment stopped."
