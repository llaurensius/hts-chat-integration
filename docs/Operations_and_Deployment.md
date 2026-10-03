# 📘 Panduan Operasional (SOP) & Deployment
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi:** Workflow V4.2 Produksi  
**Audiens Dokumen:** Developer, System Administrator & Operator Helpdesk  
**Terakhir Diperbarui:** 03 Oktober 2026  

---

# BAGIAN A — PANDUAN DEPLOYMENT (3 TRACK STRATEGY)

Dokumen ini membagi instruksi instalasi ke dalam 3 jalur terstandarisasi sesuai kebutuhan lingkungan:
1. **Track 1:** Lingkungan Pengembangan Lokal (Local Development)
2. **Track 2:** Pengelolaan Gateway & Basis Data Kontainer (Docker Stack)
3. **Track 3:** Penerapan Server Produksi VPS Node.js Mandiri (Ubuntu 22.04 LTS via PM2 & Nginx)

---

## TRACK 1: PENGEMBANGAN LOKAL (LOCAL DEVELOPMENT)

### 1.1 Prasyarat Sistem
- **Sistem Operasi:** Windows 10/11 (WSL2 disarankan), macOS, atau Linux Ubuntu
- **Node.js:** Versi v18, v20, atau v22 LTS (disertai `npm`)
- **Docker & Docker Compose:** Docker Desktop aktif
- **Git**

### 1.2 Konfigurasi Lingkungan Backend
1. Masuk ke direktori `backend/`:
   ```bash
   cd backend
   npm install
   ```
2. Buat berkas `.env` di dalam folder `backend/`:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://helpdesk_user:SecretPassword123!@localhost:5433/wa_helpdesk?schema=public"
   JWT_SECRET="masukkan_string_acak_rahasia_minimal_32_karakter"

   # Evolution API (WhatsApp Gateway)
   EVOLUTION_API_URL="http://localhost:8080"
   EVOLUTION_API_TOKEN="SecureTokenUntukBackend123"
   EVOLUTION_INSTANCE_NAME="helpdesk-wa"

   # Shared Secret Autentikasi Webhook (SEC-01)
   WEBHOOK_SECRET="SecureTokenUntukBackend123"

   # URL Frontend untuk CORS Socket.io
   FRONTEND_URL="http://localhost:5200"
   ```

> ⚠️ **PENTING — Jebakan Port PostgreSQL:**  
> Berkas `docker-compose.yml` memetakan port `5433:5432` (host:container). Backend yang berjalan di mesin host **wajib memakai port `5433`** pada parameter `DATABASE_URL`. Jika salah menggunakan 5432, koneksi akan ditolak dengan kode Prisma `P1001`.

### 1.3 Menjalankan Docker Gateway & Database
Dari direktori root repositori, nyalakan kontainer:
```bash
docker compose -f docker/docker-compose.yml up -d
docker ps
```
Pastikan ketiga kontainer (`hts_postgres`, `hts_redis`, `hts_evolution_api`) berstatus **Up**.

### 1.4 Migrasi & Inisialisasi Database
Jalankan sinkronisasi skema Prisma dan data awal:
```bash
cd backend
npx prisma generate
npx prisma db push
npm run prisma:seed
```

### 1.5 Pairing Nomor WhatsApp Helpdesk
Jalankan skrip inisialisasi instance Evolution API:
```bash
npm run setup:evolution
```
1. Buka berkas `backend/qr.html` pada browser Anda.
2. Buka aplikasi WhatsApp pada ponsel Helpdesk, masuk ke menu **Perangkat Tertaut (Linked Devices)**, dan pindai QR Code.
3. Konfirmasi status koneksi dengan membuka: `http://localhost:8080/instance/connectionState/helpdesk-wa` (harus berstatus `"state": "open"`).

### 1.6 Menjalankan Frontend Web
Buka terminal baru, masuk ke direktori `frontend/`:
```bash
cd frontend
npm install
npm run dev
```
Akses antarmuka dasbor pada browser: **`http://localhost:5200`**.

---

## TRACK 2: DOCKER-BASED STACK & GATEWAY MANAGEMENT

### 2.1 Arsitektur Layanan Docker (`docker/docker-compose.yml`)
Stack kontainer mencakup 3 service terisolasi dalam jaringan bridge `hts-net`:
- **`hts_postgres` (postgres:15-alpine):**
  - Port Host: `5433` $\rightarrow$ Port Kontainer: `5432`
  - Inisialisasi basis data otomatis via `init.sql`: membuat database `evolution_db` dan memberikan wewenang ke `helpdesk_user`.
  - Volume persistensi: `pgdata:/var/lib/postgresql/data`
