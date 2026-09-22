#!/usr/bin/env bash
set -e

# ==============================================================================
# Chat App Docker Build & Test Script
# Usage:
#   ./docker_build.sh [TAG] [--push]
# Examples:
#   ./docker_build.sh                  # Builds with tag 'latest'
#   ./docker_build.sh v1.0.0           # Builds with tag 'v1.0.0'
#   ./docker_build.sh v1.0.0 --push    # Builds and pushes to Docker Hub
# ==============================================================================

TAG="${1:-latest}"
PUSH_FLAG="${2:-}"
DOCKER_USER="${DOCKER_USERNAME:-nikhil2523}"
IMAGE_NAME="${DOCKER_USER}/chat-app"

echo "=================================================="
echo " 🛠️  Starting Automated Build & Test Pipeline"
echo " Image: $IMAGE_NAME:$TAG"
echo "=================================================="

# ─── Step 1: Run Linting ──────────────────────────────────────────────────────
echo ""
echo "▶ Step 1: Running Server Code Linting..."
cd server
npm run lint
echo "✅ Linting passed!"

# ─── Step 2: Run Unit Tests ───────────────────────────────────────────────────
echo ""
echo "▶ Step 2: Running Server Unit Tests..."
npm test
echo "✅ All unit tests passed!"

cd ..

# ─── Step 3: Build Docker Image ───────────────────────────────────────────────
echo ""
echo "▶ Step 3: Building Docker Image ($IMAGE_NAME:$TAG)..."
docker build \
    -t "$IMAGE_NAME:$TAG" \
    -t "$IMAGE_NAME:latest" \
    -f server/Dockerfile \
    ./server

echo "✅ Docker image built successfully!"
docker images | grep "$IMAGE_NAME" | head -n 2

# ─── Step 4: Optional Push ────────────────────────────────────────────────────
if [ "$PUSH_FLAG" == "--push" ] || [ "$PUSH" == "true" ]; then
    echo ""
    echo "▶ Step 4: Pushing Image to Docker Hub..."
    docker push "$IMAGE_NAME:$TAG"
    docker push "$IMAGE_NAME:latest"
    echo "✅ Image pushed successfully to Docker Hub!"
fi

echo ""
echo "=================================================="
echo " 🎉 Build Pipeline Completed Successfully!"
echo "=================================================="

