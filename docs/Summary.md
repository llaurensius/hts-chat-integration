# 📋 Rangkuman Lengkap Perkembangan Proyek (Project Summary)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V3.0 (Full HTS Diskomdigi Integration, Auto-Reply Bot, Multi-Assign, Dual-Close & PIC Sync)  
**Terakhir Diperbarui:** 30 September 2026  

---

## 📌 1. Ringkasan Eksekutif

Sistem Helpdesk **HTS Chat Integration** adalah platform terintegrasi untuk menangani aduan masyarakat atau Organisasi Perangkat Daerah (OPD) melalui saluran resmi **WhatsApp** yang terhubung secara *real-time* ke dasbor web Helpdesk dan secara otomatis tersinkronisasi dua arah ke portal tiket resmi **HTS Diskomdigi Provinsi Jawa Tengah** (`https://hts.diskomdigi.jatengprov.go.id`).

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
- **Fase 4.5 (Akun Admin & Manajemen Pengguna):** Penambahan peran `ADMIN` dengan akses penuh serta antarmuka khusus Manajemen Pengguna untuk membuat, melihat, dan menghapus akun L1/L2.
- **Fase 5 (Pendelegasian Tugas & WhatsApp Blast):** L1 dapat mendelegasikan tiket ke L2 disertai tembakan pesan notifikasi otomatis (*WhatsApp Blast*) ke nomor teknisi/grup WhatsApp terkait.
- **Fase 6 (Siklus Hidup Tiket L2):** Teknisi L2 menandai selesai (`RESOLVED`) dan Dispatcher L1 yang berhak menutup tiket secara resmi (`CLOSED`).

---

### C. Peningkatan Fitur Mutakhir (Workflow V2.1 & V2.2 - Selesai)
1. **3 Pilar Utama Tim Teknisi L2:** `Network`, `Server`, dan `Mechanical & Electrical (M&E)`.
2. **Pendelegasian Multi-Assign:** L1 dapat mencentang lebih dari satu tim sekaligus pada tiket.
3. **Penyelesaian Mandiri Per-Tim (*Per-Team Resolution*):** Kolom `is_resolved` pada `TicketCategory` mencatat status per tim. Tiket utama otomatis `RESOLVED` ketika seluruh tim selesai.
4. **Pelepasan Penugasan Mandiri (*Self-Unassign Return*):** L2 dapat melepas penugasan timnya jika salah kamar penugasan tanpa membatalkan tim lain.
5. **Klasifikasi Jenis Layanan (*Service Type*):** `Troubleshooting`, `Request Layanan`, atau `Monitoring`.
6. **Kustomisasi Auto-Reply Bot & Sakelar ON/OFF (Khusus L1):** Menu robot 🤖 di sidebar L1 untuk mengubah template pesan sambutan WhatsApp dan toggle aktif/nonaktif.
7. **Pembersihan Data Rekap Aduan & Reset Sequence ID ke 1 (Khusus ADMIN):** Menghapus data testing dan mereset urutan ID auto-increment kembali ke 1.
8. **Manajemen Multi-Kontak WhatsApp Blast Tim L2 (Khusus ADMIN):** Mendaftarkan banyak nomor personil (`628xxx`) maupun ID Grup WA (`xxx@g.us`) per tim dengan fitur Inline Edit.
9. **Dual Tab Chat L1 (Balas WhatsApp vs Catatan Internal):** Memungkinkan L1 mengirim catatan internal rahasia berbadge kuning yang tidak terkirim ke WhatsApp pelapor.

---

### D. Integrasi Penuh Portal HTS Diskomdigi (Workflow V3.0 - Selesai)
1. **Arsitektur Sesi Login HTS Berbasis Cookie:**
   - Model `HtsUserSession` menyimpan cookie PHP `ci_session` dan token CSRF per-petugas L1/Admin.
   - Sesi diperiksa secara berkala via endpoint `/api/notif` portal HTS untuk mendeteksi keaktifan login.
2. **Bypass CAPTCHA Live Interaktif:**
   - Menghubungkan akun HTS secara aman langsung dari browser menggunakan streaming gambar CAPTCHA numerik dari server portal HTS.
