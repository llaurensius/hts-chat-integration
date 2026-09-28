# 💬 HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)

Aplikasi **Web Helpdesk & Ticketing System** terintegrasi WhatsApp Gateway untuk pengelolaan keluhan pelanggan/instansi (PIC) secara *real-time* dengan dukungan **Role-Based Access Control (RBAC)** antara Dispatcher (L1), 3 Tim Teknisi Lapangan (L2: Network, Server, M&E), dan Administrator.

---

## 🌟 Fitur Utama (Workflow V2.1)

- **🔄 Integrasi WhatsApp Dua Arah (Evolution API v2):**
  - Pesan masuk otomatis membuat profil pelanggan (*Customer*) dan tiket baru berstatus `OPEN`.
  - Pesan sambutan otomatis (*Auto-Reply Bot*) untuk tiket baru.
  - Pesan susulan dari pelanggan otomatis tersambung ke tiket aktif yang sama (baik berstatus `OPEN` maupun `RESOLVED`).
  - Pengiriman pesan keluar langsung ke WhatsApp pelanggan dari dasbor web.
- **🖼️ Dukungan Media Gambar Lengkap (Bi-directional Images):**
  - Pelanggan dapat mengirim foto kendala via WhatsApp yang langsung diunduh dan tampil di antrean chat web (didukung hingga kapasitas 50MB).
  - Agen Helpdesk dapat mengunggah gambar lampiran penjelasan kembali ke WhatsApp pelanggan.
- **🛡️ Akses Berbasis Peran (Role-Based Access Control - RBAC):**
  - **L1 (Dispatcher):** Berkomunikasi langsung dengan pelanggan, menugaskan tiket ke tim L2, dan menutup tiket resmi.
  - **L2 (Teknisi):** Mode *View-Only* obrolan pelanggan, kolom *Catatan Internal* (hanya dibaca tim), tombol *Tandai Selesai*, dan *Kembalikan / Lepas*.
  - **ADMIN:** Akses penuh gabungan (L1 + L2) dan panel **Manajemen Pengguna**.
  - **SPV:** Monitoring antrean dan akses laporan rekapitulasi.
- **👥 Pendelegasian Multi-Assign (Satu atau Banyak Tim Sekaligus):**
  - L1 dapat mencentang lebih dari satu tim teknisi sekaligus (`Network`, `Server`, dan/atau `Mechanical & Electrical (M&E)`).
  - Tiket otomatis muncul di antrean semua teknisi tim yang dicentang secara bersamaan.
- **📢 WhatsApp Blast Notifikasi Tugas ke L2:**
  - Saat Dispatcher menugaskan tiket, bot secara otomatis mengirim notifikasi WhatsApp ke nomor target masing-masing tim yang dicentang.
- **✅ Penyelesaian Mandiri Per-Tim (*Per-Team Resolution*):**
  - Setiap tim menandai selesai tugas bagiannya sendiri (`is_resolved`).
  - Tiket utama otomatis berubah menjadi `RESOLVED` hanya ketika **seluruh tim yang ditugaskan telah menyatakan selesai**.
- **🔄 Pelepasan Penugasan Mandiri (*Self-Unassign Return*):**
  - Teknisi dapat melepas penugasan timnya jika bukan kewenangannya dengan menyertakan alasan. Tiket tetap berjalan di tim lain yang masih bertugas.
- **🏷️ Klasifikasi Jenis Layanan (*Service Type*):**
  - Mendukung klasifikasi: `Troubleshooting (Gangguan)`, `Request Layanan`, atau `Monitoring`.
- **⚡ Komunikasi Real-time (Socket.io):**
  - Pembaruan gelembung obrolan, status tiket, dan notifikasi seketika tanpa perlu me-refresh halaman.
- **📊 Laporan & Rekapitulasi:**
  - Riwayat penanganan tiket lengkap dengan jenis layanan, tim terkait, durasi penanganan, dan kesimpulan akhir (*mandatory summary*).
  - Fitur **Export to CSV** untuk pelaporan berkala.
- **🌐 Akses Jaringan Lokal (LAN / Wi-Fi Kantor):**
  - Seluruh komputer atau ponsel di jaringan yang sama dapat langsung mengakses aplikasi melalui IP lokal host (port `5173`).

---

## 🏗️ Tumpukan Teknologi (Tech Stack)

