#!/usr/bin/env bash
# ==============================================================================
# Local Development Startup Script for Linux / macOS (MySQL 8+)
# ==============================================================================
set -e

echo "=========================================================="
echo "  Starting Django Daphne ASGI Chat Server (MySQL 8+)"
echo "=========================================================="

# 1. Virtual Environment
if [ -d "venv" ]; then
    source venv/bin/activate
elif [ -d ".venv" ]; then
    source .venv/bin/activate
else
    echo "[1/4] Creating virtual environment (venv)..."
    python3 -m venv venv
    source venv/bin/activate
fi

# 2. Database Defaults (MySQL 8+)
export DATABASE_NAME="${DATABASE_NAME:-chat_db}"
export DATABASE_USER="${DATABASE_USER:-chat_user}"
export DATABASE_PASSWORD="${DATABASE_PASSWORD:-chat_password}"
export DATABASE_HOST="${DATABASE_HOST:-127.0.0.1}"
export DATABASE_PORT="${DATABASE_PORT:-3306}"

# 3. Install Requirements
echo "[2/4] Checking dependencies..."
pip install -r requirements.txt --quiet

# 4. Run Migrations
echo "[3/4] Running MySQL database migrations..."
python manage.py migrate

echo ""
echo "Server ready! Launching Daphne ASGI on http://127.0.0.1:8000"
echo "Press Ctrl+C to stop."
echo ""

# 5. Launch Daphne
daphne -b 127.0.0.1 -p 8000 core.asgi:application

