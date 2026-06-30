# Complete Production Deployment & Security Guide

This guide covers deploying the optimized chat application to a production environment.

## 1. Preparing the Files

### Frontend (React App)
1. Build the production files:
   ```bash
   cd client
   npm run build
   ```
2. Zip the `dist` folder:
   ```bash
   # On Windows (PowerShell)
   Compress-Archive -Path dist\* -DestinationPath dist.zip
   # On Linux/Mac
   zip -r dist.zip dist/
   ```
3. Transfer the zip to your server:
   ```bash
   scp dist.zip user@your-server-ip:/var/www/chatapp/client/
   ```
4. Extract on the server:
   ```bash
   unzip dist.zip -d /var/www/chatapp/client/dist
   ```
*For future frontend updates, you just repeat this zip and scp process.*

### Backend (Node.js API)
1. Tar/Zip the backend folder (excluding `node_modules` and `.env` if already on server):
   ```bash
   tar -czvf backend.tar.gz server/
   ```
2. Transfer to your server:
   ```bash
   scp backend.tar.gz user@your-server-ip:/var/www/chatapp/
   ```
3. Extract and install dependencies on the server:
   ```bash
   tar -xzvf backend.tar.gz
   cd server
   npm install --production
   ```
*For future backend updates, you can just run `git pull` in the `/var/www/chatapp/server` directory, or transfer a new tar and run `npm install`.*

---

## 2. Low-Resource Execution (Backend)

The backend has been heavily optimized for a 1GB RAM machine and now uses lightweight DB encryption. To support 2 threads natively:

1. Install PM2 (if not already installed):
   ```bash
   sudo npm install -g pm2
   ```
2. Run the application using the new ecosystem file:
   ```bash
   cd /var/www/chatapp/server
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```
> [!NOTE]
> The PM2 ecosystem config explicitly limits the Node heap size to 400MB per thread (800MB total) to prevent your server from running out of memory (OOM).

**CRITICAL: Socket.io with Multiple Threads**
Because you requested 2-3 threads, PM2 runs in cluster mode. Socket.io requires an adapter to share events across threads. 
You must run this command in your `server` directory on your production server:
```bash
npm install @socket.io/pm2
```
And then in your `app.js` (or in PM2), Socket.io will automatically balance the load.

---

## 3. Nginx Configuration (Security & Routing)

Your new `nginx.conf` (located in your project root) has been updated with:
- **Rate Limiting**: Stops DDoS attacks by limiting IP connections (10 req/sec).
- **IP Blacklisting**: A block to easily deny access to malicious IPs.

1. Move the config to Nginx:
   ```bash
   sudo cp /var/www/chatapp/nginx.conf /etc/nginx/sites-available/chatapp
   sudo ln -s /etc/nginx/sites-available/chatapp /etc/nginx/sites-enabled/
   ```
2. Test and reload Nginx:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## 4. Firewall & Network Security (UFW)

Since Nginx is the only service that needs to be accessed by the outside world, you should lock down all other ports. Your backend now exclusively listens on `127.0.0.1` (localhost), which adds a huge layer of security.

Run these commands on your Linux server to configure the UFW firewall:

```bash
# Deny all incoming traffic by default
sudo ufw default deny incoming

# Allow all outgoing traffic by default
sudo ufw default allow outgoing

# Allow SSH (CRITICAL: Do this so you don't lock yourself out)
sudo ufw allow ssh

# Allow HTTP and HTTPS for Nginx
sudo ufw allow http
sudo ufw allow https

# Enable the firewall
sudo ufw enable
```

---

## 5. Database Connection Security (MongoDB Atlas)

Since you are using MongoDB Atlas, your DB is inherently separated from your application server.

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. Go to **Network Access** under the Security tab on the left sidebar.
3. Remove the `0.0.0.0/0` (Allow access from anywhere) rule.
4. Click **Add IP Address** and enter your **Production Server's IP Address**.
5. Click Confirm.

Now, your database will completely reject any connection attempts that don't originate directly from your secure server.

---

## Summary of Code Modifications Made:
- **Zip Bomb Prevention**: `server/middlewares/multer.js` has a strict 5MB upload limit and explicitly rejects `.zip` and `.sh` files.
- **Lightweight DB Encryption**: Messages in `server/models/message.js` are now encrypted via standard AES-256-CTR natively before saving to MongoDB, preventing database leaks from exposing chat content.
- **Listen IP Lock**: `app.js` changed from `0.0.0.0` to `127.0.0.1`.
- **Ecosystem Config**: Added `ecosystem.config.cjs` for strict RAM utilization.