| Bagian | Teknologi |
|---|---|
| **WhatsApp Gateway** | [Evolution API v2](https://github.com/EvolutionAPI/evolution-api) (Dockerized) |
| **Backend** | Node.js, Express.js, Socket.io v4 |
| **Database & ORM** | PostgreSQL 15, Prisma ORM v5 |
| **Frontend** | React 18, Vite, React Router DOM, Tailwind CSS, Lucide Icons |
| **Autentikasi & Keamanan** | JWT (12 jam), bcryptjs, Helmet (CSP & CORP), Express Rate Limit |

---

## 📐 Arsitektur Alur Sistem (Flow)

```mermaid
flowchart TD
    PIC[Pelanggan / PIC WhatsApp] <-->|WhatsApp Protocol| EVO[Evolution API Gateway :8080]
    EVO <-->|Webhook & REST API| BE[Backend Node.js & Socket.io :3000]
    BE <-->|Prisma ORM| DB[(PostgreSQL Database :5432)]
    BE <-->|WebSockets & JWT REST| FE[React Web Dashboard :5173]
    
    subgraph Dashboard Web [Peran Dasbor Web]
        L1[Dispatcher L1]
        L2_NET[Teknisi Network L2]
        L2_SRV[Teknisi Server L2]
        L2_ME[Teknisi M&E L2]
        ADM[Admin / SPV]
    end
    
    FE --- L1
    FE --- L2_NET
    FE --- L2_SRV
    FE --- L2_ME
    FE --- ADM
```

---

## 🚀 Panduan Memulai (Getting Started)

### 1. Prasyarat (*Prerequisites*)
- Docker & Docker Compose
- Node.js v18+ & npm
- Git

### 2. Menjalankan Layanan Database & Gateway (Docker)
Pastikan Docker Compose berjalan untuk PostgreSQL, Redis, dan Evolution API:
```bash
docker compose up -d
```
> Layanan Evolution API akan aktif di `http://localhost:8080` dan PostgreSQL di port `5432`.

### 3. Menjalankan Backend
Pindah ke direktori `backend/`:
```bash
cd backend
npm install
```

Sesuaikan berkas konfigurasi `.env`:
```env
PORT=3000
DATABASE_URL="postgresql://helpdesk_user:SecretPassword123!@localhost:5432/wa_helpdesk?schema=public"
JWT_SECRET="supersecret_jwt_key_123"
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_TOKEN="SecureTokenUntukBackend123"
EVOLUTION_INSTANCE_NAME="helpdesk-wa"
```

Sinkronisasi Database dan Seeding data awal:
```bash
npx prisma db push
npm run prisma:seed
```

Jalankan server backend:
```bash
npm run dev
```

### 4. Menjalankan Frontend
Di terminal terpisah, masuk ke folder `frontend/`:
```bash
cd frontend
npm install
npm run dev
```
Buka browser pada alamat: **`http://localhost:5173`** (atau via IP LAN: `http://<IP_KOMPUTER>:5173`)

---

## 👥 Akun Bawaan untuk Pengujian (Default Credentials)

Semua akun terdaftar menggunakan **Password:** `password123`

| Role | Email | Kategori / Akses |
|---|---|---|
| **ADMIN** | `admin@helpdesk.go.id` | Akses penuh (L1 + L2) & Manajemen User |
| **L1 (Dispatcher)** | `l1@helpdesk.go.id` | Chat ke PIC, Multi-Assign L2, Tutup Tiket Resmi |
| **L2 (Network)** | `l2_network@helpdesk.go.id` | Catatan Internal, Tandai Selesai, Return |
| **L2 (Server)** | `l2_server@helpdesk.go.id` | Catatan Internal, Tandai Selesai, Return |
| **L2 (M&E)** | `l2_me@helpdesk.go.id` | Catatan Internal, Tandai Selesai, Return |
| **SPV (Supervisor)** | `spv@helpdesk.go.id` | Monitoring & Akses Rekap Laporan CSV |

---

## 📂 Indeks Dokumentasi Teknis di Folder `/docs`

Seluruh dokumentasi teknis mendalam tersedia di direktori [`docs/`](./docs/):

1. **[Product Requirements Document (PRD)](docs/PRD_WhatsApp_Helpdesk.md)** - Kebutuhan bisnis, persona pengguna, dan kriteria penerimaan.
2. **[Database Schema / ERD](docs/Database_Schema.md)** - Skema relasional PostgreSQL, rincian tabel, tipe data, dan enum.
3. **[Spesifikasi API Endpoints](docs/API_Endpoints_Spec.md)** - Kontrak REST API, Webhook, dan Socket.io events.
4. **[Spesifikasi Keamanan](docs/Security_Specification.md)** - Standar enkripsi JWT, RBAC, Helmet CSP/CORP, dan Rate Limiter.
5. **[Diagram Alur Sistem (Flowcharts)](docs/System_Flowcharts.md)** - Diagram alur proses sistem menggunakan notasi Mermaid.
6. **[Arsitektur & Tech Stack](docs/Tech_Stack_Architecture.md)** - Topologi infrastruktur, daftar pustaka, dan dependensi sistem.
7. **[Panduan Deployment](docs/Deployment_Guide.md)** - Panduan Docker Compose, konfigurasi LAN, dan Nginx reverse proxy.
8. **[Panduan Operasional (SOP)](docs/Operational_Guide.md)** - Panduan operasional harian untuk Dispatcher L1, Teknisi L2, Admin, dan SPV.
9. **[Rangkuman Lengkap Proyek](docs/summary.md)** - Rekapitulasi perjalanan sistem dari Workflow V1 hingga V2.1.
10. **[Kredensial Pengguna](docs/user.md)** - Daftar akun pengujian default sistem.

---

## 📄 Lisensi
Hak Cipta © 2026 Tim Pengembang HTS Chat Integration. Seluruh hak cipta dilindungi.
