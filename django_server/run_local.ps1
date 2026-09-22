# ==============================================================================
# Local Development Startup Script for Windows (PowerShell)
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Scalable Django Daphne ASGI Chat Server (Local)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure Python Virtual Environment
if (-not (Test-Path ".venv")) {
    Write-Host "[1/4] Creating virtual environment (.venv)..." -ForegroundColor Yellow
    python -m venv .venv
}

# 2. Activate Virtual Environment
Write-Host "[2/4] Activating virtual environment..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# 3. Install Requirements
Write-Host "[3/4] Checking and installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt --quiet

# 4. Run Migrations
Write-Host "[4/4] Running database migrations..." -ForegroundColor Yellow
python manage.py makemigrations authentication chat messages_app preview
python manage.py migrate

Write-Host ""
Write-Host "Server is ready! Starting Daphne ASGI server on http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

# 5. Launch with Daphne ASGI Server
daphne -b 127.0.0.1 -p 8000 core.asgi:application