3. **Pipeline 3-Tahap Penerbitan Tiket HTS:**
   - **Tahap 1 (`/submit_aduan`):** Mengirimkan data pelapor, OPD, waktu problem, kategori & sub-kategori, detil kendala, dan lampiran. Mengembalikan nomor aduan (misal: `#2025-TShoot-2026-jateng-09`).
   - **Tahap 2 (`/submit_aduan_status`):** Memindahkan status dari *unsubmitted* ke *input-pic* menggunakan ID trouble numerik yang di-lookup secara real-time via `/get_aduan_data`.
   - **Tahap 3 (`/submit_pic`):** Menetapkan PIC Penerima Aduan awal ke status *pending* dengan format string ID koma (`pic_id = "14,8"`).
4. **Sinkronisasi PIC Tersambung (PIC Penerima $\leftrightarrow$ PIC Penanganan):**
   - ID PIC awal yang dipilih saat pembuatan tiket disimpan ke kolom `hts_pic_ids` pada basis data `Ticket`.
   - Saat modal penutupan tiket dibuka, PIC Penerima awal otomatis tercentang dengan badge khusus **`PIC Penerima`**.
   - Saat L1 mencentang teknisi penanganan tambahan (**`PIC Penanganan`**), backend secara otomatis menggabungkan (*merge tanpa duplikat*) kedua PIC tersebut dan mengirimkannya ke endpoint `/submit_teknis` HTS. Hal ini menjamin di portal HTS kedua PIC tercatat bersamaan dan tidak terputus.
5. **Fitur Tombol "Selesaikan ke Portal HTS":**
   - Menampilkan tombol langsung pada panel resume tiket untuk menyelesaikan tiket di HTS yang masih berstatus `PENDING` meskipun tiket lokal sudah ditutup atau diselesaikan oleh L2.
6. **Dual-Close dengan Proteksi Integritas Percakapan:**
   - Saat L1 menutup tiket di Helpdesk dan mencentang opsi penyelesaian HTS, backend melakukan submit teknis ke portal HTS.
   - **Prinsip Keamanan:** Jika penutupan di portal HTS gagal (misal file ditolak atau server HTS gangguan), tiket lokal **batal ditutup** dan percakapan tetap terbuka agar petugas dapat mengecek dan tidak ada chat yang terputus sepihak.
7. **Penyempurnaan Form HTS:**
   - Sub-kategori HTS hanya aktif untuk kategori *Troubleshoot*, dan dinonaktifkan untuk *Request Layanan* / *Monitoring*.
   - Pilihan OPD Induk (Klasifikasi HTS) bersifat opsional dengan pencarian typeahead responsif.
   - Validasi detil permasalahan minimal 10 karakter dengan live counter di frontend.
   - Dukungan file lampiran bukti teknis lengkap (`.jpg`, `.jpeg`, `.png`, `.pdf`) dengan penanganan MIME-type dinamis.

---

### E. Arsitektur Terpadu V4 (Multi-HTS, General Chat, Multimedia L2, Redesign 3 Kolom & SLA - Selesai)
1. **Pemisahan Percakapan Biasa vs Aduan Teknis (`is_aduan` & `GENERAL_CHAT`):**
   - Mendukung penanganan pesan WhatsApp yang bukan aduan (sapaan santai, konsultasi umum, atau salah sambung).
   - Petugas L1 dapat menyelesaikan percakapan biasa secara instan dengan satu tombol `[ ✅ Selesaikan Percakapan ]` tanpa perlu mengisi form aduan HTS atau input solusi L2.
   - Percakapan biasa diisolasi 100% dari antrean teknisi L2 (`whereClause.is_aduan = true`) dan dikecualikan secara mutlak dari metrik SLA / MTTR agar tidak merusak laporan performa.
   - Auto-Promotion: Jika obrolan biasa ditugaskan ke tim teknisi atau diterbitkan ke portal HTS, sistem otomatis mengubahnya menjadi aduan teknis.
