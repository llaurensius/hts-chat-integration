# 💬 HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)

Aplikasi **Web Helpdesk & Ticketing System** terintegrasi WhatsApp Gateway untuk pengelolaan keluhan pelanggan/instansi (PIC) secara *real-time* dengan dukungan **Role-Based Access Control (RBAC)** antara Dispatcher (L1), 3 Tim Teknisi Lapangan (L2: Network, Server, M&E), Administrator, dan Supervisor, serta terintegrasi langsung dengan portal resmi **Helpdesk Ticketing System (HTS) Diskominfo Provinsi Jawa Tengah**.

---

## 🌟 Fitur Utama (Workflow V4.2.1 Produksi)

- **🔄 Integrasi WhatsApp Dua Arah & HP Fisik (Evolution API v2):**
  - Pesan masuk otomatis membuat profil pelanggan (*Customer*) dan tiket baru berstatus `OPEN`.
  - Pesan susulan dari pelanggan otomatis tersambung ke tiket aktif yang sama (baik berstatus `OPEN` maupun `RESOLVED`).
  - **Sinkronisasi Dua Arah Penuh:** Pesan balasan dari dasbor web maupun dari **HP WhatsApp fisik helpdesk** (`fromMe=true`) otomatis tercatat sebagai `AGENT` secara instan.
  - **WhatsApp LID Addressing:** Mendukung addressing mode baru WhatsApp (`@lid`) melalui resolusi otomatis `remoteJidAlt`.
  - **Anti-Race Condition:** Serialisasi pesan per-nomor via `perNumberLock` dan deduplikasi atomik via constraint basis data `@unique wa_message_id`.
- **🌐 Integrasi Portal Resmi HTS Diskomdigi Jawa Tengah:**
  - **Arsitektur Multi-HTS (One-to-Many):** 1 percakapan WhatsApp dapat menerbitkan banyak nomor tiket aduan resmi HTS ke divisi berbeda sekaligus.
  - **Live CAPTCHA Streaming & Otentikasi Sesi:** Login langsung ke portal HTS dengan bypass CAPTCHA visual dan manajemen sesi cookie PHP `ci_session`.
  - **Background Keep-Alive Heartbeat:** Pemeliharaan sesi login HTS otomatis setiap 15 menit agar petugas tidak ter-logout.
  - **Dual-Close Berintegritas:** Penutupan tiket lokal memvalidasi status penyelesaian seluruh tiket HTS terkait; jika gagal di HTS, penutupan lokal dibatalkan demi integritas data.
  - **Manual Link & Disaster Recovery:** Tautkan nomor tiket HTS yang sudah ada, lengkapi penugasan PIC status `INPUT_PIC` menjadi `PENDING`, atau lepas tautan (*unlink*) secara mandiri.
- **💬 Klasifikasi Obrolan: Percakapan Biasa vs Aduan Teknis:**
  - **Percakapan Biasa (`GENERAL_CHAT`):** Untuk sapaan, konsultasi umum, atau salah sambung. Dapat diselesaikan seketika (`[ ✅ Selesaikan Percakapan ]`), tidak membebani antrean teknisi L2, dan **100% dikecualikan dari metrik SLA MTTR**.
  - **Aduan Teknis Resmi (`is_aduan=true`):** Untuk kendala teknis riil yang memerlukan penugasan L2 atau penerbitan tiket HTS. Mendukung promosi otomatis (*auto-promotion*).
- **🛡️ RBAC & Keamanan Tingkat Enterprise (Sprint 1–3 Hardening):**
  - **RBAC Sisi Server:** Seluruh rute dilindungi middleware `verifyToken` dan `requireRole` di peladen (bukan sekadar di antarmuka UI).
  - **Socket.io Handshake Auth:** Otentikasi token JWT wajib saat koneksi WebSocket awal, serta isolasi siaran data ke *rooms* terpartisi (`user_{id}`, `role_{role}`, `category_{id}`).
  - **Webhook Shared Secret:** Endpoint webhook dilindungi validasi rahasia `WEBHOOK_SECRET` dengan perbandingan *constant-time* tahan serangan *timing attack*.
  - **Fail-Fast Environment:** Pengecekan otomatis variabel lingkungan rahasia saat startup (`config/env.js`); server menolak menyala jika kredensial kosong.
  - **Anti Path-Traversal:** Sanitasi kanonikal berkas lampiran berbasis `safePath.js` di folder `/uploads`.
- **👥 Smart Multi-Assign & Resilient Auto-Open HTS:**
  - L1 dapat mendelegasikan tiket ke satu atau banyak tim teknisi sekaligus (`Network`, `Server`, dan `Mechanical & Electrical (M&E)`).
  - **Smart Assign Diffing:** Menambah tim baru tidak mereset progres tim yang sedang bertugas atau sudah selesai.
  - **Resilient Auto-Open Workflow:** Membuka formulir HTS otomatis pasca penugasan L2 secara mulus dan bebas dari balapan event soket.
  - **WhatsApp Multi-Contact Blast:** Notifikasi penugasan terkirim otomatis hanya kepada kontak/grup tim yang baru ditugaskan.
