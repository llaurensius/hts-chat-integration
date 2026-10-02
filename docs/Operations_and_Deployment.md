# 📘 Panduan Operasional (SOP) & Deployment
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi:** Workflow V4.1 Produksi  
**Audiens Dokumen:** Developer & Operator Helpdesk  

---

# BAGIAN A — PANDUAN DEPLOYMENT

## 1. Kebutuhan Sistem Minimum

- **OS:** Linux Ubuntu 22.04 LTS (atau distro 64-bit lain) / WSL2 untuk dev
- **CPU:** minimal 2 core (disarankan 4)
- **RAM:** minimal 4 GB (disarankan 8 GB untuk Docker + Evolution API)
- **Storage:** minimal 30 GB SSD
- **Software:** Docker Engine v24+ & Docker Compose v2+, Node.js v18/v20/v22 LTS, npm, Git

## 2. Docker Compose (`docker/docker-compose.yml`)

3 layanan: **PostgreSQL 15** (`hts_postgres`), **Redis** (`hts_redis`), **Evolution API** (`hts_evolution_api`).

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: hts_postgres
    environment:
      POSTGRES_USER: helpdesk_user
      POSTGRES_PASSWORD: <PASSWORD_DB>
      POSTGRES_DB: wa_helpdesk
    ports:
      - "5433:5432"   # HOST:CONTAINER — backend di host wajib pakai 5433
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro

  redis:
    image: redis:alpine
    ports: ["6379:6379"]

  evolution-api:
    image: evoapicloud/evolution-api:latest
    ports: ["8080:8080"]
    environment:
      - AUTHENTICATION_API_KEY=<TOKEN_EVOLUTION>
      - DATABASE_CONNECTION_URI=postgresql://helpdesk_user:<PASSWORD_DB>@postgres:5432/evolution_db
      - CACHE_REDIS_URI=redis://redis:6379/1
    depends_on: [postgres, redis]
```

```bash
docker compose up -d
docker ps | grep hts_          # pastikan ketiga container status Up
docker port hts_postgres       # verifikasi mapping port aktual
```

> ⚠️ **Jebakan port (sering terjadi):** `5433:5432` artinya dari HOST pakai **5433**, dari dalam container pakai 5432. `DATABASE_URL` di `.env` backend dihost **wajib `localhost:5433`**. Jika salah → error `P1001: Can't reach database server`.

## 3. Konfigurasi Backend (`backend/.env`)

```env
PORT=3000
DATABASE_URL="postgresql://helpdesk_user:<PASSWORD_DB>@localhost:5433/wa_helpdesk?schema=public"
JWT_SECRET=<JWT_SECRET>
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_TOKEN=<TOKEN_EVOLUTION>
EVOLUTION_INSTANCE_NAME="helpdesk-wa"
```

Urutan instalasi di mesin baru:
```bash
cd backend
npm install
npx prisma generate     # WAJIB di mesin baru — jangan copy folder node_modules antar mesin
npx prisma db push      # buat seluruh tabel + index + enum
npm run dev             # atau: pm2 start src/index.js --name hts-backend
```

> **Catatan VPS/percobaan di mesin lain:** dokumentasi deployment spesifik server tersebut tidak dicatat di sini (lingkungan terpisah). Prinsipnya sama: `docker compose up -d` → periksa `DATABASE_URL` port → `prisma generate` → `prisma db push` → seeding akun → jalankan backend.
> Jika DB baru kosong, wajib seeding akun login (`User`), jika tidak login gagal.

