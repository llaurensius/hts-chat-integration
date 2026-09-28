# 📋 Rangkuman Lengkap Perkembangan Proyek (Project Summary)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V2.2 (Auto-Reply Bot, Multi-Kontak WA Blast, Smart Assignment, Team Identity, Report Reset)  
**Terakhir Diperbarui:** 29 September 2026  

---

## 📌 1. Ringkasan Eksekutif

Sistem Helpdesk **HTS Chat Integration** adalah platform terintegrasi untuk menangani aduan masyarakat atau instansi (*PIC*) melalui saluran resmi **WhatsApp** yang terhubung secara *real-time* ke dasbor web tim Helpdesk.

Dibangun dengan arsitektur **Evolution API v2**, **Node.js Express + Socket.io**, **PostgreSQL (Prisma ORM)**, dan **React.js + Tailwind CSS**, sistem ini menerapkan tata kelola kerja modern berbasis peran (**Role-Based Access Control - RBAC**) antara **Administrator**, **Dispatcher (L1)**, **Supervisor (SPV)**, dan **3 Pilar Teknisi Lapangan (L2: Network, Server, Mechanical & Electrical)**.

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
1. **3 Pilar Utama Tim Teknisi L2:** `Network`, `Server`, dan `Mechanical & Electrical (M&E)`.
2. **Pendelegasian Multi-Assign:** L1 dapat mencentang lebih dari satu tim sekaligus pada tiket.
3. **Penyelesaian Mandiri Per-Tim (*Per-Team Resolution*):** Kolom `is_resolved` pada `TicketCategory` mencatat status per tim. Tiket utama otomatis `RESOLVED` ketika seluruh tim selesai.
4. **Pelepasan Penugasan Mandiri (*Self-Unassign Return*):** L2 dapat melepas penugasan timnya jika salah kamar penugasan tanpa membatalkan tim lain.
5. **Klasifikasi Jenis Layanan (*Service Type*):** `Troubleshooting`, `Request Layanan`, atau `Monitoring`.
6. **Akses Jaringan Lokal (LAN / Wi-Fi Kantor):** Binding host `0.0.0.0` pada port `5173` dan `3000` dengan resolusi hostname dinamis.

---

### D. Fitur Mutakhir & Penyempurnaan Operasional (Workflow V2.2 - Selesai)
1. **Kustomisasi Auto-Reply Bot & Sakelar ON/OFF (Khusus L1):**
   - Halaman menu robot 🤖 di sidebar L1 untuk mengubah template pesan sambutan WhatsApp dan toggle aktif/nonaktif.
   - Model database `Setting` terhubung langsung dengan webhook chat.
2. **Pembersihan Data Rekap Aduan & Reset Sequence ID ke 1 (Khusus ADMIN):**
   - Checkbox per-baris tabel untuk menghapus data testing terpilih.
   - Tombol ⚠️ *"Hapus Semua Data"* dengan konfirmasi pop-up yang mengosongkan data dan **mereset urutan auto-increment primary key PostgreSQL kembali ke angka 1**.
3. **Manajemen Multi-Kontak WhatsApp Blast Tim L2 (Khusus ADMIN):**
   - Menu pemancar 📡 *"Kontak Tim L2"* untuk mendaftarkan banyak nomor personil (`628xxx`) maupun ID Grup WA (`xxx@g.us`) per tim.
   - Fitur **Inline Edit (Pensil ✏️)** langsung di baris kontak untuk mengubah nama dan nomor target.
   - Notifikasi WhatsApp Blast otomatis melooping seluruh kontak yang terdaftar pada tim yang di-assign.
4. **Catatan Internal L2 dengan Identitas Tim & Nama Teknisi Otomatis:**
   - Gelembung catatan internal menampilkan badge dinamis: `🏷️ Catatan Internal - Tim [Network/Server/M&E] ([Nama Teknisi])`.
   - Input box teknisi L2 otomatis menampilkan nama tim teknisi yang sedang login.
