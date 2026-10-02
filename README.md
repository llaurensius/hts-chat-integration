# 💬 HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)

Aplikasi **Web Helpdesk & Ticketing System** terintegrasi WhatsApp Gateway untuk pengelolaan keluhan pelanggan/instansi (PIC) secara *real-time* dengan dukungan **Role-Based Access Control (RBAC)** antara Dispatcher (L1), 3 Tim Teknisi Lapangan (L2: Network, Server, M&E), Administrator, dan Supervisor.

---

## 🌟 Fitur Utama (Workflow V2.2)

- **🔄 Integrasi WhatsApp Dua Arah (Evolution API v2):**
  - Pesan masuk otomatis membuat profil pelanggan (*Customer*) dan tiket baru berstatus `OPEN`.
  - Pesan susulan dari pelanggan otomatis tersambung ke tiket aktif yang sama (baik berstatus `OPEN` maupun `RESOLVED`).
  - Pengiriman pesan keluar langsung ke WhatsApp pelanggan dari dasbor web.
- **🤖 Sakelar & Kustomisasi Auto-Reply Bot (Khusus L1):**
  - Toggle sakelar bot ON/OFF langsung di antrean chat L1.
  - Modal editor template pesan sambutan otomatis yang tersimpan di database `Setting`.
- **🖼️ Dukungan Media Gambar Lengkap (Bi-directional Images):**
  - Pelanggan dapat mengirim foto kendala via WhatsApp yang langsung diunduh dan tampil di antrean chat web (didukung hingga kapasitas 50MB).
  - Agen Helpdesk dapat mengunggah gambar lampiran penjelasan kembali ke WhatsApp pelanggan.
- **🛡️ Akses Berbasis Peran (Role-Based Access Control - RBAC):**
  - **L1 (Dispatcher):** Berkomunikasi langsung dengan pelanggan via WhatsApp, dua mode chat (balas WhatsApp vs catatan internal ke L2), sakelar bot, dan menutup tiket resmi.
  - **L2 (Teknisi):** Mode *View-Only* obrolan pelanggan, kolom *Catatan Internal* (hanya dibaca tim), tombol *Tandai Selesai*, dan *Kembalikan / Lepas*.
  - **ADMIN:** Akses penuh gabungan (L1 + L2), **Manajemen Pengguna (CRUD Penuh & Reset Password)**, **Kontak Tim L2**, dan **Pembersihan Rekap Aduan**.
  - **SPV:** Monitoring antrean dan akses laporan rekapitulasi.
- **👥 Manajemen Akun Pengguna Lengkap (Full CRUD - Admin Only):**
  - Administrator dapat mendaftarkan akun baru, mengedit data akun staf (Nama, Email, Peran/Role, dan Kategori tim L2), serta menghapus akun yang sudah nonaktif.
  - Reset password bersifat fleksibel (*opsional*): dikosongkan jika tidak ingin mengubah password lama. Sesi profil langsung ter-update secara otomatis jika admin mengedit akunnya sendiri.
- **💬 Dual-Mode Chat L1 (Balas WhatsApp Pelanggan vs Catatan Internal ke L2):**
  - Mengadopsi standar Zendesk: L1 dapat berpindah tab antara mengirim balasan resmi ke nomor WhatsApp pelanggan (💬) atau mengirim instruksi/tanggapan rahasia ke teknisi L2 (🔒).
  - Catatan internal L1 100% aman (tidak terkirim ke WhatsApp) dan disiarkan secara real-time ke layar seluruh teknisi.
- **👥 Pendelegasian Smart Multi-Assign (Satu atau Banyak Tim Sekaligus):**
  - L1 dapat mencentang lebih dari satu tim teknisi sekaligus (`Network`, `Server`, dan/atau `Mechanical & Electrical (M&E)`).
  - **Smart Assign Diffing:** Menambah/mengubah tim tidak mereset tim yang sudah aktif bertugas atau yang telah selesai.
- **📢 WhatsApp Multi-Contact Blast Notifikasi Tugas ke L2:**
  - Saat Dispatcher menugaskan tiket, sistem membroadcast pesan notifikasi WA ke seluruh nomor/grup yang terdaftar pada tim terkait.
  - Administrator dapat mengelola daftar kontak (tambah, inline edit, hapus) di tab **Kontak Tim L2**.
- **🏷️ Identitas Tim Otomatis pada Catatan Internal:**
  - Setiap catatan internal teknisi L2 otomatis diberi badge identitas tim (misal `[Tim Network]`), baik untuk pesan manual, notifikasi *Tandai Selesai*, maupun *Pengembalian Tiket*.
- **✅ Penyelesaian Mandiri Per-Tim (*Per-Team Resolution*):**
  - Setiap tim menandai selesai tugas bagiannya sendiri (`is_resolved`).
  - Tiket utama otomatis berubah menjadi `RESOLVED` hanya ketika **seluruh tim yang ditugaskan telah menyatakan selesai**.
