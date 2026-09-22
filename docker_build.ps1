# ==============================================================================
# Chat App Docker Build & Test Script (PowerShell)
# Usage:
#   .\docker_build.ps1 -Tag "v1.0.0" -Push
# ==============================================================================
param (
    [string]$Tag = "latest",
    [switch]$Push
)

$ErrorActionPreference = "Stop"
$DockerUser = if ($env:DOCKER_USERNAME) { $env:DOCKER_USERNAME } else { "nikhil2523" }
$ImageName = "$DockerUser/chat-app-backend"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " 🛠️  Starting Automated Build & Test Pipeline" -ForegroundColor Cyan
Write-Host " Image: $ImageName:$Tag" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# ─── Step 1: Run Linting ──────────────────────────────────────────────────────
Write-Host "`n▶ Step 1: Running Server Code Linting..." -ForegroundColor Yellow
Push-Location server
npm run lint
Write-Host "✅ Linting passed!" -ForegroundColor Green

# ─── Step 2: Run Unit Tests ───────────────────────────────────────────────────
Write-Host "`n▶ Step 2: Running Server Unit Tests..." -ForegroundColor Yellow
npm test
Write-Host "✅ All unit tests passed!" -ForegroundColor Green
Pop-Location

# ─── Step 3: Build Docker Image ───────────────────────────────────────────────
Write-Host "`n▶ Step 3: Building Docker Image ($ImageName:$Tag)..." -ForegroundColor Yellow
docker build -t "$ImageName:$Tag" -t "$ImageName:latest" -f server/Dockerfile ./server
Write-Host "✅ Docker image built successfully!" -ForegroundColor Green

# ─── Step 4: Optional Push ────────────────────────────────────────────────────
if ($Push) {
    Write-Host "`n▶ Step 4: Pushing Image to Docker Hub..." -ForegroundColor Yellow
    docker push "$ImageName:$Tag"
    docker push "$ImageName:latest"
    Write-Host "✅ Image pushed successfully to Docker Hub!" -ForegroundColor Green
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host " 🎉 Build Pipeline Completed Successfully!" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