## 4. Konfigurasi Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev
```

- `vite.config.js`: `server: { host: '0.0.0.0', port: 5200 }` (buka akses jaringan).
- Backend URL dideteksi otomatis via `window.location.hostname` (berfungsi untuk akses LAN tanpa konfigurasi tambahan).
- Mode produksi: `npm run build` → hasil di `frontend/dist`, sajikan via Nginx.

## 5. Akses Jaringan Lokal (LAN)

```bash
hostname -I                       # IP mesin server
sudo ufw allow 5200/tcp           # frontend
sudo ufw allow 3000/tcp           # backend
# klien LAN akses: http://<IP_SERVER>:5200
```

## 6. Pairing Nomor WhatsApp ke Evolution API

```bash
cd backend
node src/scripts/setupEvolution.js   # npm run setup:evolution
```
1. Akses `backend/qr.html` di browser.
2. Scan QR dari HP Helpdesk → WhatsApp → *Perangkat Tertaut / Linked Devices*.
3. Verifikasi: `GET /instance/connectionState/helpdesk-wa` harus `"state":"open"`.

## 7. Reverse Proxy Nginx (Domain Publik / HTTPS)

```nginx
server {
    listen 80;
    server_name helpdesk.instansi.go.id;

    location / {
        root /var/www/hts-frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_set_header Host $host;
        client_max_body_size 50M;
    }
    location /uploads/ { proxy_pass http://localhost:3000/uploads/; }
    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 8. Checklist Pasca-Perubahan Kode (Deployment Hygiene)

1. **Backend:** `Ctrl+C` lalu `npm run dev` ulang (nodemon di filesystem Windows/WSL sering TIDAK auto-reload).
2. **Skema DB berubah?** → `npx prisma generate` + `npx prisma db push`.
3. **Frontend dev:** refresh browser; **produksi:** `npm run build`.
4. **Deploy bersamaan:** jika respons API berubah format (contoh: pagination `contacts/contacts/search`), backend & frontend harus dirilis bersamaan, lalu hard-refresh browser (`Ctrl+Shift+R`) untuk membersihkan cache.

---

# BAGIAN B — SOP OPERASIONAL

## 1. SOP Dispatcher L1 (Garda Depan)

### Tahap 1 — Hubungkan Akun Portal HTS
1. Panel kanan **"Portal HTS Diskomdigi"** → status **`Belum Terhubung`**.
2. Klik **"Hubungkan Akun HTS"** → gambar CAPTCHA numerik live dimuat.
3. Masukkan Email HTS, Password, teks CAPTCHA (klik 🔄 bila kurang jelas) → **"Login ke Portal HTS"**.
4. Status hijau **`Terhubung`** — sesi tersimpan, tidak perlu login ulang selama aktif (heartbeat 15 menit).

### Tahap 2 — Menerima Aduan Baru & Verifikasi Identitas
1. Pesan WA pelanggan membuat tiket `OPEN` + bot membalas (jika aktif).
2. Tiket baru muncul di kolom kiri; klik untuk membuka percakapan.
3. Verifikasi nama & instansi pelapor; edit via ikon pensil ✏️ bila perlu (nama jadi permanen).

### Tahap 3 — Menerbitkan Tiket ke Portal HTS
**Cara A — Tombol `[ 🌐 Sinkronkan ke Portal HTS ]` (panel kanan), drawer 2 tab:**
- Tab `[ ➕ Terbitkan Baru ]`: isi nama pemohon, instansi, OPD Induk (opsional), kategori (sub-kategori hanya untuk *Troubleshoot*), detil min. 10 karakter (ada live counter), PIC, **lampiran multi-foto (2–3 file sekaligus)** → **Terbitkan ke Portal HTS**.
- Tab `[ 🔗 Tautkan yang Sudah Ada ]`: input nomor aduan resmi + pilih divisi tim → **Verifikasi & Tautkan Tiket** (divisi dipilih → tim otomatis ditugaskan). Duplikat di percakapan yang sama ditolak; nomor di tiket lain muncul dialog force link.

**Cara B — Otomatis saat penugasan L2:** centang "Sinkronkan ke Portal HTS sekaligus" di modal assign.

### Tahap 4 — Menugaskan Tim L2
1. Klik **"Assign ke L2"** → centang `Network` / `Server` / `M&E`.
2. Pilih jenis layanan → **Simpan Penugasan**.
3. WhatsApp Blast terkirim otomatis ke kontak tim yang **baru** ditugaskan.
4. Perhatian: pelepasan tim aktif memunculkan konfirmasi.

### Tahap 5 — Dua Mode Komunikasi
- Tab **💬 Balas Pelanggan (WhatsApp)** — pesan terkirim ke WA pelapor (gelembung biru). Bisa juga dibalas langsung dari HP fisik helpdesk — tersinkronisasi sebagai `AGENT`.
- Tab **🔒 Catatan Internal** — amber/kuning, **100% rahasia**, tidak pernah ke WA pelapor (bisa berupa foto L2).

### Tahap 6 — Pantau Progres L2
- Header menampilkan status real-time (`✓ Network: Selesai`, `⏳ Server: Dikerjakan`).
- Tiket otomatis `RESOLVED` setelah **seluruh** tim selesai.

### Tahap 7 — Menutup Tiket Resmi & Dual-Close
1. Klik **"Selesaikan"** di header.
2. Di modal: kategori tercentang otomatis, kesimpulan terisi dari solusi L2 (min. 10 karakter).
3. Opsi HTS: checkbox "Tutup di HTS" hanya muncul bila masih ada tiket HTS `PENDING`; jika **semua sudah SOLVED**, badge hijau tampil dan form HTS disembunyikan.
4. PIC penerima (badge hijau) + PIC penanganan (badge biru) digabung (`"14,8"`).
5. **Kebijakan keamanan (V4.1):** submit ke HTS gagal — termasuk **sebagian** dari banyak tiket HTS — → penutupan lokal **dibatalkan**, chat tetap terbuka, dan alert menampilkan **daftar nomor HTS yang gagal beserta alasan** (mis. sesi expired / nomor tidak ditemukan). Setelah itu, hubungkan ulang akun HTS lalu coba kembali. Tiket HTS yang kolom legacy-nya salah di-set `SOLVED` akan otomatis dikembalikan ke `PENDING` (*self-healing*), sehingga form penutupan HTS muncul kembali tanpa perbaikan data manual.
6. Tombol **`[ Selesaikan ke Portal HTS ]`** untuk menuntaskan sisa tiket `PENDING`.

### Tahap 8 — Fitur Tambahan L1
- **`[ ➕ Chat Baru ]`** (atas antrean): pilih kontak dari direkontori (paginasi, tombol *Muat lebih banyak*), isi pesan pembuka; **toggle ON** = kirim langsung, **OFF** = hanya buka tiket tanpa kirim WA.
- **Tab `✓ Selesai`** → tiket `CLOSED` → **`[ 🔄 Aktifkan Kembali Tiket ]`** untuk pertanyaan lanjutan (alasan dicatat sebagai catatan internal).
- **`[ ✅ Selesaikan Percakapan ]`** untuk percakapan biasa (langsung CLOSED, bebas SLA).
- **Badge ❎ hapus per kartu HTS** untuk melepas tautan nomor yang salah.

---

## 2. SOP Teknisi L2 (Spesialis Lapangan)

1. **Terima tugas:** notifikasi WA blast di HP/grup tim → login akun bidang (`l2_network`, `l2_server`, `l2_me`). Antrean hanya memuat tiket tim sendiri.
2. **Analisis:** baca keluhan & gambar pelapor — mode **View-Only** (tidak bisa balas WA pelapor).
3. **Catatan internal** (kolom kuning): tulis progres lapangan, bisa kirim foto bukti → berlabel `🏷️ Catatan Internal - Tim X (Nama)`, dijamin privat.
4. **Tandai Selesai:** masukkan solusi teknis → bagian tim berubah `✓ Selesai`. Catatan solusi otomatis jadi draf penutupan L1 & respon HTS.
5. **Salah kamar?** → **"Kembalikan / Lepas"** + alasan; tim lain tidak terganggu.

---

## 3. SOP Administrator

1. **Manajemen Pengguna** (menu *Users*): tambah/edit/hapus akun, set role & kategori tim L2, reset password.
2. **Kontak Blast Tim L2** (ikon 📡): kelola nomor personil & grup WA per tim, inline edit (✏️).
3. **Master Data Kontak** (di modal Chat Baru → *Import Master Data Kontak*):
   - Unggah Excel/CSV/VCF (contoh template: `docs/contacts.csv`, `docs/contacts.vcf`).
   - Hasil jadi **identitas prioritas utama** (tidak tertimpa nama profil WA).
   - Tombol **`[ 🗑 Hapus Semua Kontak ]`**: konfirmasi ketik `HAPUS KONTAK`, reset sequence ID.
4. **Pembersihan Rekap** (menu *Rekap*): hapus terpilih (batch) atau **Hapus Semua Data** (ketik `HAPUS`) → hapus tiket/pesan/pelanggan + **reset sequence ID ke 1**.

---

## 4. SOP Supervisor (SPV)

1. Pantau antrean & SLA real-time.
2. Menu **Rekap Hasil Aduan**: tabel historis (tiket lokal, nomor HTS multi, pelapor, status, jenis layanan, waktu, durasi, kesimpulan).
3. Metrik KPI: total aduan teknis, total percakapan biasa, rata-rata FRT, rata-rata MTTR (aduan murni saja).
4. Klik **`[ 📥 Export to CSV ]`** untuk laporan berkala.
