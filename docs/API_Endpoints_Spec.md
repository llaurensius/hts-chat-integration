# 🌐 Spesifikasi API Endpoints & Kontrak Integrasi
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V4.0 Produksi  
**Basis URL:** `http://localhost:3000/api`  
**Autentikasi:** Bearer Token JWT (Header: `Authorization: Bearer <token>`)  
**Terakhir Diperbarui:** 01 Oktober 2026  

---

## 📌 Ringkasan Kelompok Endpoint

| Kelompok Rute | Prefix Path | Middleware Proteksi | Deskripsi |
|---|---|---|---|
| **Webhook WhatsApp** | `/api/webhook` | Publik (Bypass Rate Limiter) | Menerima event pesan masuk dari Evolution API |
| **Autentikasi** | `/api/auth` | Publik | Login pengguna & verifikasi sesi token JWT |
| **Chat & Tiket** | `/api/chat` | `verifyToken` | Manajemen percakapan, tiket, penugasan, media, dan HTS |
| **Integrasi Portal HTS** | `/api/hts` | `verifyToken` | Sesi login HTS, streaming CAPTCHA, master data HTS |
| **Laporan & SLA** | `/api/reports` | `verifyToken` | Rekapitulasi aduan, metrik KPI SLA, dan ekspor CSV |
| **Administrasi** | `/api/admin` | `verifyToken`, `requireRole(['ADMIN'])` | CRUD pengguna, kontak blast tim L2, reset rekap aduan |
| **Pengaturan Sistem** | `/api/settings` | Publik / L1 | Konfigurasi Auto-Reply Bot |

---

## 1. Webhook WhatsApp (`/api/webhook`)

### `POST /api/webhook/whatsapp`
Didaftarkan ke Evolution API (`helpdesk-wa`) untuk menerima event real-time WhatsApp.
- **Payload Event:** `messages.upsert`
- **Aturan Pemrosesan:**
  1. Mengabaikan pesan dari grup WhatsApp (`@g.us`).
  2. Mencegah duplikasi pesan jika `key.id` sudah ada di database (`wa_message_id`).
  3. Mendeteksi dan memetakan WhatsApp LID addressing (`remoteJidAlt` $\rightarrow$ nomor HP asli).
  4. Balasan dari HP fisik Helpdesk (`fromMe = true`) otomatis disimpan sebagai `AGENT`.
  5. Pesan pelanggan masuk (`fromMe = false`) memicu tiket baru jika belum ada tiket aktif (default: `GENERAL_CHAT`).

---

## 2. Autentikasi Pengguna (`/api/auth`)

- `POST /api/auth/login` — Login pengguna (Email & Password). Mengembalikan token JWT (masa aktif 12 jam) dan profil staf.
- `GET /api/auth/me` — Memverifikasi keabsahan token dan mengambil data profil pengguna saat ini.

---

## 3. Manajemen Tiket & Percakapan (`/api/chat`)

### A. Operasional Chat & Antrean
- `GET /api/chat/tickets` — Mengambil daftar tiket aktif/selesai.
  - Parameter Query: `status` (`OPEN`, `RESOLVED`, `CLOSED`), `search`, `filter` (`all`, `aduan`, `biasa`).
  - *RBAC L2:* Otomatis difilter hanya menampilkan tiket aduan yang didelegasikan ke kategori timnya (`category_id`).
- `GET /api/chat/tickets/:ticketId/messages` — Mengambil seluruh gelembung chat dan catatan internal pada tiket terkait.
- `POST /api/chat/send` — Mengirim balasan teks resmi dari dashboard ke WhatsApp pelanggan.
- `POST /api/chat/sendMedia` — Mengunggah gambar (multipart `media`) dan mengirimkannya ke WhatsApp pelanggan via Evolution API.
- `PUT /api/chat/customers/:customerId` — Mengubah nama pelapor atau nama instansi/SKPD (*Custom Identity*).

### B. Siklus Hidup Tiket & Penugasan
- `POST /api/chat/tickets/:ticketId/assign` — Menugaskan tiket ke satu atau banyak tim L2 (Multi-Assign) disertai pengiriman WhatsApp Blast ke nomor/grup teknisi. Otomatis mengubah tiket menjadi aduan teknis resmi (`is_aduan = true`).
- `POST /api/chat/tickets/:ticketId/resolve` — Teknisi L2 menandai selesai tugas timnya (`is_resolved = true`) beserta catatan solusi. Tiket utama otomatis `RESOLVED` jika seluruh tim selesai.
- `POST /api/chat/tickets/:ticketId/return` — Teknisi L2 melepas penugasan timnya jika bukan kewenangannya dengan menyertakan alasan pelepasan.
- `POST /api/chat/tickets/:ticketId/close` — Dispatcher L1 menutup tiket aduan secara resmi (`CLOSED`) dengan kewajiban mengisi ringkasan penanganan (*mandatory summary*).
- `POST /api/chat/tickets/:ticketId/close-general` — Menyelesaikan percakapan biasa secara instan dengan satu klik tanpa formulir portal HTS.
- `PATCH /api/chat/tickets/:ticketId/toggle-aduan` — Beralih secara fleksibel antara status `Percakapan Biasa` dan `Aduan Teknis`.

