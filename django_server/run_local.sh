#!/usr/bin/env bash
# ==============================================================================
# Local Development Startup Script for Linux / macOS
# ==============================================================================
set -e

echo "=========================================================="
echo "  Starting Scalable Django Daphne ASGI Chat Server (Local)"
echo "=========================================================="

# 1. Virtual Environment
if [ ! -d ".venv" ]; then
    echo "[1/4] Creating virtual environment (.venv)..."
    python3 -m venv .venv
fi

# 2. Activate Virtual Environment
echo "[2/4] Activating virtual environment..."
source .venv/bin/activate

# 3. Install Requirements
echo "[3/4] Installing dependencies..."
pip install -r requirements.txt --quiet

# 4. Run Migrations
echo "[4/4] Running database migrations..."
python manage.py makemigrations authentication chat messages_app preview
python manage.py migrate

echo ""
echo "Server ready! Launching Daphne ASGI on http://127.0.0.1:8000"
echo "Press Ctrl+C to stop."
echo ""

# 5. Launch Daphne
daphne -b 127.0.0.1 -p 8000 core.asgi:application

