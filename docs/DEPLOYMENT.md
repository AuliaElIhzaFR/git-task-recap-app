# Deployment Guide - Attendance Odoo Bot

## 📦 Docker Deployment

### Option 1: Docker Compose (Recommended)

Cara paling mudah untuk local testing dan development.

**Step 1: Setup environment**
```bash
cd misc/docker
cp .env.example .env
```

**Step 2: Edit `.env` dengan credentials kamu**
```bash
# Edit file .env
nano .env  # atau vim, code, dll
```

Isi dengan data benar:
```env
TELEGRAM_BOT_TOKEN=123456:ABCdefGHIjklMNOpqrsTUVwxyz
ODOO_URL=https://apps.yasaweb.com
ODOO_DB=stk
ODOO_USERNAME=asraf.muhammad07@gmail.com
ODOO_PASSWORD=your_password
ALLOWED_USER_IDS=123456789
```

**Step 3: Build dan jalankan**
```bash
# Masih di folder misc/docker
docker-compose up -d
```

Output:
```
Creating network "docker_default" with the default driver
Building attendance-bot
...
Creating attendance-odoo-bot ... done
```

**Step 4: Cek logs**
```bash
docker-compose logs -f
```

Kalau sukses, kamu akan lihat:
```
attendance-odoo-bot | ✅ Bot started successfully!
attendance-odoo-bot | 🤖 Listening for Telegram messages...
```

**Step 5: Test bot**
- Buka Telegram
- Kirim `/start` ke bot kamu
- Coba `/checkin` atau `/checkout`

**Stop bot:**
```bash
docker-compose down
```

**Restart bot (setelah update code):**
```bash
docker-compose down
docker-compose up -d --build
```

---

### Option 2: Manual Docker Build & Run

Kalau mau lebih control atau ga pake docker-compose.

**Step 1: Build image**
```bash
# Dari root project
docker build -f misc/docker/Dockerfile -t attendance-odoo-bot:latest .
```

Tunggu proses build (pertama kali bisa lama ~2-5 menit).

**Step 2: Run container**
```bash
docker run -d \
  --name attendance-bot \
  --restart unless-stopped \
  -e TELEGRAM_BOT_TOKEN="8263133973:AAHuKTLuHA1rQYEA926PkKBc48Og_rew0DM" \
  -e ODOO_URL="https://apps.yasaweb.com" \
  -e ODOO_DB="stk" \
  -e ODOO_USERNAME="asraf.muhammad07@gmail.com" \
  -e ODOO_PASSWORD="user123" \
  -e ALLOWED_USER_IDS="964322045" \
  attendance-odoo-bot:latest
```

**Step 3: View logs**
```bash
docker logs -f attendance-bot
```

**Stop & remove:**
```bash
docker stop attendance-bot
docker rm attendance-bot
```

**Rebuild after code changes:**
```bash
docker stop attendance-bot
docker rm attendance-bot
docker build -f misc/docker/Dockerfile -t attendance-odoo-bot:latest .
docker run -d --name attendance-bot --restart unless-stopped \
  -e TELEGRAM_BOT_TOKEN="..." \
  -e ODOO_URL="..." \
  -e ODOO_DB="..." \
  -e ODOO_USERNAME="..." \
  -e ODOO_PASSWORD="..." \
  -e ALLOWED_USER_IDS="..." \
  attendance-odoo-bot:latest
```

---

### Option 3: Pull dari Docker Hub (Production)

Setelah CI/CD build image dan push ke registry.

**Pull image:**
```bash
docker pull productzilla/attendance-odoo-bot:latest
# atau versi spesifik
docker pull productzilla/attendance-odoo-bot:v1.0.0
```

**Run:**
```bash
docker run -d \
  --name attendance-bot \
  --restart unless-stopped \
  -e TELEGRAM_BOT_TOKEN="your_token" \
  -e ODOO_URL="https://apps.yasaweb.com" \
  -e ODOO_DB="stk" \
  -e ODOO_USERNAME="your_username" \
  -e ODOO_PASSWORD="your_password" \
  -e ALLOWED_USER_IDS="123456789" \
  productzilla/attendance-odoo-bot:latest
```