2. **Arsitektur Multi-HTS (1 Obrolan $\rightarrow$ Banyak Tiket Portal HTS):**
   - Model baru `TicketHts` yang memungkinkan satu sesi chat menerbitkan beberapa nomor tiket resmi HTS ke divisi berbeda (misal Network dan Server sekaligus).
   - Menampilkan status tiket HTS secara independen dengan kemampuan penyelesaian parsial (*partial resolution*).
3. **Catatan Internal Multimedia Dua Arah (L1 $\leftrightarrow$ L2):**
   - Petugas L1 dan Teknisi L2 dapat saling mengirim foto/dokumen teknis internal melalui panel khusus.
   - Dijamin 100% rahasia (`is_internal = true`) dan tidak pernah bocor atau terkirim ke WhatsApp pelanggan.
   - Foto catatan internal dapat dipilih langsung sebagai bukti lampiran penutupan tiket di portal HTS tanpa perlu re-upload.
4. **Pembagian Riwayat Lampau (*Timeline Divider & Backfill*):**
   - Menghubungkan seluruh riwayat chat lampau dari nomor WhatsApp pelanggan yang sama dengan pembatas visual yang jelas (*Timeline Divider*).
   - Tombol *Tarik Riwayat WA Lama* untuk mengambil percakapan sebelum sistem Helpdesk diaktifkan via Evolution API.
5. **Redesign UI/UX 3 Kolom & Drawer Responsif (1366×768 Friendly):**
   - Layout 3 kolom adaptif: Kolom 1 (Daftar Percakapan), Kolom 2 (Chat Bubble Interaktif), Kolom 3 (Pusat Kendali Adaptif).
   - Penggantian modal pop-up dengan *Slide-Over Drawer* di sisi kanan dengan *Sticky Header & Footer* sehingga form tidak pernah terpotong pada layar laptop 1366×768 maupun ponsel mobile.
6. **Efisiensi Kerja (Quick Replies, Audio Chime & Metrik SLA SPV):**
   - Suggester Balasan Cepat (*Quick Replies*) saat mengetik tanda garis miring (`/`) dengan navigasi keyboard panah dan enter.
   - Synthesized Web Audio Chime native (D5 $\rightarrow$ A5) dan HTML5 Desktop Notification saat tab diminimize.
   - Metrik KPI SLA di Dasbor SPV (Total Aduan Teknis, Total Percakapan Biasa, Rata-rata FRT, dan Rata-rata MTTR Aduan Murni) beserta fitur Export CSV.

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
| **Nomor ID Aduan Melanjutkan Angka Lama Setelah Dihapus** | Perintah `deleteMany()` PostgreSQL tidak mereset sequence auto-increment | Menambahkan perintah `ALTER SEQUENCE ... RESTART WITH 1` di dalam transaksi reset database. |
| **Tiket Masuk ke "Belum Submit" di HTS** | ID aduan yang diparsing dari nomor string tidak sesuai dengan auto-increment database HTS | Mengambil `id_trouble` numerik asli via request `POST /get_aduan_data` (status: `unsubmitted`) dan menyertakan header `X-Requested-With: XMLHttpRequest`. |
| **Detil Masalah HTS Kurang dari 10 Karakter** | Portal HTS menolak teks keluhan di bawah 10 karakter tanpa pesan yang jelas | Menambahkan validasi minimum 10 karakter, counter karakter live, dan proteksi submit di frontend dan backend. |
| **Tipe File Ditolak HTS saat Tutup Tiket** | File lampiran dikirim dengan MIME type default `application/octet-stream` atau blob kosong | Menggunakan deteksi ekstensi dinamis (`image/jpeg`, `image/png`, `application/pdf`) dan mencegah penambahan form blob kosong jika tidak ada lampiran. |
| **PIC Penutupan Menimpa PIC Awal di HTS** | PIC penutupan dikirim sebagai nilai tunggal dan mengosongkan PIC awal yang menerima tiket | Menyimpan `hts_pic_ids` awal di basis data, otomatis mencentang PIC penerima di modal closing, menggabungkan (*merge*) PIC awal dan akhir, serta mengirim format koma (`"14,8"`). |

---

## 👥 4. Daftar Akun Pengujian Sistem (Seeding)

Semua akun terdaftar menggunakan **Password:** `password123`