- **`hts_redis` (redis:alpine):**
  - Port Host: `6379` $\rightarrow$ Port Kontainer: `6379`
  - Digunakan sebagai session store & cache antrean pesan Evolution API.
  - Volume persistensi: `redisdata:/data`
- **`hts_evolution_api` (evoapicloud/evolution-api:latest):**
  - Port Host: `8080` $\rightarrow$ Port Kontainer: `8080`
  - Terhubung langsung ke database `evolution_db` dan Redis di jaringan `hts-net`.

### 2.2 Konfigurasi Alamat Webhook Antar-Kontainer vs Host
Evolution API mengirimkan webhook event ke backend Node.js. Alamat URL webhook dikonfigurasi sebagai berikut:
- **Pengembangan Lokal (Docker to Host):** Gunakan IP bridge gateway Docker `http://172.17.0.1:3000/api/webhook/whatsapp` (atau `http://host.docker.internal:3000/api/webhook/whatsapp` pada macOS/Windows).
- **Produksi VPS:** Gunakan loopback host `http://127.0.0.1:3000/api/webhook/whatsapp` atau domain publik `https://helpdesk.diskominfo.jatengprov.go.id/api/webhook/whatsapp`.

### 2.3 Perawatan Kontainer & Prosedur Cadangan (Backup)
```bash
# Backup Basis Data wa_helpdesk ke file SQL lokal
docker exec -t hts_postgres pg_dump -U helpdesk_user wa_helpdesk > backup_wa_helpdesk_$(date +%Y%m%d).sql

# Memulihkan (Restore) Basis Data
docker exec -i hts_postgres psql -U helpdesk_user -d wa_helpdesk < backup_wa_helpdesk_20261003.sql

# Memantau Log Gateway WhatsApp
docker compose -f docker/docker-compose.yml logs -f evolution-api
```

---

## TRACK 3: STANDALONE NODE.JS VPS DEPLOYMENT (UBUNTU 22.04 LTS)

Panduan ini ditujukan untuk implementasi di server VPS produksi Diskominfo Provinsi Jawa Tengah.

### 3.1 Kebutuhan Minimum VPS
- **CPU:** 2 vCPU (Disarankan 4 vCPU)
- **RAM:** 4 GB (Disarankan 8 GB untuk kenyamanan Docker + Node.js)
- **Penyimpanan:** 40 GB SSD / NVMe
- **OS:** Ubuntu 22.04 LTS x86_64
- **Domain:** Terdaftar domain resmi (misal: `helpdesk.diskominfo.jatengprov.go.id`)

### 3.2 Persiapan Server & Instalasi Dependensi
```bash
# Update paket sistem
sudo apt update && sudo apt upgrade -y

# Instalasi Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential nginx certbot python3-certbot-nginx

# Instalasi Process Manager PM2 secara global
sudo npm install -g pm2
```

### 3.3 Menjalankan Docker Stack Database di VPS
```bash
# Kloning repositori proyek
cd /var/www
sudo git clone https://github.com/llaurensius/hts-chat-integration.git
sudo chown -R $USER:$USER /var/www/hts-chat-integration
cd /var/www/hts-chat-integration

# Nyalakan PostgreSQL, Redis, dan Evolution API
docker compose -f docker/docker-compose.yml up -d
```

### 3.4 Konfigurasi & Menjalankan Backend via PM2
1. Konfigurasi file `.env` di `/var/www/hts-chat-integration/backend/.env`:
   ```bash
   cd /var/www/hts-chat-integration/backend
   nano .env
   ```
   *Isi variabel lingkungan produksi dengan kredensial yang kuat (buat JWT_SECRET dan WEBHOOK_SECRET menggunakan `openssl rand -hex 32`).*

2. Instalasi dependensi & migrasi database:
   ```bash
   npm install --production=false
   npx prisma generate
   npx prisma db push
   npm run prisma:seed
   ```

3. Jalankan backend menggunakan PM2:
   ```bash
   pm2 start src/index.js --name "hts-backend"
   pm2 save
   pm2 startup
   ```
   *(Jalankan perintah sudo env yang ditampilkan oleh `pm2 startup` agar service otomatis berjalan saat server reboot).*

4. Pasang modul rotasi log PM2:
   ```bash
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 20M
   pm2 set pm2-logrotate:retain 10
   ```

### 3.5 Build Frontend Vite untuk Produksi
```bash
cd /var/www/hts-chat-integration/frontend
npm install
npm run build
```
Hasil build bundel HTML/JS/CSS akan tercipta di direktori `/var/www/hts-chat-integration/frontend/dist`.