- **🔒 Catatan Internal Multimedia Dua Arah (L1 ↔ L2):**
  - Teknisi L2 berkoordinasi via Catatan Internal (teks & foto) yang **100% rahasia** dan tidak pernah bocor ke WhatsApp pelanggan.
  - Foto bukti penanganan lapangan dari L2 dapat langsung dilampirkan sebagai berkas bukti saat L1 menutup tiket di portal HTS.
- **📖 Master Data Kontak, Start New Chat & Re-Open Tiket:**
  - **Import Master Data Kontak (Admin):** Unggah ribuan kontak resmi OPD via file Excel (`.xlsx`), CSV, atau vCard (`.vcf`). Nama dari master data menjadi **identitas prioritas utama** yang tidak tertimpa profil WhatsApp.
  - **Start New Chat (Outbound):** Memulai percakapan keluar ke nomor baru melalui direktori kontak berpangkal paginasi, dengan opsi pesan pembuka otomatis.
  - **Re-Open Tiket:** Mengaktifkan kembali percakapan yang sudah `CLOSED` secara transaksional dengan pencatatan alasan di catatan internal.
- **⚡ Balasan Cepat (Quick Replies) & Efisiensi Dispatcher:**
  - Suggester template pesan instan dengan memanggil tombol keyboard `/` (misal `/salam`, `/aduan`, `/selesai`).
  - Notifikasi suara merdu (chime audio Web Audio API) dan notifikasi desktop browser saat pesan masuk.
- **📊 Rekapitulasi SLA & Ekspor CSV:**
  - Kalkulasi akurat *First Response Time* (FRT) dan *Mean Time to Resolve* (MTTR aduan teknis murni).
  - Fitur **Export to CSV** untuk pelaporan berkala pimpinan.
- **🧹 Worker Pembersihan File Otomatis (Storage Lifecycle):**
  - Background service terjadwal setiap 24 jam membersihkan berkas media tiket `CLOSED` yang melewati retensi 90 hari.

---

## 🏗️ Tumpukan Teknologi (Tech Stack)