| Peran (Role) | Nama Pengguna | Alamat Email | Kategori Khusus | Hak Akses Utama |
|---|---|---|:---:|---|
| **ADMIN** | Administrator | `admin@helpdesk.go.id` | - | Akses penuh (L1 + L2), Manajemen Pengguna, Kontak Tim L2, Hapus Rekap Aduan |
| **L1** | Dispatcher L1 | `l1@helpdesk.go.id` | - | Chat ke Pelapor, Multi-Assign L2, Auto-Reply Bot, Integrasi HTS, Tutup Tiket Resmi |
| **SPV** | Supervisor | `spv@helpdesk.go.id` | - | Monitoring Antrean, Laporan Rekap, Export CSV |
| **L2 (Network)**| Teknisi Network L2 | `l2_network@helpdesk.go.id` | Network | View-Only, Catatan Internal Tim Network, Solusi Teknis, Tandai Selesai, Return |
| **L2 (Server)** | Teknisi Server L2 | `l2_server@helpdesk.go.id` | Server | View-Only, Catatan Internal Tim Server, Solusi Teknis, Tandai Selesai, Return |
| **L2 (M&E)** | Teknisi M&E L2 | `l2_me@helpdesk.go.id` | M&E | View-Only, Catatan Internal Tim M&E, Solusi Teknis, Tandai Selesai, Return |

---

## 📂 5. Indeks Dokumentasi Aktif di Folder `/docs`

1. **[Product Requirements Document (PRD)](./PRD_WhatsApp_Helpdesk.md)** - Spesifikasi kebutuhan bisnis, persona pengguna, dan kriteria penerimaan.
2. **[Database Schema / ERD](./Database_Schema.md)** - Skema relasional PostgreSQL, rincian tabel, tipe data, dan enum (V3.0).
3. **[Spesifikasi API Endpoints](./API_Endpoints_Spec.md)** - Kontrak REST API, Webhook, Integrasi HTS, dan Socket.io events.
4. **[Spesifikasi Keamanan](./Security_Specification.md)** - Standar enkripsi JWT, RBAC, Helmet CSP/CORP, dan Rate Limiter.
5. **[Diagram Alur Sistem (Flowcharts)](./System_Flowcharts.md)** - Diagram alur proses sistem menggunakan notasi Mermaid.
6. **[Arsitektur & Tech Stack](./Tech_Stack_Architecture.md)** - Topologi infrastruktur, daftar pustaka, dan dependensi sistem.
7. **[Panduan Deployment](./Deployment_Guide.md)** - Panduan Docker Compose, konfigurasi LAN, dan Nginx reverse proxy.
8. **[Panduan Operasional (SOP)](./Operational_Guide.md)** - Panduan operasional harian untuk Dispatcher L1, Teknisi L2, Admin, dan SPV.
9. **[Daftar Akun & Kredensial Pengguna](./User.md)** - Panduan akun pengujian dan matriks hak akses.
10. **[Rangkuman Lengkap Proyek](./Summary.md)** - Rekapitulasi perjalanan sistem dari Workflow V1 hingga V3.0.
11. **[Spesifikasi Revisi Form HTS](./HTS_Form_Revisions_Spec.md)** - Detail aturan bisnis form HTS (Kategori, Detil, OPD, PIC).
12. **[Potensi Bug & Edge Cases Sistem](./Potential_Bugs_and_Edge_Cases.md)** - Analisis komprehensif potensi kendala, limitasi teknis, dan mitigasinya.
13. **[Peta Jalan Rombak Besar V4](./V4_Roadmap_Multi_HTS_and_Architecture_Redesign.md)** - Cetak biru konsep arsitektur Multi-HTS, riwayat lampau, media L2, efisiensi kerja, dan penanganan percakapan biasa vs aduan teknis.
14. **[Spesifikasi Teknis & Wireframe V4](./V4_Technical_Specification_and_Migration_Guide.md)** - Wireframe 3 kolom, responsivitas layar, skema data `TicketHts`, flag `is_aduan`, dan skrip migrasi SQL.
15. **[Panduan Implementasi Bertahap V4](./Implementation_Plan_V4.md)** - Rencana eksekusi terukur 6 fase untuk pengerjaan perlahan dan aman.