### C. Catatan Internal Multimedia (L1 ↔ L2)
- `POST /api/chat/tickets/:ticketId/internal-note` — Mengirim teks catatan rahasia internal tim (berbadge kuning, 100% aman tidak terkirim ke WhatsApp pelanggan).
- `POST /api/chat/tickets/:ticketId/internal-media` — Mengunggah gambar teknis internal (multipart `media`).
- `GET /api/chat/tickets/:ticketId/internal-media` — Mengambil daftar foto catatan internal yang pernah diunggah untuk tiket tersebut (dapat dipilih sebagai bukti penutupan HTS).

### D. Riwayat Lampau & Arsip WhatsApp
- `GET /api/chat/customers/:customerId/history-messages` — Mengambil seluruh riwayat pesan dari tiket-tiket lampau pelanggan yang sudah berstatus `CLOSED`.
- `POST /api/chat/customers/:customerId/fetch-wa-history` — Mengambil 20 pesan historis langsung dari memori WhatsApp via Evolution API (mendukung nomor HP standar maupun LID addressing).

### E. Balasan Cepat (Quick Replies / Canned Responses)
- `GET /api/chat/quick-replies` — Mengambil seluruh daftar template balasan cepat.
- `POST /api/chat/quick-replies` — Membuat template baru (`shortcut`, `title`, `content`).
- `PUT /api/chat/quick-replies/:id` — Memperbarui template balasan cepat.
- `DELETE /api/chat/quick-replies/:id` — Menghapus template.

### F. Hub Multi-HTS & Disaster Recovery
- `GET /api/chat/tickets/:ticketId/hts` — Mengambil seluruh tiket HTS resmi yang terhubung ke percakapan ini.
- `POST /api/chat/tickets/:ticketId/hts` — Menerbitkan tiket baru ke portal resmi HTS Diskomdigi Jawa Tengah.
- `POST /api/chat/tickets/:ticketId/hts/:htsId/solve` — Menyelesaikan tiket HTS spesifik di portal resmi (dengan bukti foto internal L2 atau file komputer).
- `POST /api/chat/tickets/:ticketId/link-hts` — Menautkan nomor tiket HTS yang sudah terlanjur terbit di portal resmi secara manual (Disaster Recovery).
- `POST /api/chat/tickets/:ticketId/hts/:htsTicketId/complete-pic` — Melengkapi penugasan PIC untuk tiket HTS yang terhenti pada status `INPUT_PIC`.

---

## 4. Integrasi Portal HTS Diskomdigi (`/api/hts`)

- `GET /api/hts/session-status` — Memeriksa status keaktifan login sesi HTS petugas saat ini.
- `GET /api/hts/captcha` — Melakukan streaming gambar CAPTCHA numerik live dari server portal HTS.
- `POST /api/hts/login` — Login ke portal HTS menggunakan email, kata sandi, dan jawaban CAPTCHA (menyimpan cookie `ci_session`).
- `GET /api/hts/master-data` — Mengambil data referensi OPD Induk, Kategori, Sub-Kategori, dan PIC resmi dari HTS.

---

## 5. Laporan & Metrik SLA (`/api/reports`)

- `GET /api/reports` — Mengambil rekapitulasi aduan dengan filter rentang tanggal, jenis layanan, dan tim L2.
- `GET /api/reports/sla-stats` — Mengambil kalkulasi metrik kinerja (Total Percakapan, Total Aduan Murni, Total Obrolan Biasa, Rata-rata FRT, Rata-rata MTTR Aduan Murni).
- `GET /api/reports/export-csv` — Mengunduh berkas laporan dalam format spreadsheet CSV.

---

## 6. Administrasi Sistem (`/api/admin`)

- `GET /api/admin/users` — Mengambil daftar seluruh staf pengguna sistem.
- `POST /api/admin/users` — Mendaftarkan akun staf baru.
- `PUT /api/admin/users/:id` — Memperbarui profil staf (Nama, Email, Role, Kategori L2, Reset Password).
- `DELETE /api/admin/users/:id` — Menghapus akun pengguna nonaktif.
- `GET /api/admin/team-categories` — Mengambil daftar kategori L2 beserta nomor kontak WhatsApp blast.
- `POST /api/admin/team-contacts` — Menambahkan nomor personil atau grup WA ke tim teknisi L2.
- `DELETE /api/admin/team-contacts/:id` — Menghapus kontak blast tim L2.
- `POST /api/admin/clear-reports` — Menghapus data testing aduan terpilih atau seluruhnya, dan otomatis mereset auto-increment sequence database kembali ke ID #1.

---

## 7. Event Real-time WebSocket (Socket.io)

| Nama Event | Arah | Keterangan |
|---|:---:|---|
| `new_message` | Server $\rightarrow$ Client | Gelembung chat masuk baru (publik maupun catatan internal) |
| `ticket_assigned` | Server $\rightarrow$ Client | Notifikasi tiket telah didelegasikan ke tim teknisi L2 |
| `ticket_closed` | Server $\rightarrow$ Client | Notifikasi tiket telah ditutup resmi oleh L1 |
| `customer_updated` | Server $\rightarrow$ Client | Pembaruan nama pelapor atau instansi SKPD |
| `hts_ticket_created`| Server $\rightarrow$ Client | Notifikasi nomor tiket HTS baru berhasil terbit/ditautkan |
| `hts_ticket_updated`| Server $\rightarrow$ Client | Notifikasi pembaruan status tiket HTS (SOLVED / PENDING) |
