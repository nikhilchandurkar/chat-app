#!/bin/bash
# ==============================================================================
# setup_ssl.sh — Turnkey SSL Setup with DuckDNS + Certbot for Chat App
# Usage:
#   sudo bash setup_ssl.sh <subdomain>.duckdns.org <email>
# Example:
#   sudo bash setup_ssl.sh nikhil-chat.duckdns.org you@gmail.com
# ==============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run as root: sudo bash setup_ssl.sh <subdomain> <email>"
  exit 1
fi

DOMAIN="$1"
EMAIL="$2"

if [ -z "$DOMAIN" ]; then
  read -p "Enter your subdomain (e.g. nikhil-chat.duckdns.org): " DOMAIN
fi

if [ -z "$EMAIL" ]; then
  read -p "Enter your email for SSL renewal notifications: " EMAIL
fi

# Clean domain input
DOMAIN=$(echo "$DOMAIN" | sed -e 's|^[^/]*//||' -e 's|/.*$||')

echo "============================================================"
echo "🚀 Setting up SSL for https://$DOMAIN"
echo "============================================================"

# 1. Install Certbot
echo "📦 Installing certbot & python3-certbot-nginx..."
apt-get update -qq
apt-get install -y certbot python3-certbot-nginx

# 2. Prepare ACME challenge webroot
mkdir -p /var/www/certbot
chmod 755 /var/www/certbot

# 3. Ensure Nginx is running base config for HTTP-01 challenge
if [ -f "nginx.conf" ]; then
  cp nginx.conf /etc/nginx/sites-available/chatapp
  ln -sf /etc/nginx/sites-available/chatapp /etc/nginx/sites-enabled/chatapp
  rm -f /etc/nginx/sites-enabled/default
fi
systemctl restart nginx || systemctl start nginx

# 4. Request certificate from Let's Encrypt
echo "🔒 Requesting Let's Encrypt certificate..."
certbot certonly --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN" \
  --agree-tos \
  -m "$EMAIL" \
  --non-interactive \
  --keep-until-expiring

# 5. Apply HTTPS Nginx config
echo "⚙️ Applying HTTPS Nginx configuration..."
sed -e "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" -e "s/chat-nikkiii.duckdns.org/$DOMAIN/g" nginx_ssl.conf > /etc/nginx/sites-available/chatapp
ln -sf /etc/nginx/sites-available/chatapp /etc/nginx/sites-enabled/chatapp
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

# 6. Automatic renewal hook
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat << 'EOF' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
#!/bin/sh
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

echo "============================================================"
echo "🎉 SSL Setup Complete!"
echo "🌐 Your app is live at: https://$DOMAIN"
echo "WSS WebSockets live at: wss://$DOMAIN/ws/chat/"
echo "============================================================"

