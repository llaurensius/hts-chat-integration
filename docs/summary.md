# 📋 Rangkuman Lengkap Perkembangan Proyek (Project Summary)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V2.1 (Multi-Assign, Per-Team Resolve, Service Type, LAN Support)  
**Terakhir Diperbarui:** 28 September 2026

---

## 📌 1. Ringkasan Eksekutif

Sistem Helpdesk **HTS Chat Integration** telah berhasil diselesaikan secara penuh dari tahap perancangan dokumen hingga menjadi **sistem aplikasi produksi fungsional penuh (*Full-Stack Application*)**.

Sistem ini menjembatani aduan masyarakat/instansi via saluran **WhatsApp resmi** dengan dasbor web terpusat bagi tim Helpdesk. Dibangun menggunakan arsitektur **Evolution API v2**, **Node.js Express + Socket.io**, **PostgreSQL (Prisma ORM)**, dan **React.js + Tailwind CSS**, sistem ini menerapkan tata kelola kerja modern berbasis peran (**Role-Based Access Control - RBAC**) antara **Admin**, **Dispatcher (L1)**, dan **3 Pilar Teknisi Lapangan (L2)**.

---

## 🚀 2. Rekapitulasi Tahapan Pengembangan

### A. Fondasi Sistem (Workflow V1 - Selesai)
- **Fase 0 (Infrastruktur):** Setup Docker Compose (PostgreSQL 15, Redis, Evolution API v2) dan inisialisasi skema Prisma ORM.
- **Fase 1 (Inbound Webhook):** Penerimaan webhook WhatsApp, auto-create profil pelanggan & tiket baru, serta balasan otomatis *Auto-Reply Bot*.
- **Fase 2 (Outbound Chat):** Pengiriman pesan balasan langsung dari web dashboard ke WhatsApp pelapor via REST API Evolution.
- **Fase 3 (Real-time Live Chat):** Integrasi WebSocket Socket.io untuk pembaruan gelembung chat dan status tiket secara seketika tanpa refresh.
- **Fase 4 (Multi-Tagging & Mandatory Summary):** Tagging kategori masalah dan kewajiban mengisi kesimpulan penanganan saat penutupan tiket.
- **Fase 5 (Reporting & Analytics):** Halaman dasbor rekapitulasi aduan dengan fitur **Export to CSV**.
- **Fase 6 (Keamanan Dasar):** Pemasangan HTTP Headers `helmet` dan pembatasan laju permintaan `express-rate-limit`.

---

### B. Penyempurnaan Tata Kelola & Bisnis (Workflow V2 - Selesai)
- **Fase 1 (Perombakan Skema Database):** Mengganti model lama *Division* menjadi model terstruktur **`Category`** yang dilengkapi nomor target WhatsApp (`wa_target_number`), status tiket baru `RESOLVED`, dan penanda `is_internal` pada pesan catatan tim.
- **Fase 2 (Autentikasi JWT & RBAC Middleware):** Endpoint login `/api/auth/login` dengan enkripsi `bcryptjs` dan tokenisasi `jsonwebtoken` (masa berlaku 12 jam) yang memproteksi seluruh rute internal.
- **Fase 3 (Dukungan Media Gambar Dua Arah):** Pengiriman gambar dari Helpdesk ke WhatsApp pelapor (via Multer & Evolution API) dan penerimaan gambar dari WhatsApp pelapor langsung ke web chat.
- **Fase 4 (Antarmuka Dinamis L1 vs L2):** Pembelahan UI di mana Dispatcher L1 memiliki kendali komunikasi ke pelanggan, sedangkan Teknisi L2 berada dalam mode *View-Only* khusus percakapan pelanggan dan berfokus pada kolom *Catatan Internal*.
- **Fase 4.5 (Akun Admin & Manajemen Pengguna):** Penambahan peran `ADMIN` dengan akses penuh (melihat antrean L1 & L2) serta antarmuka khusus Manajemen Pengguna untuk membuat, melihat, dan menghapus akun L1/L2.
- **Fase 5 (Pendelegasian Tugas & WhatsApp Blast):** L1 dapat mendelegasikan tiket ke L2 disertai tembakan pesan notifikasi otomatis (*WhatsApp Blast*) ke nomor teknisi/grup WhatsApp terkait.
- **Fase 6 (Siklus Hidup Tiket L2):** Teknisi L2 menandai selesai (`RESOLVED`) dan Dispatcher L1 yang berhak menutup tiket secara resmi (`CLOSED`).

