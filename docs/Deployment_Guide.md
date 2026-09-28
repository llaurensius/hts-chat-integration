# Panduan Deployment & Setup (Deployment Guide)
**Proyek:** Integrasi WhatsApp ke Web Helpdesk

Dokumen ini ditujukan bagi tim **DevOps / Sysadmin** yang akan menyiapkan lingkungan *server* (Production/Staging).

## 1. Kebutuhan Server (Minimum Requirements)
*   **OS:** Ubuntu 22.04 LTS (atau varian Linux stabil lainnya).
*   **RAM:** Min. 4 GB (disarankan 8 GB jika *traffic* WA sangat tinggi).
*   **CPU:** 2 Cores.
*   **Storage:** 50 GB SSD.
*   **Software Terinstal:** Docker, Docker Compose, Nginx, Git, Node.js (v18+).

## 2. Struktur Konfigurasi Docker (Docker Compose)
Sangat direkomendasikan menjalankan *Database* dan *Evolution API* di dalam Docker agar isolasi data aman.

**Contoh file `docker-compose.yml` (Fundamental):**
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_USER: helpdesk_user
      POSTGRES_PASSWORD: SecretPassword123!
      POSTGRES_DB: wa_helpdesk
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  evolution-api:
    image: atendai/evolution-api:latest
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_URL=https://wa-api.instansi.go.id
      - AUTH_TOKEN=SecureTokenUntukBackend123
      - WEBHOOK_GLOBAL_URL=https://backend.instansi.go.id/api/webhook/whatsapp
    depends_on:
      - postgres

volumes:
  pgdata:
```

## 3. Checklist Environment Variables (.env)
Tim *Backend* dan *Frontend* membutuhkan file `.env` di masing-masing repositori:

**Backend (.env):**
*   `PORT` = 3000
*   `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`
*   `JWT_SECRET` = (String acak 64 karakter)
*   `EVOLUTION_API_URL` = http://localhost:8080
*   `EVOLUTION_API_TOKEN` = SecureTokenUntukBackend123

**Frontend (.env):**
*   `VITE_API_BASE_URL` = https://backend.instansi.go.id/api
*   `VITE_SOCKET_URL` = wss://backend.instansi.go.id

## 4. Setup Reverse Proxy (Nginx)
Agar aplikasi dapat diakses melalui domain resmi dan aman (HTTPS/SSL).
1. `wa-api.instansi.go.id` di-proxy ke Port `8080` (Evolution API).
2. `backend.instansi.go.id` di-proxy ke Port `3000` (Node.js). *Catatan: Nginx wajib dikonfigurasi untuk mendukung `Upgrade: websocket` agar Socket.io berjalan lancar.*
3. `helpdesk.instansi.go.id` di-proxy ke direktori statis *build* dari React.js (Frontend).
