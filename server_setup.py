#!/usr/bin/env python3
"""
server_setup.py — One-shot server setup script for chat-app on Ubuntu
Run as: python3 server_setup.py

- Stops and removes legacy Docker containers (postgres, old node app)
- Ensures MySQL 8 container is running with correct credentials
- Ensures Redis container is running
- Sets up /opt/chat-app directory structure
- Configures Nginx to serve static frontend + proxy Django
- Creates systemd-friendly directory permissions
- Prints a final status report
"""

import subprocess
import os
import sys
import time

# ── Config ────────────────────────────────────────────────────────────────────
MYSQL_ROOT_PASSWORD = "chat_root_password"
MYSQL_USER         = "chat_user"
MYSQL_PASSWORD     = "chat_password"
MYSQL_DATABASE     = "chat_db"

REDIS_PORT         = 6379

BASE_DIR           = "/opt/chat-app"
DIRS               = [
    f"{BASE_DIR}/frontend",
    f"{BASE_DIR}/mysql_data",
    f"{BASE_DIR}/redis_data",
    f"{BASE_DIR}/media",
    f"{BASE_DIR}/logs",
]

NGINX_CONF_SRC     = os.path.expanduser("~/actions-runner/_work/chat-app/chat-app/nginx.conf")
NGINX_SITE         = "/etc/nginx/sites-available/chatapp"
NGINX_ENABLED      = "/etc/nginx/sites-enabled/chatapp"

# ── Helpers ───────────────────────────────────────────────────────────────────

def run(cmd, check=True, capture=False):
    print(f"  $ {cmd}")
    result = subprocess.run(
        cmd, shell=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True
    )
    if check and result.returncode != 0:
        if capture:
            print(f"  ERROR: {result.stderr.strip()}")
    return result

def container_running(name):
    r = run(f"docker ps --format '{{{{.Names}}}}' | grep -q '^{name}$'", check=False)
    return r.returncode == 0

def container_exists(name):
    r = run(f"docker ps -a --format '{{{{.Names}}}}' | grep -q '^{name}$'", check=False)
    return r.returncode == 0

def ok(msg):  print(f"  ✅ {msg}")
def warn(msg): print(f"  ⚠️  {msg}")
def section(msg): print(f"\n{'─'*60}\n  {msg}\n{'─'*60}")

# ── Steps ─────────────────────────────────────────────────────────────────────

def step_directories():
    section("1. Creating directory structure")
    for d in DIRS:
        run(f"sudo mkdir -p {d}")
    run(f"sudo chown -R ubuntu:ubuntu {BASE_DIR}")
    run(f"sudo chmod -R 775 {BASE_DIR}")
    ok(f"Directories ready under {BASE_DIR}")

def step_remove_legacy():
    section("2. Removing legacy containers")
    legacy = ["chat_postgres", "chat_app", "nodejs-app-container", "node_backend"]
    for c in legacy:
        if container_exists(c):
            run(f"docker stop {c} 2>/dev/null || true", check=False)
            run(f"docker rm {c} 2>/dev/null || true", check=False)
            ok(f"Removed legacy container: {c}")
        else:
            print(f"  (skip) {c} — not found")

def step_mysql():
    section("3. MySQL 8.0")
    if container_running("chat_mysql"):
        ok("MySQL already running")
        # Quick connection test
        r = run(
            f"docker exec chat_mysql mysqladmin ping -u {MYSQL_USER} -p{MYSQL_PASSWORD} --silent",
            check=False, capture=True
        )
        if r.returncode == 0:
            ok("MySQL accepting connections")
        else:
            warn("MySQL running but not accepting connections yet — wait 10s and retry")
        return

    if container_exists("chat_mysql"):
        run("docker rm chat_mysql", check=False)

    # Fix data dir permissions (uid 999 = mysql user inside container)
    run(f"sudo mkdir -p {BASE_DIR}/mysql_data")
    run(f"sudo chown -R 999:999 {BASE_DIR}/mysql_data")

    run(f"""docker run -d \\
        --name chat_mysql \\
        --restart unless-stopped \\
        -e MYSQL_DATABASE={MYSQL_DATABASE} \\
        -e MYSQL_USER={MYSQL_USER} \\
        -e MYSQL_PASSWORD={MYSQL_PASSWORD} \\
        -e MYSQL_ROOT_PASSWORD={MYSQL_ROOT_PASSWORD} \\
        -v {BASE_DIR}/mysql_data:/var/lib/mysql \\
        -p 127.0.0.1:3306:3306 \\
        mysql:8.0 \\
        --character-set-server=utf8mb4 \\
        --collation-server=utf8mb4_unicode_ci \\
        --default-authentication-plugin=mysql_native_password \\
        --innodb-buffer-pool-size=128M \\
        --max-connections=50""")

    print("  Waiting for MySQL to be ready", end="", flush=True)
    for i in range(30):
        time.sleep(3)
        r = run(
            f"docker exec chat_mysql mysqladmin ping -u {MYSQL_USER} -p{MYSQL_PASSWORD} --silent",
            check=False, capture=True
        )
        if r.returncode == 0:
            print(" ready!")
            ok("MySQL is up and accepting connections")
            return
        print(".", end="", flush=True)
    warn("MySQL did not become ready in 90s — check: docker logs chat_mysql")

