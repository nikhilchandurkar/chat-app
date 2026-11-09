#!/usr/bin/env bash
# ==============================================================================
# Chat App Docker Build & Push Script (Bash)
# Usage:
#   ./docker_build.sh latest push
#   ./docker_build.sh v1.0.0 push
# ==============================================================================
set -e

TAG="${1:-latest}"
PUSH_FLAG="${2:-}"
DOCKER_USER="${DOCKER_USERNAME:-nikhil2523}"
PRIMARY_IMAGE="${DOCKER_USER}/chat-app"
DJANGO_IMAGE="${DOCKER_USER}/chat-app-django"

echo "=================================================="
echo " 🛠️  Building Django ASGI Production Docker Image"
echo " Primary: ${PRIMARY_IMAGE}:${TAG}"
echo " Alias:   ${DJANGO_IMAGE}:${TAG}"
echo "=================================================="

# ─── Step 1: Docker Build ───────────────────────────────────────────────────────
echo -e "\n▶ Step 1: Building Docker Image from django_server/Dockerfile..."
docker build \
  -t "${PRIMARY_IMAGE}:${TAG}" \
  -t "${PRIMARY_IMAGE}:latest" \
  -t "${DJANGO_IMAGE}:${TAG}" \
  -t "${DJANGO_IMAGE}:latest" \
  -f django_server/Dockerfile \
  ./django_server

echo "✅ Docker images built successfully!"

# ─── Step 2: Push to Docker Hub ───────────────────────────────────────────────
if [[ "${PUSH_FLAG,,}" == "push" ]]; then
  echo -e "\n▶ Step 2: Pushing Images to Docker Hub..."
  docker push "${PRIMARY_IMAGE}:${TAG}"
  [[ "${TAG}" != "latest" ]] && docker push "${PRIMARY_IMAGE}:latest"
  docker push "${DJANGO_IMAGE}:${TAG}"
  [[ "${TAG}" != "latest" ]] && docker push "${DJANGO_IMAGE}:latest"
  echo "✅ All images pushed successfully to Docker Hub!"
else
  echo -e "\n💡 To push to Docker Hub, pass 'push' as the second argument:"
  echo "   ./docker_build.sh ${TAG} push"
fi

echo "=================================================="
echo " 🎉 Build Completed Successfully!"
echo "=================================================="