### 3.6 Konfigurasi Reverse Proxy Nginx & WebSocket
Buat konfigurasi virtual host Nginx:
```bash
sudo nano /etc/nginx/sites-available/hts-helpdesk.conf
```

Tempelkan konfigurasi berikut:
```nginx
server {
    listen 80;
    server_name helpdesk.diskominfo.jatengprov.go.id;

    # 1. Antarmuka Web Frontend (SPA)
    location / {
        root /var/www/hts-chat-integration/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 2. REST API Backend Passthrough
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }

    # 3. Static Media Berkas Unggahan
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000/uploads/;
        proxy_set_header Host $host;
        client_max_body_size 50M;
    }

    # 4. WebSocket Real-time (Socket.io)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktifkan konfigurasi dan restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/hts-helpdesk.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3.7 Memasang Sertifikat SSL Gratis (Let's Encrypt / Certbot)
```bash
sudo certbot --nginx -d helpdesk.diskominfo.jatengprov.go.id
```

### 3.8 Konfigurasi Firewall Server (UFW)
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
sudo ufw status
```

---

# BAGIAN B — STANDAR OPERASIONAL PROSEDUR (SOP) OPERATOR

## 1. SOP DISPATCHER LEVEL 1 (L1)

### Tahap 1: Hubungkan Akun Portal Resmi HTS
1. Buka antarmuka dasbor helpdesk. Pada panel samping kanan, periksa blok **"Portal HTS Diskominfo"**.
2. Jika berstatus **`Belum Terhubung`**, klik tombol **"Hubungkan Akun HTS"**.
3. Gambar kode CAPTCHA visual akan dimuat secara live. Masukkan email resmi HTS Anda, kata sandi, dan 4 digit angka CAPTCHA (klik ikon 🔄 bila gambar kurang jelas).
4. Klik **"Login ke Portal HTS"**. Panel kanan akan berubah menjadi hijau: **`Terhubung sebagai [Nama Petugas]`**. Sesi ini akan dijaga otomatis oleh worker keep-alive setiap 15 menit.

### Tahap 2: Menerima Pesan & Verifikasi Identitas Pelapor
1. Setiap pesan masuk dari WhatsApp pelapor akan membentuk baris obrolan baru berstatus `OPEN`.
2. Klik nama pelapor pada kolom antrean kiri.
3. Periksa identitas nama dan instansi (OPD). Jika pelapor belum tercatat di Master Data resmi, klik ikon pensil ✏️ di samping nama pelapor pada panel detail untuk menyematkan nama resmi dan SKPD.

### Tahap 3: Pendelegasian Tugas ke Teknisi L2
1. Jika laporan merupakan kendala teknis lapangan, klik tombol **"Assign ke L2"** di header obrolan.
2. Centang tim teknisi yang relevan (`Network`, `Server`, dan/atau `Mechanical & Electrical`). Anda dapat mencentang lebih dari satu tim sekaligus.
3. Pilih jenis layanan (*Service Type*) $\rightarrow$ klik **"Simpan Penugasan"**.
4. Sistem otomatis mempromosikan obrolan menjadi **Aduan Teknis Resmi** dan membroadcast notifikasi tugas ke grup/nomor WhatsApp teknisi terkait.

### Tahap 4: Koordinasi Catatan Internal vs Balasan Pelanggan
- Gunakan tab **💬 Balas Pelanggan (WhatsApp)** untuk mengirim balasan resmi ke nomor WhatsApp pelapor (gelembung chat biru). Anda juga dapat menggunakan pintasan keyboard `/` untuk memunculkan balasan cepat (*Quick Replies*).
- Gunakan tab **🔒 Catatan Internal** untuk bertukar pesan instruksi atau melihat kiriman foto teknisi L2 (latar amber/kuning). Catatan internal **100% rahasia** dan tidak akan pernah terkirim ke WhatsApp pelanggan.

### Tahap 5: Sinkronisasi Tiket ke Portal HTS
1. Buka drawer melalui tombol **`[ 🌐 Sinkronkan ke Portal HTS ]`** di panel kanan:
   - **Tab Terbitkan Baru:** Isi nama pemohon, instansi, kategori masalah, uraian detil (minimal 10 karakter), PIC penerima, dan lampirkan multi-foto bukti kendala $\rightarrow$ klik **Terbitkan ke Portal HTS**.
   - **Tab Tautkan yang Sudah Ada:** Jika aduan telah terdaftar sebelumnya di portal HTS, masukkan nomor aduan resmi dan pilih divisi tim terkait $\rightarrow$ klik **Verifikasi & Tautkan Tiket**.
