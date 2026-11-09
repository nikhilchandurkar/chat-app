# ==============================================================================
# Chat App Docker Build & Push Script (PowerShell)
# Usage:
#   .\docker_build.ps1 -Tag "latest" -Push
#   .\docker_build.ps1 -ImageRepo "chat-app" -Tag "v1.0.0" -Push
# ==============================================================================
param (
    [string]$ImageRepo = "chat-app",
    [string]$Tag = "latest",
    [string]$DockerUser = $(if ($env:DOCKER_USERNAME) { $env:DOCKER_USERNAME } else { "nikhil2523" }),
    [switch]$Push
)

$ErrorActionPreference = "Stop"
$PrimaryImage = "$DockerUser/$ImageRepo"
$DjangoImage = "$DockerUser/chat-app-django"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " 🛠️  Building Django ASGI Production Docker Image" -ForegroundColor Cyan
Write-Host " Primary: $PrimaryImage`:$Tag" -ForegroundColor Cyan
Write-Host " Alias:   $DjangoImage`:$Tag" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# ─── Step 1: Docker Build ───────────────────────────────────────────────────────
Write-Host "`n▶ Step 1: Building Docker Image from django_server/Dockerfile..." -ForegroundColor Yellow
docker build `
    -t "$PrimaryImage`:$Tag" `
    -t "$PrimaryImage`:latest" `
    -t "$DjangoImage`:$Tag" `
    -t "$DjangoImage`:latest" `
    -f django_server/Dockerfile `
    ./django_server

Write-Host "✅ Docker images built successfully!" -ForegroundColor Green

# ─── Step 2: Push to Docker Hub ───────────────────────────────────────────────
if ($Push) {
    Write-Host "`n▶ Step 2: Pushing Images to Docker Hub..." -ForegroundColor Yellow
    docker push "$PrimaryImage`:$Tag"
    if ($Tag -ne "latest") {
        docker push "$PrimaryImage`:latest"
    }
    docker push "$DjangoImage`:$Tag"
    if ($Tag -ne "latest") {
        docker push "$DjangoImage`:latest"
    }
    Write-Host "✅ All images pushed successfully to Docker Hub!" -ForegroundColor Green
} else {
    Write-Host "`n💡 To push to Docker Hub, pass the -Push flag:" -ForegroundColor DarkGray
    Write-Host "   .\docker_build.ps1 -Tag '$Tag' -Push" -ForegroundColor DarkGray
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host " 🎉 Build Completed Successfully!" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
