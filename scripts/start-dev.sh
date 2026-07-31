#!/bin/bash
# start-dev.sh - Start local development environment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Ensure logs directory exists
mkdir -p logs

# Find virtual environment
if [ -d "backend/venv" ]; then
    VENV_PATH="$PROJECT_ROOT/backend/venv"
elif [ -d "venv" ]; then
    VENV_PATH="$PROJECT_ROOT/venv"
else
    echo "Error: Virtual environment not found in backend/venv or venv/." >&2
    exit 1
fi

# Load environment variables if .env exists
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

# 1. Start Backend
echo "Starting backend..."
cd "$PROJECT_ROOT/backend"
source "$VENV_PATH/bin/activate"
python run.py > "$PROJECT_ROOT/logs/backend.log" 2>&1 &
BACKEND_PID=$!
deactivate
echo $BACKEND_PID > "$PROJECT_ROOT/logs/backend.pid"

# 2. Start Frontend
echo "Starting frontend..."
cd "$PROJECT_ROOT/frontend"
npm run dev > "$PROJECT_ROOT/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$PROJECT_ROOT/logs/frontend.pid"

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"

# Wait for services to become available
echo "Waiting for services to spin up..."
MAX_ATTEMPTS=30
for ((i=1; i<=MAX_ATTEMPTS; i++)); do
    # Check if processes are still running
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Error: Backend process died. See logs/backend.log for details." >&2
        exit 1
    fi
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "Error: Frontend process died. See logs/frontend.log for details." >&2
        exit 1
    fi

    # Check if ports are listening
    if lsof -i :8000 >/dev/null 2>&1 && lsof -i :5173 >/dev/null 2>&1; then
        echo "All services are up!"
        echo "Backend URL:  http://localhost:8000"
        echo "Frontend URL: http://localhost:5173"
        exit 0
    fi
    sleep 1
done

echo "Warning: Timeout waiting for ports 8000 and 5173 to open." >&2
echo "Please check logs/backend.log and logs/frontend.log." >&2
