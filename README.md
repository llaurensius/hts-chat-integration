# 💬 HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)

Aplikasi **Web Helpdesk & Ticketing System** terintegrasi WhatsApp Gateway untuk pengelolaan keluhan pelanggan/instansi (PIC) secara *real-time* dengan dukungan **Role-Based Access Control (RBAC)** antara Dispatcher (L1), Teknisi Lapangan (L2), dan Administrator.

---

## 🌟 Fitur Utama (Workflow V2)

- **🔄 Integrasi WhatsApp Dua Arah (Evolution API v2):**
  - Pesan masuk otomatis membuat tiket & profil pelanggan (*Customer*).
  - Pesan sambutan otomatis (*Auto-Reply Bot*) untuk tiket baru.
  - Pengiriman pesan keluar langsung ke WhatsApp pelanggan dari web dashboard.
- **🖼️ Dukungan Media Gambar Lengkap (Bi-directional Image Support):**
  - Pelanggan dapat mengirim foto kendala via WhatsApp yang langsung tampil di antrean chat web.
  - Agen Helpdesk dapat mengunggah gambar lampiran penjelasan kembali ke WhatsApp pelanggan.
- **🛡️ Akses Berbasis Peran (Role-Based Access Control - RBAC):**
  - **L1 (Dispatcher):** Berkomunikasi langsung dengan pelanggan, meng-assign tiket ke spesialis L2, dan menutup tiket resmi.
  - **L2 (Teknisi):** Mode *View-Only* obrolan pelanggan, kolom *Catatan Internal* (hanya dibaca tim), tombol *Tandai Selesai*, dan *Kembalikan ke L1*.
  - **ADMIN:** Akses penuh gabungan (L1 + L2) dan panel **Manajemen Pengguna**.
- **📢 WhatsApp Blast Notifikasi Tugas ke L2:**
  - Saat Dispatcher meng-assign tiket ke kategori tertentu, sistem otomatis menembak pesan notifikasi WhatsApp ke teknisi kategori tersebut.
- **⚡ Komunikasi Real-time (Socket.io):**
  - Pembaruan gelembung obrolan, status tiket, dan notifikasi seketika tanpa perlu me-refresh halaman.
- **📊 Laporan & Rekapitulasi:**
  - Riwayat penanganan tiket lengkap dengan kategori multi-tagging dan kesimpulan akhir (*mandatory summary*).
  - Fitur **Export to CSV** untuk pelaporan berkala.
- **🔒 Standar Keamanan:**
  - Token JWT (JSON Web Token) dengan penyimpanan aman dan masa berlaku.
  - Proteksi HTTP Header menggunakan `helmet` (dengan konfigurasi CSP & CORP untuk aset media) dan `express-rate-limit`.

---

## 🏗️ Tumpukan Teknologi (Tech Stack)

| Bagian | Teknologi |
|---|---|
| **WhatsApp Gateway** | [Evolution API v2](https://github.com/EvolutionAPI/evolution-api) (Dockerized) |
| **Backend** | Node.js, Express.js, Socket.io |
| **Database & ORM** | PostgreSQL 15, Prisma ORM |
| **Frontend** | React 18, Vite, React Router DOM, Tailwind CSS, Lucide Icons |
| **Autentikasi & Keamanan** | JWT, bcryptjs, Helmet, Express Rate Limit |

---

## 📐 Arsitektur Alur Sistem (Flow)

```mermaid
flowchart TD
    PIC[Pelanggan / PIC WhatsApp] <-->|WhatsApp Protocol| EVO[Evolution API Gateway]
    EVO <-->|Webhook & REST API| BE[Backend Node.js & Socket.io]
    BE <-->|Prisma ORM| DB[(PostgreSQL Database)]
    BE <-->|WebSockets & JWT REST| FE[React Web Dashboard]
    
    subgraph Dashboard Web [Peran Dasbor Web]
        L1[Dispatcher L1]
        L2[Teknisi L2]
        ADM[Admin / SPV]
    end
    
    FE --- L1
    FE --- L2
    FE --- ADM
```

---

## 🚀 Panduan Memulai (Getting Started)

### 1. Prasyarat (*Prerequisites*)
- Docker & Docker Compose
- Node.js v18+ & npm
- Git

### 2. Menjalankan Layanan Database & Gateway (Docker)
Pastikan Docker Compose berjalan untuk PostgreSQL dan Evolution API:
```bash
docker compose up -d
```
> Layanan Evolution API akan aktif di `http://localhost:8080` dan PostgreSQL di port `5432`.

### 3. Konfigurasi Backend
Pindah ke direktori `backend/`:
```bash
cd backend
npm install
```

Salin atau sesuaikan file konfigurasi `.env`:
```env
PORT=3000
DATABASE_URL="postgresql://helpdesk_user:SecretPassword123!@localhost:5432/wa_helpdesk?schema=public"
JWT_SECRET="supersecret_jwt_key_123"
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_TOKEN="SecureTokenUntukBackend123"
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
Buka browser pada alamat: **`http://localhost:5173`**

---

## 👥 Akun Bawaan untuk Pengujian (Default Credentials)

Semua akun menggunakan **Password:** `password123`

| Role | Email | Catatan Akses |
|---|---|---|
| **ADMIN** | `admin@helpdesk.go.id` | Akses penuh (L1 + L2) & Manajemen User |
| **L1 (Dispatcher)** | `l1@helpdesk.go.id` | Balas WhatsApp, Assign ke L2, Tutup Tiket |
| **L2 (Teknisi Server)** | `l2_server@helpdesk.go.id` | Catatan Internal, Tandai Selesai, Return L1 |
| **L2 (Teknisi Network)** | `l2_network@helpdesk.go.id` | Catatan Internal, Tandai Selesai, Return L1 |
| **SPV (Supervisor)** | `spv@helpdesk.go.id` | Monitoring & Akses Rekap Laporan |

---

## 📂 Struktur Repositori & Dokumentasi

```text
├── backend/                  # REST API Express, Socket.io, Prisma ORM
│   ├── prisma/               # Schema database & script seed
│   ├── src/
│   │   ├── controllers/      # Webhook, Chat, Auth, Admin, Report
│   │   ├── middlewares/      # JWT verifyToken, requireRole
│   │   ├── routes/           # Endpoint express
│   │   ├── services/         # Integrasi Evolution API
│   │   └── utils/            # Multer imageStorage, helpers
│   └── uploads/              # Penyimpanan statis gambar lampiran
├── frontend/                 # React Vite SPA Dashboard
│   ├── src/
│   │   ├── App.jsx           # Main Dashboard & Sub-views RBAC
│   │   └── main.jsx          # Entry point dengan Error Boundary
├── docs/                     # Dokumentasi Teknis Lengkap
│   ├── summary.md            # Rangkuman lengkap progres Workflow V1 & V2
│   ├── PRD_WhatsApp_Helpdesk.md
│   ├── Database_Schema.md
│   ├── API_Endpoints_Spec.md
│   ├── Workflow_V2_Brainstorming.md
│   ├── Implementation_Plan_V2.md
│   ├── Operational_Guide.md
│   ├── Security_Specification.md
│   └── user.md               # Rincian akun pengguna
├── docker-compose.yml        # Setup Docker PostgreSQL & Evolution API
└── README.md
```

---

## 📄 Lisensi
Hak Cipta © 2026 Tim Pengembang HTS Chat Integration. Seluruh hak cipta dilindungi.
