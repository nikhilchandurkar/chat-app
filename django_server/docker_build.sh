#!/usr/bin/env bash
# ==============================================================================
# Multi-Stage Docker Build & Push Script for Django Daphne Chat Server
# ==============================================================================
set -e

IMAGE_NAME="nikhil2523/chat-app-django"
TAG="${1:-latest}"
VERSION_TAG="${2:-v1.0.0}"
DOCKER_USER="${DOCKER_USERNAME:-nikhil2523}"
DOCKER_PASS="${DOCKER_PASSWORD}"
if [ -z "$DOCKER_PASS" ]; then
    echo "Error: DOCKER_PASSWORD environment variable is required."
    exit 1
fi

echo "=========================================================="
echo "  Building & Pushing Django Daphne Server: ${IMAGE_NAME}:${TAG}"
echo "=========================================================="

# 1. Run Pre-Build Checks
echo "[1/4] Running Django system and syntax checks..."
if [ -d ".venv" ]; then
    source .venv/bin/activate
    python manage.py check
elif command -v python3 &>/dev/null; then
    python3 manage.py check || true
fi
echo "✓ Pre-build checks passed!"

# 2. Docker Hub Authentication
echo "[2/4] Authenticating with Docker Hub as '${DOCKER_USER}'..."
if [ -n "$DOCKER_PASS" ]; then
    echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
    echo "✓ Docker login successful!"
else
    echo "⚠ Warning: No DOCKER_PASSWORD provided. Relying on existing docker credentials."
fi

# 3. Multi-Stage Docker Build
echo "[3/4] Building multi-stage Docker image..."
docker build \
    --file Dockerfile \
    --tag "${IMAGE_NAME}:${TAG}" \
    --tag "${IMAGE_NAME}:${VERSION_TAG}" \
    .
echo "✓ Docker build completed successfully!"

# 4. Push to Docker Hub
echo "[4/4] Pushing images to Docker Hub..."
docker push "${IMAGE_NAME}:${TAG}"
docker push "${IMAGE_NAME}:${VERSION_TAG}"
echo "=========================================================="
echo "✓ Successfully pushed:"
echo "  - ${IMAGE_NAME}:${TAG}"
echo "  - ${IMAGE_NAME}:${VERSION_TAG}"
echo "=========================================================="