5. **Penugasan Cerdas & Anti-Overwrite (Diffing & Merge):**
   - Penugasan ulang tiket tidak lagi menghapus tim yang sedang bekerja.
   - WhatsApp Blast hanya ditembakkan ke tim yang **baru ditambahkan** (mencegah spam notifikasi berulang).
   - Modal penugasan otomatis tercentang (*pre-fill*) untuk tim yang sedang bertugas disertai badge `(Sedang Ditugaskan)`.
   - Peringatan konfirmasi jika L1 sengaja melepas tim yang sedang aktif.
6. **Centang Kategori Otomatis saat Selesaikan Tiket:**
   - Saat L1 mengklik *"Selesaikan"*, modal penutupan tiket otomatis mencentang kategori sesuai penugasan awal L2 dengan badge penanda `Penugasan L2`, dengan fleksibilitas bagi L1 untuk menambah/menyesuaikan sebelum tiket ditutup resmi.
7. **Resolusi Identitas Pelapor Hybrid & Pengelolaan Nama/Instansi (Web Custom > Kontak HP > Profil WA):**
   - Mengambil nama kontak tersimpan di buku kontak HP Helpdesk (via Evolution API `findContacts`) secara otomatis saat pesan masuk.
   - Dispatcher L1 dan Admin dapat mengubah nama pelapor dan instansi/SKPD langsung dari header chat atau panel detail tiket (tombol pensil ✏️).
   - Nama hasil editan tersimpan permanen (`is_custom_name = true`) dan disiarkan seketika via WebSocket (`customer_updated`) serta otomatis masuk ke Laporan Rekapitulasi dan Export CSV.
8. **Dua Mode Pengiriman Chat L1 (Dual Tab Zendesk Style: Balas WhatsApp vs Catatan Internal):**
   - Dispatcher L1 kini dapat berpindah mode antara membalas langsung ke nomor WhatsApp pelapor (💬 tab warna biru) dan mengirim catatan internal rahasia ke teknisi L2 (🔒 tab warna kuning/amber).
   - Catatan internal dari L1 **100% rahasia**, tidak dikirim ke WhatsApp pelapor, dan otomatis bertag identitas `🏷️ Catatan Internal - Dispatcher L1 (Nama Petugas)`.

---

## 🛠️ 3. Rekap Penanganan Bug & Stabilitas Teknis

| Masalah / Bug | Penyebab Teknis | Solusi yang Diterapkan |
|---|---|---|
| **Antrean L2 Tercampur** | Query `getTickets` mengambil semua tiket `OPEN` tanpa memfilter `category_id` | Menambahkan filter query Prisma berbasis `req.user.category_id` khusus peran L2. |
| **Pesan Susulan Pelanggan Membuka Tiket Baru** | Webhook hanya mencari tiket `OPEN`; tiket yang berstatus `RESOLVED` dianggap tidak ada | Memperbarui query webhook menjadi `status: { in: ['OPEN', 'RESOLVED'] }`. |
| **Gambar dari WA Pelapor Gagal Masuk** | Express body-parser default hanya 100KB (`PayloadTooLargeError: 413`) | Menaikkan limit parser menjadi `50mb` dan mengecualikan webhook dari rate limiter. |
| **Gambar di Web Rusak / Broken Icon** | File upload tersimpan tanpa ekstensi dan diblokir oleh CORP | Menggunakan Multer diskStorage dengan ekstensi asli dan menyetel `crossOriginResourcePolicy: cross-origin`. |
| **Tabel Rekap Aduan Tidak Muncul** | Typo `categorys` pada query Prisma report | Menyelaraskan query relasi `categories` dan merestorasi tabel 8 kolom. |
| **Penugasan Pertama Hilang saat Assign Ulang** | `assignTicket` menjalankan `ticketCategory.deleteMany()` membabi buta | Menerapkan logika *diffing & merge*: tim lama dipertahankan, tim baru ditambahkan, dan blast hanya dikirim ke tim baru. |
| **Internal Server Error saat Simpan Penugasan** | ReferenceError variabel `${teamNames}` yang belum diperbarui ke `${allActiveTeamNames}` | Memperbarui pemanggilan variabel string response menjadi `allActiveTeamNames`. |
| **Nomor ID Aduan Melanjutkan Angka Lama Setelah Dihapus** | Perintah `deleteMany()` PostgreSQL tidak mereset sequence auto-increment | Menambahkan perintah `ALTER SEQUENCE ... RESTART WITH 1` di dalam transaksi reset database. |