- **🔄 Pelepasan Penugasan Mandiri (*Self-Unassign Return*):**
  - Teknisi dapat melepas penugasan timnya jika bukan kewenangannya dengan menyertakan alasan. Tiket tetap berjalan di tim lain yang masih bertugas.
- **🎯 Auto Pre-Fill Kategori Masalah Saat Tiket Ditutup:**
  - Saat L1 menyelesaikan tiket, modal penutupan secara otomatis mencentang kategori masalah sesuai tim L2 yang ditugaskan di awal tiket.
- **🗑️ Pembersihan Rekap Aduan & Reset Penomoran ID (Admin Only):**
  - Administrator dapat menghapus tiket selesai terpilih atau menghapus seluruh riwayat data testing.
  - Saat hapus semua, urutan penomoran auto-increment PostgreSQL otomatis di-reset (`ALTER SEQUENCE tickets_id_seq RESTART WITH 1`) sehingga tiket baru berikutnya kembali bernomor ID #1.
- **👤 Resolusi Identitas Pelapor Hybrid & Instansi/SKPD (L1 & Admin):**
  - **Prioritas Cerdas:** Web Custom Edit > Buku Kontak HP (via Evolution API) > WhatsApp Push Name > Nomor WA.
  - Dispatcher L1 dan Admin dapat mengubah nama pelapor dan menyematkan nama instansi/SKPD langsung dari header chat atau panel detail tiket.
  - Nama tersimpan permanen di database dan otomatis terintegrasi pada Laporan Rekapitulasi & Export CSV.
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
        ADM[Admin]
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

| Role | Email | Nama Pengguna | Kategori / Hak Akses Utama |
|---|---|---|---|
| **ADMIN** | `admin@helpdesk.go.id` | Administrator | Akses Penuh (Chat, Tiket, Users, Kontak L2, Hapus Rekap) |
| **L1** | `l1@helpdesk.go.id` | Dispatcher L1 | Chat Pelapor, Bot Toggle, Multi-Assign L2, Selesaikan Tiket |
| **L2** | `l2_network@helpdesk.go.id` | Teknisi Network L2 | Catatan Internal, Tandai Selesai Bagian Network, Return |
| **L2** | `l2_server@helpdesk.go.id` | Teknisi Server L2 | Catatan Internal, Tandai Selesai Bagian Server, Return |
| **L2** | `l2_me@helpdesk.go.id` | Teknisi M&E L2 | Catatan Internal, Tandai Selesai Bagian M&E, Return |
| **SPV** | `spv@helpdesk.go.id` | Supervisor | Monitoring Antrean Tiket & Akses Rekap Laporan CSV |

---

## 📂 Indeks Dokumentasi di Folder `/docs` (V4.1)

Seluruh dokumentasi teknis mendalam tersedia di direktori [`docs/`](./docs/):

1. **[Gambaran Umum Proyek (Project Overview)](docs/Project_Overview.md)** - Ringkasan eksekutif, persona pengguna, peran & matriks RBAC, daftar akun pengujian, dan evolusi sistem V1 s/d V4.1.
2. **[Arsitektur, Diagram Alur & Keamanan (Architecture)](docs/Architecture.md)** - Tech stack, topologi Docker, diagram Mermaid seluruh alur inti, dan spesifikasi keamanan (JWT, RBAC, Helmet, Rate Limit).
3. **[Skema Database & Kontrak API (Database_and_API)](docs/Database_and_API.md)** - ERD, struktur tabel & kolom (termasuk `TicketHts`, `wa_message_id`, `is_imported_contact`), kontrak REST API, dan event Socket.io.
4. **[Fitur & Kemampuan Sistem (Features_and_Capabilities)](docs/Features_and_Capabilities.md)** - Seluruh fitur aktif V1 s/d V4.1: Multi-HTS, General Chat, Master Data Kontak, Start New Chat, Re-Open Tiket, Unlink, Quick Replies, SLA.
5. **[Panduan Operasional & Deployment (Operations_and_Deployment)](docs/Operations_and_Deployment.md)** - SOP Dispatcher L1, Teknisi L2, Admin, SPV beserta panduan Docker Compose, konfigurasi LAN, dan Nginx reverse proxy.
6. **[Pengujian QA, Potensi Bug & Audit (QA_and_Quality)](docs/QA_and_Quality.md)** - Skenario uji Modul 1-9 beserta status jujur, analisis potensi kendala & mitigasi, log progres, dan hasil audit arsitektur.

---

## 📄 Lisensi
Hak Cipta © 2026 Tim Pengembang HTS Chat Integration. Seluruh hak cipta dilindungi.
