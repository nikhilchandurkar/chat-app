# ==============================================================================
# Local Development Startup Script for Windows (PowerShell) - MySQL 8+
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Django Daphne ASGI Chat Server (MySQL 8+)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Virtual Environment detection
$venvPath = ""
if (Test-Path "venv\Scripts\Activate.ps1") {
    $venvPath = "venv\Scripts\Activate.ps1"
} elseif (Test-Path ".venv\Scripts\Activate.ps1") {
    $venvPath = ".venv\Scripts\Activate.ps1"
} else {
    Write-Host "[1/4] Creating virtual environment (venv)..." -ForegroundColor Yellow
    python -m venv venv
    $venvPath = "venv\Scripts\Activate.ps1"
}

# 2. Activate Virtual Environment
Write-Host "[2/4] Activating virtual environment..." -ForegroundColor Yellow
& $venvPath

# 3. MySQL Database Configuration
if (-not $env:DATABASE_NAME) { $env:DATABASE_NAME = "chat_db" }
if (-not $env:DATABASE_USER) { $env:DATABASE_USER = "chat_user" }
if (-not $env:DATABASE_PASSWORD) { $env:DATABASE_PASSWORD = "chat_password" }
if (-not $env:DATABASE_HOST) { $env:DATABASE_HOST = "127.0.0.1" }
if (-not $env:DATABASE_PORT) { $env:DATABASE_PORT = "3306" }

Write-Host "Database: MySQL on $($env:DATABASE_HOST):$($env:DATABASE_PORT)/$($env:DATABASE_NAME)" -ForegroundColor Green

# 4. Run Migrations
Write-Host "[3/4] Running MySQL database migrations..." -ForegroundColor Yellow
python manage.py migrate
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Could not connect or migrate MySQL database." -ForegroundColor Red
    Write-Host "Please ensure your MySQL service is running:" -ForegroundColor Yellow
    Write-Host "  Start-Service MySQL84" -ForegroundColor Cyan
    Write-Host "And that the database and user exist:" -ForegroundColor Yellow
    Write-Host "  & `"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe`" -u root -p -e `"CREATE DATABASE IF NOT EXISTS chat_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'chat_user'@'localhost' IDENTIFIED BY 'chat_password'; GRANT ALL PRIVILEGES ON chat_db.* TO 'chat_user'@'localhost'; FLUSH PRIVILEGES;`"" -ForegroundColor Cyan
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Server is ready! Starting Daphne ASGI server on http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

# 5. Launch with Daphne ASGI Server
daphne -b 127.0.0.1 -p 8000 core.asgi:application