| Komponen | Teknologi | Versi |
|---|---|:---:|
| **WhatsApp Gateway** | [Evolution API v2](https://github.com/EvolutionAPI/evolution-api) (Dockerized Baileys) | `v2.3+` |
| **Backend Core** | Node.js, Express.js | `v18+/v20/v22` |
| **Realtime Gateway** | Socket.io (Handshake Auth & Room Partitions) | `v4.8+` |
| **Database & ORM** | PostgreSQL 15, Prisma ORM | `v5.22` |
| **Session Cache** | Redis (Alpine) | Latest |
| **Frontend** | React 18, Vite 5, React Router DOM v7, Tailwind CSS, Lucide Icons | `v18.3+` |
| **Keamanan & Utilitas** | JWT (12 jam), bcryptjs, Helmet (CSP/CORP), Express Rate Limit, Multer | - |

---

## 📐 Arsitektur Alur Sistem (Flow)

```mermaid
flowchart TD
    PIC[Pelanggan / PIC WhatsApp] <-->|Protokol WhatsApp| EVO[Evolution API Gateway :8080]
    EVO <-->|Webhook & REST API| BE[Backend Node.js & Socket.io :3000]
    BE <-->|Prisma ORM| DB[(PostgreSQL Database :5433)]
    BE <-->|WebSockets & JWT REST| FE[React Web Dashboard :5200]
    BE <-->|Cookie ci_session + CSRF| HTS[Portal HTS Diskomdigi Jateng]
    
    subgraph Dashboard Web [Peran Dasbor Web]
        L1[Dispatcher L1]
        L2_NET[Teknisi Network L2]
        L2_SRV[Teknisi Server L2]
        L2_ME[Teknisi M&E L2]
        ADM[Administrator]
        SPV[Supervisor]
    end
    
    FE --- L1
    FE --- L2_NET
    FE --- L2_SRV
    FE --- L2_ME
    FE --- ADM
    FE --- SPV
```

---

## 🚀 Panduan Memulai Cepat (Getting Started)

### 1. Prasyarat Sistem
- Docker & Docker Compose
- Node.js v18 / v20 / v22 LTS & npm
- Git

### 2. Menjalankan Layanan Database & Gateway (Docker)
Pindahkan terminal ke direktori root repositori dan jalankan kontainer:
```bash
docker compose -f docker/docker-compose.yml up -d
```
> ⚠️ **Catatan Port:** PostgreSQL pada docker-compose dipetakan ke port host **`5433`** (format `5433:5432`). Backend di mesin host wajib terhubung ke port **5433**.

### 3. Konfigurasi & Menjalankan Backend
Pindah ke direktori `backend/`:
```bash
cd backend
npm install
```

Salin atau buat berkas `.env` di dalam folder `backend/`:
```env
PORT=3000
DATABASE_URL="postgresql://helpdesk_user:SecretPassword123!@localhost:5433/wa_helpdesk?schema=public"
JWT_SECRET="masukkan_string_acak_jwt_secret_minimal_32_karakter"

# Evolution API (WhatsApp Gateway)
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_TOKEN="SecureTokenUntukBackend123"
EVOLUTION_INSTANCE_NAME="helpdesk-wa"

# Shared Secret untuk Autentikasi Webhook (SEC-01)
WEBHOOK_SECRET="SecureTokenUntukBackend123"

# URL Frontend (untuk kontrol CORS Socket.io)
FRONTEND_URL="http://localhost:5200"
```

Sinkronisasi Database dan Seeding data awal:
```bash
npx prisma generate
npx prisma db push
npm run prisma:seed
```

Jalankan server backend:
```bash
npm run dev
```

### 4. Menghubungkan Nomor WhatsApp (Pairing)
Pada terminal backend, jalankan skrip pairing:
```bash
npm run setup:evolution
```
Buka berkas `backend/qr.html` pada browser Anda, lalu pindai QR Code menggunakan aplikasi WhatsApp di ponsel Helpdesk (*Perangkat Tertaut / Linked Devices*).

### 5. Menjalankan Frontend
Buka terminal terpisah, lalu masuk ke folder `frontend/`:
```bash
cd frontend
npm install
npm run dev
```
Buka browser pada alamat: **`http://localhost:5200`** (atau via IP LAN: `http://<IP_KOMPUTER>:5200`).

---

## 👥 Akun Bawaan untuk Pengujian (Default Credentials)

Semua akun benih terdaftar menggunakan **Password:** `password123`

| Role | Email | Nama Pengguna | Kategori / Hak Akses Utama |
|---|---|---|---|
| **ADMIN** | `admin@helpdesk.go.id` | Administrator | Akses Penuh (Chat, Tiket, Users, Master Data Kontak, Hapus Rekap) |
| **L1** | `l1@helpdesk.go.id` | Dispatcher L1 | Chat Pelapor, Bot Toggle, Multi-Assign L2, Integrasi HTS, Selesaikan Tiket |
| **L2** | `l2_network@helpdesk.go.id` | Teknisi Network L2 | View-only Chat, Catatan Internal, Tandai Selesai Bagian Network, Return |
| **L2** | `l2_server@helpdesk.go.id` | Teknisi Server L2 | View-only Chat, Catatan Internal, Tandai Selesai Bagian Server, Return |
| **L2** | `l2_me@helpdesk.go.id` | Teknisi M&E L2 | View-only Chat, Catatan Internal, Tandai Selesai Bagian M&E, Return |
| **SPV** | `spv@helpdesk.go.id` | Supervisor | Monitoring Antrean Tiket & Akses Rekap Laporan SLA / CSV |

---

## 📂 Indeks Dokumentasi Teknis di Folder `/docs`

Seluruh dokumentasi teknis mendalam dan standar operasional tersedia di direktori [`docs/`](./docs/):

1. **[Gambaran Umum Proyek (Project Overview)](docs/Project_Overview.md)** — Ringkasan eksekutif, persona pengguna, matriks RBAC antarmuka & peladen, dan riwayat evolusi sistem V4.2.1.
2. **[Arsitektur, Diagram Alur & Keamanan (Architecture)](docs/Architecture.md)** — Arsitektur Full-Stack (Frontend React SPA, Backend Node.js, Docker, Nginx Reverse Proxy), diagram alur Mermaid, dan spesifikasi keamanan.
3. **[Skema Database & Kontrak API (Database_and_API)](docs/Database_and_API.md)** — Skema ERD PostgreSQL, kamus data tabel & indeks komposit, kontrak lengkap REST API, dan event Socket.io.
4. **[Fitur & Kemampuan Sistem (Features_and_Capabilities)](docs/Features_and_Capabilities.md)** — Katalog komprehensif 17 kapabilitas fungsional yang aktif di kode sumber (termasuk workspace 5-tab & tata letak 3-kolom).
5. **[Panduan Operasional & Deployment (Operations_and_Deployment)](docs/Operations_and_Deployment.md)** — Panduan deployment 3 track (Lokal, Docker, dan VPS Node.js produksi via PM2 & Nginx) serta SOP operasional per peran.
6. **[Pengujian QA & Audit Kualitas (QA_and_Quality)](docs/QA_and_Quality.md)** — Skenario pengujian QA Modul 1–10 (termasuk Frontend UI/UX QA), audit keamanan terverifikasi, dan mitigasi risiko teknis.
7. **[Laporan Eksekutif & Ringkasan Kerja (summary)](docs/summary.md)** — Laporan eksekutif berkala, status penyelesaian sprint remedi, Milestone 8 harmonisasi living documentation, dan roadmap operasional.

---

## 📄 Lisensi
Hak Cipta © 2026 Tim Pengembang HTS Chat Integration — Diskominfo Provinsi Jawa Tengah. Seluruh hak cipta dilindungi.