def step_redis():
    section("4. Redis 7")
    if container_running("chat_redis"):
        ok("Redis already running")
        r = run("docker exec chat_redis redis-cli ping", check=False, capture=True)
        if r.stdout.strip() == "PONG":
            ok("Redis PONG received")
        return

    if container_exists("chat_redis"):
        run("docker rm chat_redis", check=False)

    run(f"sudo mkdir -p {BASE_DIR}/redis_data")

    run(f"""docker run -d \\
        --name chat_redis \\
        --restart unless-stopped \\
        -p 127.0.0.1:6379:6379 \\
        -v {BASE_DIR}/redis_data:/data \\
        redis:7-alpine \\
        redis-server --appendonly yes --maxmemory 64mb --maxmemory-policy allkeys-lru""")

    time.sleep(3)
    r = run("docker exec chat_redis redis-cli ping", check=False, capture=True)
    if r.stdout.strip() == "PONG":
        ok("Redis is up")
    else:
        warn("Redis may still be starting — check: docker logs chat_redis")

def step_nginx():
    section("5. Nginx configuration")
    # Write optimized nginx config for IP-based access (no SSL yet)
    nginx_conf = f"""# ── Rate limiting ──────────────────────────────────────────────
limit_req_zone  $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone  $binary_remote_addr zone=auth:5m  rate=3r/s;

# WebSocket upgrade map
map $http_upgrade $connection_upgrade {{
    default upgrade;
    ''      close;
}}

server {{
    listen 80;
    listen [::]:80;
    server_name 16.113.127.132 _;

    # Security headers
    add_header X-Content-Type-Options  nosniff          always;
    add_header X-Frame-Options         DENY             always;
    add_header X-XSS-Protection        "1; mode=block"  always;

    # Max upload size
    client_max_body_size 25M;

    # ── React SPA (static files served directly by Nginx, no container) ──
    root  {BASE_DIR}/frontend;
    index index.html;

    location / {{
        try_files $uri $uri/ /index.html;

        # Cache hashed assets forever, HTML never
        location ~* \\.(?:js|css|woff2?|ttf|eot|svg|png|jpg|ico)$ {{
            expires 1y;
            add_header Cache-Control "public, immutable";
            access_log off;
        }}
    }}

    # ── Django REST API ────────────────────────────────────────────────────
    location /api/ {{
        limit_req zone=api burst=30 nodelay;
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }}

    # ── Django Admin ───────────────────────────────────────────────────────
    location /admin/ {{
        limit_req zone=auth burst=5 nodelay;
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }}

    # ── Django Channels WebSocket ──────────────────────────────────────────
    location /ws {{
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection $connection_upgrade;
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_buffering    off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }}

    # ── Django media files ─────────────────────────────────────────────────
    location /api/v1/media/ {{
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }}
}}
"""
    conf_path = "/tmp/chatapp_nginx.conf"
    with open(conf_path, "w") as f:
        f.write(nginx_conf)

    run(f"sudo cp {conf_path} {NGINX_SITE}")
    run(f"sudo ln -sf {NGINX_SITE} {NGINX_ENABLED}")
    # Remove default nginx site if present
    run("sudo rm -f /etc/nginx/sites-enabled/default", check=False)

    r = run("sudo nginx -t", check=False, capture=True)
    if r.returncode == 0:
        run("sudo systemctl reload nginx")
        ok("Nginx configured and reloaded")
    else:
        warn(f"Nginx config test failed:\n{r.stderr}")

def step_docker_cleanup():
    section("6. Docker cleanup")
    run("docker image prune -f", check=False)
    run("docker container prune -f", check=False)
    ok("Docker cleaned up")

def step_status():
    section("7. Final Status")
    print("\n  Docker containers:")
    run("docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'")

    print("\n  Memory:")
    run("free -h")

    print("\n  Disk:")
    run("df -h /")

    print("\n  Nginx:")
    run("sudo systemctl status nginx --no-pager -l | head -5", check=False)

    print("\n  Port 3000 (Django):")
    r = run("curl -sf http://127.0.0.1:3000/hello", check=False, capture=True)
    if r.returncode == 0:
        ok(f"Django responding: {r.stdout.strip()}")
    else:
        warn("Django not yet running on port 3000 — trigger CI/CD pipeline to deploy")

    print("\n  Frontend files:")
    r = run(f"ls {BASE_DIR}/frontend/ 2>/dev/null | head -5", check=False, capture=True)
    if r.stdout.strip():
        ok(f"Frontend files present: {r.stdout.strip()}")
    else:
        warn(f"No frontend files yet in {BASE_DIR}/frontend/ — trigger CI/CD to deploy")

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  Chat App Server Setup")
    print("  Server: Ubuntu 26.04 | 2 vCPU | 908MB RAM")
    print("="*60)

    step_directories()
    step_remove_legacy()
    step_mysql()
    step_redis()
    step_nginx()
    step_docker_cleanup()
    step_status()

    print("\n" + "="*60)
    print("  Setup complete.")
    print("  Next: trigger GitHub Actions pipeline to deploy Django + frontend")
    print("  https://github.com/nikhilchandurkar/chat-app/actions")
    print("="*60 + "\n")
