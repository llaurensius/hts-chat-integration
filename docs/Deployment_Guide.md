# 🚀 Panduan Deployment & Instalasi Server (Deployment Guide)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Target Lingkungan:** Jaringan Lokal (LAN / On-Premise) & Server Produksi (Linux Ubuntu)

---

## 1. Kebutuhan Sistem Minimum (*Minimum Requirements*)

- **Sistem Operasi:** Linux Ubuntu 22.04 LTS (atau varian Linux 64-bit lainnya).
- **CPU:** Minimal 2 Cores (Disarankan 4 Cores).
- **RAM:** Minimal 4 GB (Disarankan 8 GB untuk kelancaran Docker & Evolution API).
- **Penyimpanan:** Minimal 30 GB SSD.
- **Perangkat Lunak Pendukung:**
  - Docker Engine v24+ & Docker Compose v2+
  - Node.js v18 LTS atau v20 LTS & npm
  - Git

---

## 2. Arsitektur Docker Compose (`docker-compose.yml`)

Layanan WhatsApp Gateway dan Database dijalankan melalui Docker dengan konfigurasi database terpisah:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: hts_postgres
    restart: always
    environment:
      POSTGRES_USER: helpdesk_user
      POSTGRES_PASSWORD: SecretPassword123!
      POSTGRES_DB: wa_helpdesk
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:alpine
    container_name: hts_redis
    restart: always
    ports:
      - "6379:6379"

  evolution-api:
    image: evoapicloud/evolution-api:latest
    container_name: hts_evolution_api
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_URL=http://localhost:8080
      - AUTHENTICATION_API_KEY=SecureTokenUntukBackend123
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://helpdesk_user:SecretPassword123!@postgres:5432/evolution_db?schema=public
      - REDIS_ENABLED=true
      - REDIS_URI=redis://redis:6379
      - WEBHOOK_GLOBAL_ENABLED=true
      - WEBHOOK_GLOBAL_URL=http://172.17.0.1:3000/api/webhook/whatsapp
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
```

> **Catatan Jaringan Docker ke Host:**  
> Parameter `http://172.17.0.1:3000` adalah alamat IP default *Docker Bridge* yang menghubungkan container Evolution API ke server Node.js yang berjalan di host.

Jalankan container dengan perintah:
```bash
docker compose up -d
```

---

## 3. Konfigurasi Backend Node.js

Masuk ke direktori `backend/`:
```bash
cd backend
npm install
```

Buat atau sesuaikan berkas konfigurasi `.env`:
```env
PORT=3000
DATABASE_URL="postgresql://helpdesk_user:SecretPassword123!@localhost:5432/wa_helpdesk?schema=public"
JWT_SECRET="supersecret_jwt_key_123"
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_TOKEN="SecureTokenUntukBackend123"
EVOLUTION_INSTANCE_NAME="helpdesk-wa"
```

### Sinkronisasi Skema Database & Seeding Awal:
```bash
npx prisma db push
npm run prisma:seed
```
*(Perintah ini akan membuat seluruh tabel, enum, 3 kategori tim L2, dan akun default).*

### Menjalankan Backend:
```bash
npm run dev
# Atau untuk mode background produksi menggunakan PM2:
# pm2 start src/index.js --name "hts-backend"
```

---

## 4. Konfigurasi Frontend (React Vite)

Masuk ke direktori `frontend/`:
```bash
cd frontend
npm install
```

Pastikan [`vite.config.js`](file:///media/lauren/40CACB68CACB58B41/hts-chat-integration/frontend/vite.config.js) dikonfigurasi agar mendengarkan seluruh antarmuka jaringan:
```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Membuka akses jaringan lokal (LAN)
    port: 5173
  }
})
```

Jalankan frontend:
```bash
npm run dev
```

---

## 5. Konfigurasi Akses Jaringan Lokal (LAN / Wi-Fi Kantor)

Sistem sudah dilengkapi deteksi hostname dinamis (`window.location.hostname`):
1. Cek alamat IP lokal komputer server:
   ```bash
   hostname -I
   # Contoh hasil: 192.168.10.100
   ```
2. Pastikan port `5173` dan `3000` tidak terblokir oleh firewall lokal (`ufw`):
   ```bash
   sudo ufw allow 5173/tcp
   sudo ufw allow 3000/tcp
   ```
3. Komputer lain di jaringan yang sama dapat langsung mengakses:
   ```text
   http://192.168.10.100:5173
   ```

---

## 6. Pairing Nomor WhatsApp Instansi ke Evolution API

1. Buka browser dan akses dasbor/endpoint Evolution API atau gunakan skrip pairing:
   ```bash
   cd backend
   node setupEvolution.js
   ```
2. Scan QR Code yang dihasilkan melalui aplikasi WhatsApp di ponsel Helpdesk (*Perangkat Tertaut / Linked Devices*).
3. Pastikan status koneksi bernilai `"state": "open"`.

---

## 7. Rekomendasi Reverse Proxy Nginx (Untuk Domain Publik / HTTPS)

Jika ingin mempublikasikan sistem menggunakan domain resmi (misal `helpdesk.instansi.go.id`):

```nginx
# 1. Konfigurasi Frontend (Web Dashboard)
server {
    listen 80;
    server_name helpdesk.instansi.go.id;

    location / {
        root /var/www/hts-frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy ke Backend REST API & Static Uploads
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 50M;
    }

    location /uploads/ {
        proxy_pass http://localhost:3000/uploads/;
        proxy_set_header Host $host;
    }

    # Proxy WebSocket (Socket.io)
    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```
