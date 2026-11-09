#!/usr/bin/env python3
"""
setup_ssl.py — Automated Let's Encrypt SSL / TLS Setup for Chat App
Usage:
    sudo python3 setup_ssl.py [<domain>] [<email>]

Examples:
    sudo python3 setup_ssl.py
    sudo python3 setup_ssl.py nikhil-chat.duckdns.org user@gmail.com
"""

import sys
import os
import subprocess
import socket
import time

def run(cmd, check=True, capture=False):
    print(f"  $ {cmd}")
    res = subprocess.run(
        cmd,
        shell=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True
    )
    if check and res.returncode != 0:
        if capture:
            print(f"  ❌ Error: {res.stderr.strip()}")
    return res

def ok(msg):
    print(f"  ✅ {msg}")

def warn(msg):
    print(f"  ⚠️  {msg}")

def err_exit(msg):
    print(f"\n  ❌ FATAL: {msg}\n")
    sys.exit(1)

def section(title):
    print(f"\n{'='*65}\n  {title}\n{'='*65}")

def check_root():
    if os.geteuid() != 0:
        err_exit("This script must be run as root (use: sudo python3 setup_ssl.py)")

def get_public_ip():
    try:
        r = subprocess.run("curl -s4 https://ifconfig.me || curl -s4 https://api.ipify.org",
                           shell=True, capture_output=True, text=True, timeout=5)
        ip = r.stdout.strip()
        if ip:
            return ip
    except Exception:
        pass
    return None