---

### C. Peningkatan Fitur Mutakhir (Workflow V2.1 - Selesai)

1. **3 Pilar Utama Tim Teknisi L2:**
   - `Network` (ditangani oleh `l2_network@helpdesk.go.id`)
   - `Server` (ditangani oleh `l2_server@helpdesk.go.id`)
   - `Mechanical & Electrical (M&E)` (ditangani oleh `l2_me@helpdesk.go.id`)
2. **Pendelegasian Multi-Assign (Satu atau Banyak Tim Sekaligus):**
   - L1 dapat mencentang lebih dari satu tim (misal `Network` dan `Server` sekaligus) pada modal penugasan.
   - Tiket otomatis muncul di antrean semua teknisi tim yang dicentang secara bersamaan, dan WhatsApp Blast dikirimkan ke seluruh nomor target tim tersebut.
3. **Penyelesaian Mandiri Per-Tim (*Per-Team Resolution*):**
   - Kolom `is_resolved` pada tabel `TicketCategory` mencatat penyelesaian per tim.
   - Jika satu tim menandai selesai, tiket tetap `OPEN` bagi tim yang masih bekerja, disertai pill badge: `[✓ Network: Selesai] | [⏳ Server: Sedang Dikerjakan]`.
   - Tiket otomatis menjadi `RESOLVED` hanya ketika **seluruh tim yang ditugaskan telah menyatakan selesai**.
4. **Pelepasan Penugasan Mandiri (*Self-Unassign Return*):**
   - Teknisi L2 dapat mengembalikan/melepas penugasan timnya jika bukan kewenangannya dengan menyertakan alasan. Tim tersebut dilepas tanpa membatalkan penugasan tim lain yang masih bekerja.
5. **Klasifikasi Jenis Layanan (*Service Type*):**
   - L1 dapat menentukan jenis layanan: `TROUBLESHOOTING`, `REQUEST_LAYANAN`, atau `MONITORING`.
6. **Akses Jaringan Lokal (LAN / Wi-Fi Kantor):**
   - Frontend Vite di-*bind* ke `0.0.0.0:5173` dan URL backend disetel dinamis menggunakan `window.location.hostname`, sehingga seluruh komputer atau ponsel di jaringan lokal dapat langsung mengakses aplikasi melalui IP host (misal `http://192.168.10.100:5173`).

---

## 🛠️ 3. Rekap Penanganan Bug & Stabilitas Teknis

