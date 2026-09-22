# ==============================================================================
# Multi-Stage Docker Build & Push Script for Django Daphne Chat Server (Windows)
# ==============================================================================
param (
    [string]$Tag = "latest",
    [string]$VersionTag = "v1.0.0",
    [string]$DockerUser = $env:DOCKER_USERNAME,
    [string]$DockerPass = $env:DOCKER_PASSWORD
)

$ErrorActionPreference = "Stop"
$ImageName = "nikhil2523/chat-app-django"

if (-not $DockerUser) { $DockerUser = "nikhil2523" }
if (-not $DockerPass) {
    Write-Error "DOCKER_PASSWORD environment variable or -DockerPass parameter is required."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Building & Pushing Django Daphne: $ImageName`:$Tag" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Pre-build checks
Write-Host "[1/4] Running Django system and syntax checks..." -ForegroundColor Yellow
if (Test-Path ".\.venv\Scripts\python.exe") {
    & .\.venv\Scripts\python.exe manage.py check
} else {
    python manage.py check
}
Write-Host "✓ System checks passed!" -ForegroundColor Green

# 2. Docker login
Write-Host "[2/4] Logging into Docker Hub as '$DockerUser'..." -ForegroundColor Yellow
$DockerPass | docker login -u $DockerUser --password-stdin
Write-Host "✓ Docker login successful!" -ForegroundColor Green

# 3. Docker build
Write-Host "[3/4] Building multi-stage Docker image..." -ForegroundColor Yellow
docker build `
    --file Dockerfile `
    --tag "$ImageName`:$Tag" `
    --tag "$ImageName`:$VersionTag" `
    .
Write-Host "✓ Docker build completed successfully!" -ForegroundColor Green

# 4. Push to Docker Hub
Write-Host "[4/4] Pushing images to Docker Hub..." -ForegroundColor Yellow
docker push "$ImageName`:$Tag"
docker push "$ImageName`:$VersionTag"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "✓ Successfully pushed:" -ForegroundColor Green
Write-Host "  - $ImageName`:$Tag" -ForegroundColor Green
Write-Host "  - $ImageName`:$VersionTag" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