def main():
    check_root()

    print("\n" + "="*65)
    print("  🔒 Chat App — Free SSL Setup (Certbot + Let's Encrypt)")
    print("="*65)

    # 1. Resolve domain & email
    domain = sys.argv[1].strip() if len(sys.argv) > 1 else ""
    email = sys.argv[2].strip() if len(sys.argv) > 2 else ""

    if not domain:
        print("\n  Enter your free subdomain (e.g. nikhil-chat.duckdns.org):")
        domain = input("  > ").strip().lower()

    if not domain:
        err_exit("Domain name cannot be empty.")

    # Remove protocol prefix if entered by user
    domain = domain.replace("https://", "").replace("http://", "").split("/")[0].strip()

    if not email:
        print("\n  Enter your email for Let's Encrypt renewal notices (e.g. you@gmail.com):")
        email = input("  > ").strip()

    if not email or "@" not in email:
        err_exit("A valid email address is required for Let's Encrypt certificate registration.")

    server_ip = get_public_ip()
    section(f"1. Verifying DNS for {domain}")
    print(f"  Server Public IP: {server_ip or 'unknown'}")

    try:
        resolved_ip = socket.gethostbyname(domain)
        print(f"  Resolved IP:     {resolved_ip}")
        if server_ip and resolved_ip == server_ip:
            ok(f"Domain {domain} points directly to this EC2 instance ({resolved_ip})")
        else:
            warn(f"Domain resolves to {resolved_ip}, server IP is {server_ip}.")
            warn("If you just updated DuckDNS, please allow 30-60 seconds for DNS propagation.")
    except Exception as e:
        warn(f"DNS lookup failed for {domain}: {e}")
        warn("Please ensure you registered the domain on DuckDNS and pointed it to this IP.")
        proceed = input("  Do you want to attempt SSL issuance anyway? (y/N): ").strip().lower()
        if proceed not in ("y", "yes"):
            sys.exit(0)

    # 2. Install Certbot
    section("2. Installing Certbot & Nginx plugin")
    run("apt-get update -qq", check=False)
    run("apt-get install -y certbot python3-certbot-nginx", check=True)
    ok("Certbot installed successfully")

    # 3. Create webroot directory
    section("3. Preparing ACME webroot directory")
    run("mkdir -p /var/www/certbot")
    run("chmod 755 /var/www/certbot")
    ok("/var/www/certbot ready")

    # 4. Ensure Nginx is running
    section("4. Ensuring Nginx is running for HTTP-01 challenge")
    # Verify current nginx configuration
    nginx_test = run("nginx -t", check=False, capture=True)
    if nginx_test.returncode != 0:
        warn("Current Nginx config has errors. Resetting to base nginx.conf...")
        if os.path.exists("nginx.conf"):
            run("cp nginx.conf /etc/nginx/sites-available/chatapp")
            run("ln -sf /etc/nginx/sites-available/chatapp /etc/nginx/sites-enabled/chatapp")
            run("rm -f /etc/nginx/sites-enabled/default")
    run("systemctl restart nginx || systemctl start nginx", check=True)
    ok("Nginx is active on port 80")

    # 5. Acquire Let's Encrypt SSL Certificate
    section(f"5. Requesting SSL certificate from Let's Encrypt for {domain}")
    certbot_cmd = (
        f"certbot certonly --webroot "
        f"-w /var/www/certbot "
        f"-d {domain} "
        f"--agree-tos "
        f"-m {email} "
        f"--non-interactive "
        f"--keep-until-expiring"
    )
    res = run(certbot_cmd, check=False)
    if res.returncode != 0:
        err_exit(f"Certbot failed to obtain SSL certificate for {domain}. Check DNS propagation or firewall security group (port 80 must be open to 0.0.0.0/0).")
    ok(f"SSL Certificate successfully obtained for {domain}!")

    # 6. Apply HTTPS Nginx configuration
    section("6. Applying HTTPS Nginx configuration")
    template_paths = ["nginx_ssl.conf", os.path.expanduser("~/actions-runner/_work/chat-app/chat-app/nginx_ssl.conf"), "/opt/chat-app/nginx_ssl.conf"]
    template_content = None
    for p in template_paths:
        if os.path.isfile(p):
            with open(p, "r") as f:
                template_content = f.read()
            break

    if not template_content:
        err_exit("nginx_ssl.conf template not found! Please run from the chat-app repository root.")

    ssl_conf = template_content.replace("DOMAIN_PLACEHOLDER", domain).replace("chat-nikkiii.duckdns.org", domain)
    target_site = "/etc/nginx/sites-available/chatapp"
    with open(target_site, "w") as f:
        f.write(ssl_conf)

    run("ln -sf /etc/nginx/sites-available/chatapp /etc/nginx/sites-enabled/chatapp")
    run("rm -f /etc/nginx/sites-enabled/default", check=False)

    test_ssl = run("nginx -t", check=False, capture=True)
    if test_ssl.returncode != 0:
        err_exit(f"Nginx SSL configuration test failed:\n{test_ssl.stderr}")

    run("systemctl reload nginx", check=True)
    ok("Nginx reloaded with full HTTPS + WSS configuration!")

    # 7. Configure automated certificate renewal hook
    section("7. Setting up automated Certbot renewal hook")
    hook_dir = "/etc/letsencrypt/renewal-hooks/deploy"
    run(f"mkdir -p {hook_dir}")
    hook_file = f"{hook_dir}/reload-nginx.sh"
    with open(hook_file, "w") as f:
        f.write("#!/bin/sh\nsystemctl reload nginx\n")
    run(f"chmod +x {hook_file}")
    ok(f"Renewal hook created at {hook_file}")

    print("  Testing auto-renewal dry-run...")
    dry_run = run("certbot renew --dry-run", check=False, capture=True)
    if dry_run.returncode == 0:
        ok("Certbot renewal dry-run passed perfectly! (Auto-renewal verified)")
    else:
        warn("Certbot renewal dry-run warning (non-fatal): " + dry_run.stderr.strip()[:100])

    # 8. Summary Report
    section("🎉 SSL / HTTPS SETUP COMPLETE")
    print(f"""
  🌐 Your Chat Application is now secured with SSL!

  - Website URL:         https://{domain}
  - WebSocket (WSS):     wss://{domain}/ws/chat/
  - API Base:            https://{domain}/api/
  - Admin Panel:         https://{domain}/admin/

  Next Steps:
  1. Update your GitHub Repository Secret:
     - Go to: GitHub Repo → Settings → Secrets and variables → Actions
     - Update Secret: CLIENT_URL
     - New Value:     https://{domain}

  2. If using Google OAuth:
     - Google Cloud Console → Credentials → OAuth 2.0 Client
     - Authorized JavaScript origins:  https://{domain}
     - Authorized redirect URIs:        https://{domain}/login

  3. Push new code locally:
     git push origin main
""")

if __name__ == "__main__":
    main()