| Masalah / Bug | Penyebab Teknis | Solusi yang Diterapkan |
|---|---|---|
| **Antrean L2 Tercampur** | Query `getTickets` mengambil semua tiket `OPEN` tanpa memfilter `category_id` | Menambahkan filter query Prisma berbasis `req.user.category_id` khusus peran L2. |
| **Pesan Susulan Pelanggan Membuka Tiket Baru** | Webhook hanya mencari tiket berstatus `OPEN`; tiket yang berstatus `RESOLVED` (belum di-close L1) dianggap tidak ada | Memperbarui query webhook menjadi `status: { in: ['OPEN', 'RESOLVED'] }` sehingga chat susulan tetap masuk ke tiket yang sama. |
| **Gambar dari WA Pelapor Gagal Masuk** | Express `body-parser` default hanya 100KB, sehingga payload webhook bergambar ditolak dengan `PayloadTooLargeError: 413` | Menaikkan limit parser menjadi `express.json({ limit: '50mb' })` dan mengecualikan webhook dari rate limiter. |
| **Gambar di Web Rusak / Broken Icon** | File upload tersimpan tanpa ekstensi (`.jpg`), memicu `Content-Type: application/octet-stream`, dan diblokir oleh header Helmet CORP | Membuat `imageStorage.js` berbasis Multer diskStorage yang mempertahankan ekstensi asli, serta menyetel `crossOriginResourcePolicy: cross-origin`. |
| **Tabel Rekap Aduan Tidak Muncul** | Markup tabel sempat tergantikan oleh placeholder teks sementara dan ada typo `categorys` pada query Prisma report | Mengembalikan markup tabel lengkap (8 kolom) dan memperbaiki pemanggilan relasi `categories`. |
| **Tombol "Tugaskan L2" Tidak Merespons** | Fungsi `handleAssignTicket` masih mengecek variabel lama `assignCategoryId` (tunggal) | Menyelaraskan fungsi dengan array `assignCategoryIds` multi-select. |
| **White Screen / Rendered More Hooks Error** | Urutan deklarasi React Hooks berubah akibat conditional return `if (!currentUser) return null` | Merestrukturisasi seluruh Hooks ke level teratas komponen dan memasang global `ErrorBoundary`. |

---

## 👥 4. Daftar Akun Pengujian Sistem (Seeding)

Semua akun terdaftar menggunakan **Password:** `password123`

| Peran (Role) | Nama Pengguna | Alamat Email | Kategori Khusus | Hak Akses Utama |
|---|---|---|:---:|---|
| **ADMIN** | Administrator | `admin@helpdesk.go.id` | - | Akses penuh (L1 + L2) & Menu Manajemen User |
| **L1** | Dispatcher L1 | `l1@helpdesk.go.id` | - | Chat ke Pelapor, Multi-Assign L2, Tutup Tiket Resmi |
| **SPV** | Supervisor | `spv@helpdesk.go.id` | - | Monitoring Antrean, Laporan Rekap, Export CSV |
| **L2 (Network)**| Teknisi Network L2 | `l2_network@helpdesk.go.id` | Network | View-Only, Catatan Internal, Tandai Selesai, Return |
| **L2 (Server)** | Teknisi Server L2 | `l2_server@helpdesk.go.id` | Server | View-Only, Catatan Internal, Tandai Selesai, Return |
| **L2 (M&E)** | Teknisi M&E L2 | `l2_me@helpdesk.go.id` | M&E | View-Only, Catatan Internal, Tandai Selesai, Return |

---

## 📂 5. Indeks Dokumentasi Aktif di Folder `/docs`

Seluruh dokumentasi teknis di folder `/docs` telah diperbarui dan diselaraskan:
1. **[Product Requirements Document (PRD)](./PRD_WhatsApp_Helpdesk.md)** - Spesifikasi kebutuhan bisnis, persona pengguna, dan kriteria penerimaan.
2. **[Database Schema / ERD](./Database_Schema.md)** - Skema relasional PostgreSQL, rincian tabel, tipe data, dan enum.
3. **[Spesifikasi API Endpoints](./API_Endpoints_Spec.md)** - Kontrak REST API, Webhook, dan Socket.io events.
4. **[Spesifikasi Keamanan](./Security_Specification.md)** - Standar enkripsi JWT, RBAC, Helmet CSP/CORP, dan Rate Limiter.
5. **[Diagram Alur Sistem (Flowcharts)](./System_Flowcharts.md)** - Diagram alur proses sistem menggunakan notasi Mermaid.
6. **[Arsitektur & Tech Stack](./Tech_Stack_Architecture.md)** - Topologi infrastruktur, daftar pustaka, dan dependensi sistem.
7. **[Panduan Deployment](./Deployment_Guide.md)** - Panduan Docker Compose, konfigurasi LAN, dan Nginx reverse proxy.
8. **[Panduan Operasional (SOP)](./Operational_Guide.md)** - Panduan operasional harian untuk Dispatcher L1, Teknisi L2, Admin, dan SPV.
9. **[Kredensial Pengguna](./user.md)** - Daftar akun pengujian default sistem.
