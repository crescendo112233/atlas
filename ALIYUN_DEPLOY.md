# Alibaba Cloud deployment runbook

## 1. Confirm the network

The ECS and RDS instances must be in the same Hong Kong region and VPC. Add the ECS private IP to the RDS whitelist and use the RDS internal endpoint. Do not request a public RDS endpoint for the application.

## 2. Confirm OSS permissions

Keep the OSS bucket private. Attach a RAM role such as `atlas-ecs-role` to the ECS instance and grant only these object operations for the selected bucket:

- `oss:ListObjects`
- `oss:GetObject`
- `oss:PutObject`
- `oss:DeleteObject`

The app uses IMDSv2 to obtain temporary credentials from that role. No long-lived AccessKey is required on ECS.

## 3. Upload the source

Push the `codex/aliyun-migration` branch to a private GitHub or Gitee repository, then connect to ECS:

```bash
ssh -i /path/to/key.pem root@ECS_PUBLIC_IP
sudo mkdir -p /opt/make-love-atlas
sudo chown -R "$USER:$USER" /opt/make-love-atlas
git clone --branch codex/aliyun-migration YOUR_PRIVATE_REPOSITORY /opt/make-love-atlas
cd /opt/make-love-atlas
```

## 4. Install Docker and Nginx

```bash
sudo apt update
sudo apt install -y git nginx curl ca-certificates
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker nginx
sudo usermod -aG docker "$USER"
```

Log out and reconnect once so the Docker group change applies.

## 5. Create the production environment file

```bash
cp .env.example .env
nano .env
chmod 600 .env
```

Set these values without adding quotes unless the value itself requires them:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://atlas.example.com
DB_HOST=YOUR_RDS_INTERNAL_ENDPOINT
DB_PORT=5432
DB_NAME=atlas
DB_USER=atlas_app
DB_PASSWORD=YOUR_NEW_PASSWORD
DB_SSL=false
OSS_REGION=oss-cn-hongkong
OSS_BUCKET=YOUR_PRIVATE_BUCKET
ALIBABA_CLOUD_ECS_ROLE_NAME=atlas-ecs-role
```

Do not paste `.env` into chat, email, tickets, screenshots, or Git commits.

## 6. Build and start

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=150
```

The app is intentionally bound to `127.0.0.1:3000`; do not open port 3000 in the ECS security group.

Verify the local service from ECS:

```bash
curl -I http://127.0.0.1:3000/
docker compose exec atlas node scripts/check-db.mjs
```

## 7. Configure Nginx

Copy the provided template and replace the example domain:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/atlas
sudo nano /etc/nginx/sites-available/atlas
sudo ln -s /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/atlas
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

The ECS security group should allow public TCP 80 and 443, while TCP 22 should allow only the administrator's IP.

## 8. DNS and HTTPS

Create an A record for the chosen domain pointing to the ECS public IP. After DNS resolves:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d atlas.example.com
sudo certbot renew --dry-run
```

Update `APP_ORIGIN` and the OSS CORS origin to the final HTTPS domain, then restart:

```bash
docker compose up -d --force-recreate
```

## 9. Acceptance test

Test all of the following from both Shenzhen and Singapore:

- Load the globe and background slideshow.
- Expand and shrink the globe.
- Select every seeded city.
- Add a temporary city.
- Upload and delete a photo.
- Delete the temporary city.
- Refresh and verify persistence.
- Test Safari, Chrome, and a mobile browser.

Keep the existing `chatgpt.site` version online until this checklist passes.

## 10. Future updates

```bash
cd /opt/make-love-atlas
git pull
docker compose build
docker compose up -d
docker compose logs --tail=100
docker image prune -f
```