---

### Docker Commands Cheat Sheet

```bash
# View running containers
docker ps

# View all containers (including stopped)
docker ps -a

# View logs (live)
docker logs -f attendance-bot

# View logs (last 100 lines)
docker logs --tail 100 attendance-bot

# Restart container
docker restart attendance-bot

# Stop container
docker stop attendance-bot

# Start stopped container
docker start attendance-bot

# Remove container
docker rm attendance-bot

# Remove container (force)
docker rm -f attendance-bot

# View container details
docker inspect attendance-bot

# Execute command in running container
docker exec -it attendance-bot /bin/sh

# View resource usage
docker stats attendance-bot

# View images
docker images | grep attendance

# Remove image
docker rmi attendance-odoo-bot:latest

# Clean up unused containers/images
docker system prune -a
```

---

### Troubleshooting Docker

**Problem: "Cannot connect to Docker daemon"**
```bash
# Start Docker Desktop (macOS/Windows)
# Atau start Docker service (Linux)
sudo systemctl start docker
```

**Problem: "Port already in use"**
```bash
# Bot ga pakai port, tapi kalau ada issue:
docker ps  # cek container lain yang mungkin conflict
```

**Problem: "Bot not responding"**
```bash
# Cek logs untuk error
docker logs attendance-bot

# Cek container masih running
docker ps | grep attendance

# Restart container
docker restart attendance-bot
```

**Problem: "Login failed / Authentication error"**
```bash
# Cek environment variables sudah benar
docker inspect attendance-bot | grep -A 20 Env

# Atau exec ke dalam container
docker exec -it attendance-bot /bin/sh
env | grep ODOO
env | grep TELEGRAM
```

**Problem: "Build failed"**
```bash
# Clear Docker cache dan rebuild
docker builder prune
docker build --no-cache -f misc/docker/Dockerfile -t attendance-odoo-bot:latest .
```

**Problem: "Container keeps restarting"**
```bash
# Cek logs untuk error
docker logs attendance-bot

# Stop restart policy temporarily
docker update --restart=no attendance-bot

# Fix issue, then enable restart
docker update --restart=unless-stopped attendance-bot
```

---

## ☸️ Kubernetes Deployment

### Prerequisites

1. **Create namespace (if not exists):**
```bash
kubectl create namespace bots
```

2. **Create secrets (if not exist):**

Secrets should be managed in vault with these keys:

**productzilla-password-secret:**
- `attendance-odoo-bot-telegram-token`
- `attendance-odoo-bot-username`
- `attendance-odoo-bot-password`
- `attendance-odoo-bot-allowed-user-ids`