---

## 👥 4. Daftar Akun Pengujian Sistem (Seeding)

Semua akun terdaftar menggunakan **Password:** `password123`

| Peran (Role) | Nama Pengguna | Alamat Email | Kategori Khusus | Hak Akses Utama |
|---|---|---|:---:|---|
| **ADMIN** | Administrator | `admin@helpdesk.go.id` | - | Akses penuh (L1 + L2), Manajemen Pengguna, Kontak Tim L2, Hapus Rekap Aduan |
| **L1** | Dispatcher L1 | `l1@helpdesk.go.id` | - | Chat ke Pelapor, Multi-Assign L2, Auto-Reply Bot, Tutup Tiket Resmi |
| **SPV** | Supervisor | `spv@helpdesk.go.id` | - | Monitoring Antrean, Laporan Rekap, Export CSV |
| **L2 (Network)**| Teknisi Network L2 | `l2_network@helpdesk.go.id` | Network | View-Only, Catatan Internal Tim Network, Tandai Selesai, Return |
| **L2 (Server)** | Teknisi Server L2 | `l2_server@helpdesk.go.id` | Server | View-Only, Catatan Internal Tim Server, Tandai Selesai, Return |
| **L2 (M&E)** | Teknisi M&E L2 | `l2_me@helpdesk.go.id` | M&E | View-Only, Catatan Internal Tim M&E, Tandai Selesai, Return |

---

## 📂 5. Indeks Dokumentasi Aktif di Folder `/docs`

1. **[Product Requirements Document (PRD)](./PRD_WhatsApp_Helpdesk.md)** - Spesifikasi kebutuhan bisnis, persona pengguna, dan kriteria penerimaan.
2. **[Database Schema / ERD](./Database_Schema.md)** - Skema relasional PostgreSQL, rincian tabel, tipe data, dan enum.
3. **[Spesifikasi API Endpoints](./API_Endpoints_Spec.md)** - Kontrak REST API, Webhook, dan Socket.io events.
4. **[Spesifikasi Keamanan](./Security_Specification.md)** - Standar enkripsi JWT, RBAC, Helmet CSP/CORP, dan Rate Limiter.
5. **[Diagram Alur Sistem (Flowcharts)](./System_Flowcharts.md)** - Diagram alur proses sistem menggunakan notasi Mermaid.
6. **[Arsitektur & Tech Stack](./Tech_Stack_Architecture.md)** - Topologi infrastruktur, daftar pustaka, dan dependensi sistem.
7. **[Panduan Deployment](./Deployment_Guide.md)** - Panduan Docker Compose, konfigurasi LAN, dan Nginx reverse proxy.
8. **[Panduan Operasional (SOP)](./Operational_Guide.md)** - Panduan operasional harian untuk Dispatcher L1, Teknisi L2, Admin, dan SPV.
9. **[Daftar Akun & Kredensial Pengguna](./User.md)** - Panduan akun pengujian dan matriks hak akses.
10. **[Rangkuman Lengkap Proyek](./Summary.md)** - Rekapitulasi perjalanan sistem dari Workflow V1 hingga V2.2.
11. **[Rencana Implementasi V2 (Arsip)](./Implementation_Plan_V2.md)** - Catatan histori panduan implementasi 4 fase (Status: Selesai).
