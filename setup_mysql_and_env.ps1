# ==============================================================================
# SECURE CHAT APP - MySQL 8+ & Environment Auto-Setup Script (PowerShell)
# ==============================================================================
param (
    [string]$RootPassword = "RootSecure@2026_New!",
    [string]$DbName = "chat_db",
    [string]$DbUser = "chat_user",
    [string]$DbPassword = "RootSecure@2026_New!",
    [string]$DbHost = "127.0.0.1",
    [int]$DbPort = 3306,
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  MySQL 8+ Database & Environment Setup for Django Backend" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. Verify or Start MySQL Windows Service
# ------------------------------------------------------------------------------
Write-Host "`n[1/6] Checking MySQL Service..." -ForegroundColor Yellow
$mysqlService = Get-Service -Name "MySQL84" -ErrorAction SilentlyContinue
if (-not $mysqlService) {
    $mysqlService = Get-Service -Name "*mysql*" -ErrorAction SilentlyContinue | Select-Object -First 1
}

if ($mysqlService) {
    if ($mysqlService.Status -ne "Running") {
        Write-Host "Starting service '$($mysqlService.Name)'..." -ForegroundColor Cyan
        try {
            Start-Service $mysqlService.Name
            Write-Host "MySQL Service is now running." -ForegroundColor Green
        } catch {
            Write-Host "Warning: Could not start service directly. If not running as admin, please run PowerShell as Administrator or start MySQL service manually." -ForegroundColor Red
        }
    } else {
        Write-Host "MySQL Service '$($mysqlService.Name)' is already running." -ForegroundColor Green
    }
} else {
    Write-Host "No standard MySQL Windows service found. Assuming external/Docker MySQL daemon." -ForegroundColor Gray
}

# ------------------------------------------------------------------------------
# 2. Locate mysql.exe CLI Binary
# ------------------------------------------------------------------------------
Write-Host "`n[2/6] Locating mysql.exe..." -ForegroundColor Yellow
$mysqlExe = $null

$standardPaths = @(
    "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "C:\Program Files\MySQL\bin\mysql.exe"
)

foreach ($path in $standardPaths) {
    if (Test-Path $path) {
        $mysqlExe = $path
        break
    }
}

if (-not $mysqlExe) {
    $cmd = Get-Command "mysql.exe" -ErrorAction SilentlyContinue
    if ($cmd) {
        $mysqlExe = $cmd.Source
    }
}

if (-not $mysqlExe) {
    Write-Host "[ERROR] Could not find mysql.exe. Please install MySQL Server 8+ or add its bin folder to PATH." -ForegroundColor Red
    exit 1
}
Write-Host "Found MySQL binary: $mysqlExe" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 3. Create Database, Users, and Permissions
# ------------------------------------------------------------------------------
Write-Host "`n[3/6] Configuring MySQL Database & Permissions..." -ForegroundColor Yellow

$sqlStatements = @"
ALTER USER 'root'@'localhost' IDENTIFIED BY '$RootPassword';
CREATE DATABASE IF NOT EXISTS $DbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DbUser'@'localhost' IDENTIFIED BY '$DbPassword';
ALTER USER '$DbUser'@'localhost' IDENTIFIED BY '$DbPassword';
CREATE USER IF NOT EXISTS '$DbUser'@'127.0.0.1' IDENTIFIED BY '$DbPassword';
ALTER USER '$DbUser'@'127.0.0.1' IDENTIFIED BY '$DbPassword';
GRANT ALL PRIVILEGES ON *.* TO '$DbUser'@'localhost';
GRANT ALL PRIVILEGES ON *.* TO '$DbUser'@'127.0.0.1';
FLUSH PRIVILEGES;
"@

$tempSqlFile = [System.IO.Path]::GetTempFileName() + ".sql"
[System.IO.File]::WriteAllText($tempSqlFile, $sqlStatements, [System.Text.Encoding]::UTF8)

try {
    & $mysqlExe -u root "-p$RootPassword" --execute="source $tempSqlFile"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database '$DbName' and user '$DbUser' configured successfully." -ForegroundColor Green
    } else {
        Write-Host "Failed to execute SQL initialization." -ForegroundColor Red
        exit $LASTEXITCODE
    }
} finally {
    if (Test-Path $tempSqlFile) {
        Remove-Item $tempSqlFile -Force
    }
}