2. Nomor aduan resmi (misal: `#2041-TShoot-2026-jateng-10`) akan tampil sebagai kartu aktif di panel kanan.

### Tahap 6: Menutup Tiket Resmi & Dual-Close
1. Setelah seluruh teknisi L2 menyelesaikan pekerjaannya (indikator di header: `✓ Selesai`), klik tombol **"Selesaikan"** di header obrolan.
2. Modal penutupan tiket akan terbuka:
   - Masukkan ringkasan solusi wajib (*Mandatory Summary* minimal 10 karakter).
   - Jika terdapat tiket HTS yang masih berstatus `PENDING`, formulir solusi HTS akan aktif: centang PIC penerima dan penanganan, serta pilih foto bukti penanganan dari catatan internal.
3. Klik **"Konfirmasi Tutup Tiket"**. Sistem akan memvalidasi penyelesaian ke portal HTS terlebih dahulu sebelum menutup tiket lokal.

---

## 2. SOP TEKNISI LAPANGAN LEVEL 2 (L2)

1. **Menerima Tugas:** Teknisi menerima pesan notifikasi blast di WhatsApp/grup tim lapangan $\rightarrow$ Login ke dasbor web menggunakan akun pilar masing-masing (`l2_network`, `l2_server`, atau `l2_me`).
2. **Analisis Laporan:** Buka tiket pada antrean kerja. Teknisi berada dalam mode **View-Only** terhadap percakapan WhatsApp pelapor (tidak dapat mengirim pesan langsung ke WhatsApp pelanggan).
3. **Koordinasi Lapangan:** Tulis progres pemeriksaan pada kolom **Catatan Internal**. Teknisi dapat mengunggah foto bukti kabel putus, switch error, atau hasil perbaikan lapangan via tombol ikon klip lampiran.
4. **Tandai Selesai:** Setelah perbaikan tuntas, klik tombol **"Tandai Selesai"** $\rightarrow$ masukkan uraian solusi perbaikan teknis. Bagian tim Anda akan berubah menjadi hijau `✓ Selesai`.
5. **Pelepasan Tugas (Salah Kamar):** Jika laporan kendala bukan wewenang pilar tim Anda, klik tombol **"Kembalikan / Lepas Penugasan"** disertai alasan objektif agar Dispatcher L1 dapat mengalihkan tiket ke tim yang tepat.

---

## 3. SOP ADMINISTRATOR SISTEM (ADMIN)

1. **Manajemen Akun Staf (Menu Users):** Tambah akun baru, perbarui data profil/role staf, tentukan divisi pilar L2, atau lakukan reset kata sandi.
2. **Pengelolaan Kontak Blast L2 (Ikon Sinyal 📡):** Daftarkan nomor telepon WhatsApp pribadi teknisi atau ID grup WhatsApp (`xxx@g.us`) tujuan notifikasi tugas per pilar.
3. **Pengelolaan Master Data Kontak Pelanggan:**
   - Masuk ke modal Chat Baru $\rightarrow$ klik **"Import Master Data Kontak"**.
   - Unggah berkas Excel (`.xlsx`), CSV, atau vCard (`.vcf`) daftar pejabat/PIC OPD Jawa Tengah.
   - Gunakan tombol **`[ 🗑 Hapus Semua Kontak ]`** jika ingin membersihkan seluruh data kontak pelanggan dan me-reset urutan ID kembali ke angka 1.
4. **Pembersihan Data Testing (Menu Rekapitulasi):** Pilih tiket testing yang ingin dihapus, atau klik tombol **Hapus Semua Data** (dengan konfirmasi ketik `HAPUS`) untuk mengosongkan seluruh tiket, percakapan, dan me-reset sequence nomor tiket kembali ke ID #1.

---

## 4. SOP SUPERVISOR (SPV)

1. **Monitoring Antrean Real-time:** Memantau distribusi tiket aktif antara percakapan biasa dan aduan teknis resmi.
2. **Evaluasi Indikator SLA (Menu Rekapitulasi):**
   - **First Response Time (FRT):** Memastikan kecepatan respons awal staf helpdesk L1 terhadap pesan masuk pelanggan.
   - **Mean Time to Resolve (MTTR):** Mengevaluasi durasi rata-rata penyelesaian kendala teknis lapangan oleh teknisi L2.
3. **Ekspor Laporan:** Klik tombol **`[ 📥 Export to CSV ]`** untuk mengunduh rekapitulasi penanganan layanan berkala sebagai bahan laporan pimpinan Diskominfo.