**productzilla-secret:**
- `attendance-odoo-bot-url` (e.g., https://apps.yasaweb.com)
- `attendance-odoo-bot-db` (e.g., stk)

### Deploy to Staging

```bash
# Generate k8s manifest
cat misc/deployment/k8s.template.staging.yml | \
  sed "s/{{tags}}/dev/g" | \
  sed "s/{{namespace}}/bots/g" > k8s.generated.yml

# Apply
kubectl apply -f k8s.generated.yml

# Check status
kubectl get pods -n bots
kubectl logs -f deployment/attendance-odoo-bot-staging -n bots
```

### Deploy to Production

```bash
# Generate k8s manifest
cat misc/deployment/k8s.template.yml | \
  sed "s/{{tags}}/v1.0.0/g" | \
  sed "s/{{namespace}}/bots/g" > k8s.generated.yml

# Apply
kubectl apply -f k8s.generated.yml

# Check status
kubectl get pods -n bots
kubectl logs -f deployment/attendance-odoo-bot -n bots
```

### Useful kubectl Commands

```bash
# View logs
kubectl logs -f deployment/attendance-odoo-bot -n bots

# Restart deployment
kubectl rollout restart deployment/attendance-odoo-bot -n bots

# Check deployment status
kubectl rollout status deployment/attendance-odoo-bot -n bots

# Describe pod for debugging
kubectl describe pod -l app=attendance-odoo-bot -n bots

# Execute command in pod
kubectl exec -it deployment/attendance-odoo-bot -n bots -- /bin/sh

# View secrets
kubectl get secret productzilla-password-secret -n bots -o yaml
kubectl get secret productzilla-secret -n bots -o yaml
```

---

## 🔄 CI/CD

### Drone CI

Pipeline akan otomatis run saat:
- **Push ke branch develop** → Build & deploy to staging
- **Create tag** → Build production image
- **Custom event** → Deploy to production

**Required Secrets di Drone:**
```
docker_registry_user
docker_registry_password
k8s_namespace
k8s_config (base64 encoded kubeconfig)
```

**Create tag for release:**
```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

**Trigger production deployment:**
```bash
# Via Drone CLI
drone build promote <org>/<repo> <build_number> production

# Or via custom event
drone build create --param IMAGE_VERSION=v1.0.0 <org>/<repo>
```

---

## 🔐 Security Best Practices

### 1. Secrets Management

Never commit secrets to git. Use:
- **Local:** `.env` file (gitignored)
- **Docker:** Environment variables or secrets
- **Kubernetes:** Secrets
- **CI/CD:** Encrypted secrets

### 2. Container Security

Our Dockerfile implements:
- ✅ Multi-stage build (smaller image)
- ✅ Non-root user (UID 1001)
- ✅ Read-only root filesystem
- ✅ Drop all capabilities
- ✅ No privilege escalation
- ✅ Health checks

### 3. Network Security

Bot only makes outbound connections:
- Telegram API (HTTPS)
- Odoo API (HTTPS)

No inbound ports needed.

---

## 📊 Monitoring

### View Logs

**Docker:**
```bash
docker logs -f attendance-bot
```

**Kubernetes:**
```bash
kubectl logs -f deployment/attendance-odoo-bot -n bots
```

### Health Checks

**Docker health check:**
```bash
docker inspect --format='{{.State.Health.Status}}' attendance-bot
```

**Kubernetes readiness:**
```bash
kubectl get pods -n bots -w
```

### Common Issues

1. **Bot not responding:**
   - Check logs for errors
   - Verify bot token is correct
   - Check network connectivity

2. **Login fails:**
   - Verify Odoo credentials
   - Check ODOO_URL is accessible
   - Review TECHNICAL.md for auth issues

3. **Pod crashes:**
   - Check resource limits
   - Review logs: `kubectl logs <pod> -n bots --previous`
   - Verify secrets are set correctly

---

## 🔄 Updates & Rollback

### Update Deployment

**Kubernetes:**
```bash
# Update image version
kubectl set image deployment/attendance-odoo-bot \
  attendance-odoo-bot=productzilla/attendance-odoo-bot:v1.1.0 \
  -n bots

# Or edit deployment directly
kubectl edit deployment attendance-odoo-bot -n bots
```

### Rollback

```bash
# View rollout history
kubectl rollout history deployment/attendance-odoo-bot -n bots

# Rollback to previous version
kubectl rollout undo deployment/attendance-odoo-bot -n bots

# Rollback to specific revision
kubectl rollout undo deployment/attendance-odoo-bot --to-revision=2 -n bots
```

---

## 📈 Scaling

Bot is designed to run as single instance (no need for multiple replicas).

If you need redundancy:
```bash
kubectl scale deployment attendance-odoo-bot --replicas=2 -n bots
```

**Note:** Multiple instances will all receive same Telegram updates. Implement leader election if needed.

---

## 🧪 Testing

### Test locally before deploying:

```bash
# Run with .env file (from root)
yarn dev

# Test with Docker (from misc/docker/)
cd misc/docker
cp .env.example .env  # Edit with your credentials
docker-compose up

# Test production build
cd ../..
docker build -f misc/docker/Dockerfile -t test .
docker run --env-file misc/docker/.env test
```

---

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Drone CI Documentation](https://docs.drone.io/)