# ------------------------------------------------------------------------------
# 4. Generate django_server/.env File
# ------------------------------------------------------------------------------
Write-Host "`n[4/6] Creating django_server/.env Configuration..." -ForegroundColor Yellow

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Handle root vs django_server invocation
if (Test-Path (Join-Path $scriptDir "manage.py")) {
    $djangoDir = $scriptDir
} else {
    $djangoDir = Join-Path $scriptDir "django_server"
}

$envPath = Join-Path $djangoDir ".env"
$storageDir = Join-Path $djangoDir "storage\private"
if (-not (Test-Path $storageDir)) {
    New-Item -ItemType Directory -Path $storageDir -Force | Out-Null
}

$envContent = @"
# ==============================================================================
# SECURE REAL-TIME MESSAGING PLATFORM - ENVIRONMENT CONFIGURATION
# Auto-generated by setup_mysql_and_env.ps1 on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# ==============================================================================

# 1. DJANGO CORE SETTINGS
DJANGO_DEBUG=True
DJANGO_SECRET_KEY=dev-secret-key-chat-app-mysql8-production-ready-2026!
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost,*
PUBLIC_DOMAIN=127.0.0.1:8000
API_BASE_URL=http://127.0.0.1:8000
WEBSOCKET_URL=ws://127.0.0.1:8000/ws/chat/

# 2. DATABASE CONFIGURATION (Strict MySQL 8+ Exclusively)
DATABASE_NAME=$DbName
DATABASE_USER=$DbUser
DATABASE_PASSWORD=$DbPassword
DATABASE_HOST=$DbHost
DATABASE_PORT=$DbPort
DB_CONN_MAX_AGE=600

# 3. CACHE & CHANNEL LAYER
USE_REDIS=False
REDIS_URL=redis://127.0.0.1:6379/0

# 4. PRIVATE FILE STORAGE
STORAGE_ROOT=storage/private
MAX_UPLOAD_SIZE_BYTES=104857600
USER_STORAGE_QUOTA_BYTES=5368709120

# 5. JWT TOKEN LIFETIMES
JWT_ACCESS_MINUTES=60
JWT_REFRESH_DAYS=30

# 6. TRANSACTIONAL EMAIL & EMAIL OTP (Gmail App Password / Custom SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_TLS=True
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_16_char_app_password
EMAIL_HOST_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_16_char_app_password
DEFAULT_FROM_EMAIL="Secure Chat <your_email@gmail.com>"

# 7. OAUTH 2.0 SOCIAL AUTHENTICATION CREDENTIALS
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# 8. WEB PUSH NOTIFICATIONS (VAPID)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_CLAIM_EMAIL="mailto:admin@chatapp.local"

# 9. ANDROID PUSH NOTIFICATIONS (Direct FCM HTTP v1)
FCM_PROJECT_ID=your-firebase-project-id
FCM_SERVICE_ACCOUNT_PATH=
"@

[System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.Encoding]::UTF8)
Write-Host "Created .env file at: $envPath" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 5. Run Database Migrations
# ------------------------------------------------------------------------------
Write-Host "`n[5/6] Applying Django Migrations to MySQL..." -ForegroundColor Yellow

Push-Location $djangoDir
try {
    $venvPython = Join-Path $djangoDir "venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        $venvPython = Join-Path $djangoDir ".venv\Scripts\python.exe"
    }
    if (-not (Test-Path $venvPython)) {
        $venvPython = "python"
    }

    & $venvPython manage.py migrate
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Migration failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "All migrations successfully applied to MySQL '$DbName'." -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 6. Verify System Checks and Tests
    # --------------------------------------------------------------------------
    if (-not $SkipTests) {
        Write-Host "`n[6/6] Running Security & Unit Tests on MySQL..." -ForegroundColor Yellow
        & $venvPython manage.py test core.tests
        if ($LASTEXITCODE -eq 0) {
            Write-Host "All 20 security and system tests passed cleanly on MySQL!" -ForegroundColor Green
        }
    } else {
        Write-Host "`n[6/6] Tests skipped by user switch (-SkipTests)." -ForegroundColor Gray
    }
} finally {
    Pop-Location
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETE! DATABASE & ENV READY TO RUN" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "To start the backend Daphne ASGI server, run:" -ForegroundColor Yellow
Write-Host "  cd `"$djangoDir`"" -ForegroundColor White
Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor White
Write-Host "  daphne -b 127.0.0.1 -p 8000 core.asgi:application" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
