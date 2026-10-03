# LAPORAN KERJA FORMAL: REMEDIASI DAN OPTIMASI SISTEM INTEGRASI HTS CHAT
**Dokumen:** Ringkasan Pekerjaan Teknis (Executive Technical Summary)  
**Status:** Selesai (Sprint 1, Sprint 2, dan Sprint 3 Telah Tuntas)  
**Target Repositori:** `hts-chat-integration`  
**Penyusun:** Technical Documentation Specialist / Project Assistant  
**Tanggal:** 3 Oktober 2026  

---

## 1. Ringkasan Eksekutif

Laporan ini menyajikan rekapitulasi komprehensif atas pelaksanaan audit sistem, penguatan keamanan (*security hardening*), perbaikan integritas data (*data integrity*), dan optimasi performa arsitektur pada platform **HTS Chat Integration**. Platform ini bertugas mengintegrasikan saluran layanan pelanggan berbasis WhatsApp (melalui Evolution API) dengan portal penanganan aduan teknis resmi Helpdesk Ticketing System (HTS) Diskominfo Provinsi Jawa Tengah.

Sebelum kegiatan remedi ini dilakukan, sistem memiliki sejumlah kerentanan kritis, antara lain: ketiadaan otentikasi pada endpoint webhook, bypass otorisasi Role-Based Access Control (RBAC) pada sisi peladen, hardcoded credential rahasia, kerentanan path traversal pada pengunggahan lampiran, *race condition* yang memicu duplikasi tiket pada lonjakan pesan WhatsApp, ketiadaan timeout pada HTTP client, serta siaran event WebSocket Socket.io tanpa otentikasi handshake.

Melalui pendekatan bertahap berbasis sprint (*Sprint 1: Keamanan & Otorisasi*, *Sprint 2: Integritas State & Rekonsiliasi Transaksi*, dan *Sprint 3: Durabilitas, Kinerja & Siklus Hidup File*), seluruh temuan kerentanan berhasil diremediasi 100%. Hasil akhir pekerjaan ini menjamin platform beroperasi dengan prinsip *least privilege*, transaksi database atomik (*ACID compliant*), transmisi data tersinkronisasi tanpa *zombie state*, serta pelindungan data privasi pelanggan pada lapisan WebSocket.

---

## 2. Lingkup & Masalah Awal

Berdasarkan laporan audit teknis independen ([`System_Audit_Report.md`](file:///d:/Kuliah/Repository/hts-chat-integration/docs/System_Audit_Report.md)), lingkup permasalahan teknis yang diidentifikasi terbagi ke dalam empat kategori utama:

### A. Keamanan & Otorisasi (*Security & Access Control*)
1. **SEC-01 (Kritis):** Endpoint webhook publik (`/api/webhook`) tidak memvalidasi otentisitas pengirim, sehingga rentan injeksi pesan tiruan (*spoofing*) dan eksploitasi Denial-of-Service melalui payload JSON berukuran masif.
2. **SEC-02 & AUTH-01 (Kritis):** Rute operasional tiket ([`routes/chat.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/routes/chat.js)) hanya mengandalkan pengecekan token JWT tanpa penegakan RBAC di tingkat peladen. Agen Level 2 (L2) tanpa kategori dapat mengakses seluruh tiket, dan Level 1 (L1) dapat menyelesaikan tugas teknis L2 tanpa wewenang.
3. **SEC-03 (Kritis):** Kunci rahasia JWT (`JWT_SECRET`) dan token Evolution API memiliki nilai cadangan (*hardcoded fallback*) dalam kode sumber, melanggar prinsip *fail-fast*.
4. **SEC-04 (Tinggi):** Jalur berkas lampiran yang dikirimkan ke portal HTS tidak divalidasi dan tidak disanitasi, membuka celah *Path Traversal* (`../`).
5. **SEC-05 (Tinggi):** Peladen Socket.io berjalan dengan `origin: '*'` tanpa mekanisme *handshake authentication*, memancarkan data identitas pelapor dan catatan internal staf ke pihak luar.

### B. Integritas Data & Konkurensi (*Concurrency & Data Integrity*)
1. **DATA-01 (Tinggi):** Webhook memproses pesan masuk secara konkuren tanpa penguncian per nomor pelanggan. Lonjakan pesan dalam rentang milidetik memicu pembuatan dua tiket `OPEN` simultan dan balasan otomatis (*auto-reply*) ganda.
2. **DATA-02 (Tinggi):** Kolom `wa_message_id` pada tabel `Message` hanya bertipe indeks biasa (bukan `@unique`), sehingga mekanisme pencegahan duplikasi *check-then-insert* gagal menahan *race condition*.
3. **LOGIC-02 & DATA-03 (Menengah):** Pengaktifan kembali tiket (`reopenTicket`) tidak mereset status penanganan tim L2 (`is_resolved`). Operasi penutupan tiket (`closeTicket`) tidak memiliki penjaga mesin status (*state machine guard*), sehingga rentan terhadap eksekusi ganda (*double-close*).

### C. Komunikasi Eksternal & Ketahanan Layanan (*Resilience & Edge Cases*)
1. **EDGE-01 & LOGIC-01 (Tinggi):** Ketika terjadi *timeout* jaringan saat menutup tiket di portal HTS, sistem membatalkan penutupan lokal padahal tiket telah tersimpan sebagai `SOLVED` di portal. Percobaan berikutnya gagal permanen (*zombie lock*). Selain itu, fungsi pencarian nomor HTS mengarang tiket tiruan jika nomor tidak ditemukan.
2. **RES-01 (Tinggi):** Instance Axios Evolution API tidak memiliki batas waktu (*timeout*). Loop pengiriman notifikasi penugasan tiket L2 dijalankan secara serial berurutan, sehingga gangguan jaringan pada Evolution API menahan eksekusi proses utama.

### D. Kinerja & Pemeliharaan Berkas (*Performance & Storage Lifecycle*)
1. **RES-03 (Menengah):** Penamaan berkas unggahan Multer berbasis milidetik tanpa sufiks acak memicu benturan (*collision*) berkas. Folder penyimpanan lokal tidak memiliki mekanisme retensi berkas kedaluwarsa.
2. **DATA-04 (Menengah):** Ketiadaan indeks komposit (*compound index*) pada tabel `Ticket` menyebabkan penurunan performa saat memfilter antrean tiket aktif berdasar status, jenis layanan, dan urutan waktu.

---

## 3. Rincian Pekerjaan & Langkah Solusi

Pekerjaan diselesaikan secara terstruktur dan terukur melalui tiga sprint:

```
[SPRINT 1: Keamanan & RBAC] ──► [SPRINT 2: Integritas State] ──► [SPRINT 3: Durabilitas & Indexing]
  ├─ SEC-01 Webhook Secret        ├─ DATA-01 Per-Number Lock      ├─ SEC-05 Socket Handshake Auth
  ├─ SEC-02 Server RBAC           ├─ DATA-02 Unique WA ID         ├─ RES-03 Multer Suffix & Cleanup
  ├─ SEC-03 Fail-Fast Env         ├─ EDGE-01/LOGIC-01 Reconcile   └─ DATA-04 Compound DB Indexes
  └─ SEC-04 SafePath Traversal    ├─ RES-01 Axios Timeout & Blast
                                  └─ LOGIC-02/DATA-03 Tx Guard
```

### 3.1. Pelaksanaan Sprint 1 (Keamanan Fondasional)
- **Implementasi Otentikasi Webhook ([`webhookAuth.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/middlewares/webhookAuth.js)):**
  Membangun middleware verifikasi *shared secret token* (`WEBHOOK_SECRET`) melalui header HTTP `apikey` atau `x-api-key`. Memisahkan rute webhook pada [`routes/webhook.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/routes/webhook.js) dengan parser JSON mandiri (maksimal 10MB) serta menerapkan *rate limiter* khusus (300 request/menit).
- **Penegakan RBAC Sisi Peladen ([`routes/chat.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/routes/chat.js) & [`routes/report.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/routes/report.js)):**
  Memasang middleware `requireRole` di setiap rute operasional. Di controller, agen L2 dengan `category_id = null` dibatasi secara ketat sehingga tidak dapat membaca antrean tiket non-spesifik. Menambahkan validasi kepemilikan tiket teknis pada `resolveTicket` dan `returnTicket`.
- **Validasi Variabel Lingkungan Fail-Fast ([`config/env.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/config/env.js)):**
  Membuat modul inisialisasi yang mengevaluasi keberadaan `DATABASE_URL`, `JWT_SECRET`, dan `EVOLUTION_API_TOKEN` saat proses Node.js dinyalakan. Menghapus seluruh nilai default rahasia pada seluruh repositori.
- **Pencegahan Path Traversal ([`utils/safePath.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/utils/safePath.js)):**
  Mengembangkan fungsi sanitasi kanonikal berbasis `path.resolve` yang membatasi resolusi berkas lampiran hanya di dalam subdirektori `/uploads`. Diterapkan pada `closeTicket`, `syncTicketToHts`, dan fungsi unggah lampiran di `htsClientService.js`.

### 3.2. Pelaksanaan Sprint 2 (Integritas Data & Rekonsiliasi State)
- **Mekanisme Antirace Kondisi Webhook ([`utils/perNumberLock.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/utils/perNumberLock.js)):**
  Menerapkan struktur antrean Promise in-memory (`withLock(waNumber, task)`) pada [`webhookController.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/controllers/webhookController.js). Seluruh pesan yang tiba bersamaan dari nomor telepon yang sama dieksekusi secara serial, menghilangkan pembuatan tiket dobel.
- **Deduplikasi Pesan Atomik ([`schema.prisma`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/prisma/schema.prisma)):**
  Mengubah definisi `wa_message_id` menjadi `@unique`. Menulis skrip migrasi SQL pembersihan baris duplikat historis dan pembuatan indeks unik. Pada controller, dibuat blok penanganan kesalahan khusus untuk kode Prisma `P2002` guna menolak pesan ganda tanpa memicu *unhandled rejection*.
- **Pembersihan Logika Tiket Fantasi & Rekonsiliasi Status ([`htsClientService.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/services/htsClientService.js) & [`chatController.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/controllers/chatController.js)):**
  Menghapus pembuatan objek tiket palsu pada `lookupTicketByNumber` dan menggantinya dengan error 404 eksplisit. Pada fungsi penutupan tiket (`closeTicket` dan `solveTicketHtsSingle`), ditambahkan alur rekonsiliasi otomatis: jika pengiriman ke portal mengalami *timeout* namun peladen HTS sebenarnya telah menandai tiket sebagai `SOLVED`, sistem lokal mendeteksi status tersebut dan menyelesaikan tiket tanpa kegagalan.
- **Ketahanan Klien HTTP & Paralelisasi Blast ([`evolutionService.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/services/evolutionService.js)):**
  Menetapkan `timeout: 10000` (10 detik) pada instance Axios Evolution API, serta timeout 15 detik pada pengunggahan dan pengunduhan media. Mengubah loop notifikasi L2 pada `assignTicket` menjadi operasi paralel menggunakan `Promise.allSettled` dengan batas waktu 5000 ms per target.
- **Pembersihan State Re-open & Guard State Machine ([`chatController.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/controllers/chatController.js)):**
  Pada `reopenTicket`, sistem kini mereset status `TicketCategory` (`is_resolved: false`, `resolved_at: null`, `solution: null`) dalam satu transaksi atomik `prisma.$transaction`. Pada `closeTicket`, diterapkan *atomic conditional update* (`where: { id, status: { not: 'CLOSED' } }`) yang mengembalikan HTTP 409 Conflict bila terjadi eksekusi ganda.

### 3.3. Pelaksanaan Sprint 3 (Siklus Hidup Berkas, Soket Aman & Indeks DB)
- **Otentikasi Handshake Socket.io ([`index.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/index.js) & [`App.jsx`](file:///d:/Kuliah/Repository/hts-chat-integration/frontend/src/App.jsx)):**
  Memasang middleware `io.use` yang memvalidasi JWT token dari `socket.handshake.auth.token`. Menolak klien anonim tanpa otentikasi. Mengisolasi soket ke dalam room terpisah (`user_{id}`, `role_{role}`, `category_{id}`). Di sisi frontend, soket dikonfigurasi menggunakan callback token dinamis dari `localStorage` serta otomatis melakukan *disconnect* saat logout dan *reconnect* saat login.
- **Pencegahan Benturan Berkas & Retensi Berkas ([`utils/imageStorage.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/utils/imageStorage.js) & [`services/fileCleanupService.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/services/fileCleanupService.js)):**
  Menambahkan sufiks 6 digit acak pada nama berkas Multer (`img_${Date.now()}_${randomSuffix}${ext}`). Membuat service terjadwal berkala yang menghapus berkas fisik pada direktori `/uploads` untuk tiket yang telah berstatus `CLOSED` lebih dari 90 hari.
- **Optimasi Indeks Skema Database ([`schema.prisma`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/prisma/schema.prisma)):**
  Menerapkan indeks gabungan `@@index([status, is_aduan, created_at(sort: Desc)])` dan `@@index([customer_id, status])` pada model `Ticket`, serta indeks pencarian `@@index([name])` dan `@@index([skpd_name])` pada model `Customer`. Disediakan berkas migrasi SQL idempotent di direktori migrasi Prisma.

---

## 4. Keputusan & Hasil Kunci

Berikut adalah matriks hasil perbaikan teknis utama yang disepakati dan diimplementasikan:

| Modul / Komponen | Kondisi Sebelum Perbaikan | Kondisi Setelah Implementasi (Solusi Final) |
| :--- | :--- | :--- |
| **Autentikasi Webhook** | Endpoint terbuka untuk umum tanpa pengaman header. | Dilindungi `webhookAuth` via token `WEBHOOK_SECRET` + limit payload khusus 10MB. |
| **Otorisasi API (RBAC)** | Rute chat terbuka untuk semua pengguna terotentikasi; peran diuji hanya di UI. | Penegakan di sisi peladen via `requireRole(['ADMIN', 'L1', 'L2'])` + isolasi akses baris data. |
| **Kredensial Lingkungan** | Secret JWT dan API Key memiliki fallback hardcoded di kode. | Modul fail-fast `config/env.js`; aplikasi otomatis berhenti jika variabel wajib belum disetel. |
| **Keamanan Berkas** | Penamaan berkas statis `Date.now()`; rentan *directory traversal*. | Sanitasi ketat via `safePath.js` + generator nama unik `Date.now()_rand6`. |
| **Konkurensi Webhook** | Pesan burst menciptakan tiket ganda dan duplikasi auto-reply bot. | Serialisasi per-nomor WA via `perNumberLock.js` + kendala basis data `@unique wa_message_id`. |
| **Koneksi Portal HTS** | Timeout jaringan menyebabkan tiket lokal gagal dan terkunci permanen. | Verifikasi pasca-error dengan rekonsiliasi status `SOLVED` + penghapusan nomor tiket fantasi. |
| **Klien Evolution API** | Ketiadaan timeout peladen; blast notifikasi L2 lambat karena serial. | Konfigurasi timeout eksplisit (10s/15s) + pemrosesan blast paralel `Promise.allSettled`. |
| **State Mesin Tiket** | Re-open membiarkan status tim tertutup; penutupan tiket rentan klik ganda. | Pembersihan state kategori secara atomik via transaksi DB + guard status `not: 'CLOSED'`. |
| **Soket Real-time** | Broadcast data global tanpa otentikasi; siapa pun dapat membaca chat. | Wajib autentikasi handshake JWT (`io.use`) + partisi room berdasarkan identitas & peran pengguna. |
| **Performa Database** | Pencarian antrean tiket menggunakan scan indeks terpisah yang lambat. | Indeks komposit `[status, is_aduan, created_at(sort: Desc)]` untuk latensi kueri minimal. |

---

## 5. Panduan Tindak Lanjut & Tutorial Eksekusi (Step-by-Step Action Guide)

Bagian ini menyediakan tutorial teknis praktis langkah demi langkah untuk menerapkan pembaruan, mengeksekusi migrasi basis data, mengonfigurasi variabel lingkungan, serta menjalankan pengujian regresi menyeluruh pada lingkungan *staging* atau *production*.

---

### 5.1. Tutorial Eksekusi Migrasi Basis Data PostgreSQL

Terdapat dua berkas migrasi SQL idempotent yang telah disiapkan di repositori:
1. `backend/prisma/migrations/20261003_add_unique_wa_message_id/migration.sql` (Pembersihan duplikat & indeks `@unique` pada `wa_message_id`).
2. `backend/prisma/migrations/20261003_add_performance_compound_indexes/migration.sql` (Indeks gabungan performa antrean tiket dan pencarian kontak).

Pilih salah satu metode eksekusi berikut sesuai dengan alur kerja operasional server Anda:

#### Metode A: Menggunakan PostgreSQL CLI (`psql`) — Direkomendasikan untuk Server / Terminal
Jalankan perintah berikut melalui terminal peladen (pastikan akun memiliki hak akses DDL pada database target):

```bash
# 1. Masuk ke direktori backend repositori
cd /path/to/hts-chat-integration/backend

# 2. Jalankan migrasi deduplikasi & Unique Index wa_message_id
psql "$DATABASE_URL" -f prisma/migrations/20261003_add_unique_wa_message_id/migration.sql

# 3. Jalankan migrasi penambahan Compound Performance Indexes
psql "$DATABASE_URL" -f prisma/migrations/20261003_add_performance_compound_indexes/migration.sql
```

#### Metode B: Menggunakan Database GUI (DBeaver, pgAdmin, atau Navicat)
1. Buka aplikasi DBeaver atau pgAdmin, lalu hubungkan ke database PostgreSQL aplikasi.
2. Buka *SQL Editor* / *Query Tool*.
3. Salin dan jalankan seluruh instruksi SQL gabungan berikut:

```sql
-- ================================================================
-- TAHAP 1: DEDUPLIKASI DAN INDEKS UNIK WA_MESSAGE_ID (DATA-02)
-- ================================================================

-- Bersihkan data duplikat historis (mempertahankan baris dengan ID terendah)
DELETE FROM "Message"
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY wa_message_id ORDER BY id ASC) as row_num
    FROM "Message"
    WHERE wa_message_id IS NOT NULL AND wa_message_id != ''
  ) t
  WHERE t.row_num > 1
);

-- Terapkan indeks unik pada wa_message_id
CREATE UNIQUE INDEX IF NOT EXISTS "Message_wa_message_id_key" ON "Message"("wa_message_id");


-- ================================================================
-- TAHAP 2: OPTIMASI INDEKS GABUNGAN PERFORMA (DATA-04)
-- ================================================================

-- Indeks gabungan status tiket dan riwayat per pelanggan
CREATE INDEX IF NOT EXISTS "Ticket_customer_id_status_idx" ON "Ticket"("customer_id", "status");

-- Indeks gabungan filter antrean tiket aktif & sorting kronologis
CREATE INDEX IF NOT EXISTS "Ticket_status_is_aduan_created_at_idx" ON "Ticket"("status", "is_aduan", "created_at" DESC);

-- Indeks pencarian teks nama dan OPD pelanggan
CREATE INDEX IF NOT EXISTS "Customer_name_idx" ON "Customer"("name");
CREATE INDEX IF NOT EXISTS "Customer_skpd_name_idx" ON "Customer"("skpd_name");
```

#### Metode C: Verifikasi Hasil Migrasi
Untuk memastikan seluruh indeks telah terpasang dengan benar di PostgreSQL, jalankan kueri verifikasi:

```sql
SELECT indexname, tablename, indexdef 
FROM pg_indexes 
WHERE tablename IN ('Message', 'Ticket', 'Customer')
ORDER BY tablename, indexname;
```
*Hasil yang diharapkan: Terdapat `Message_wa_message_id_key` (UNIQUE), `Ticket_status_is_aduan_created_at_idx`, `Ticket_customer_id_status_idx`, `Customer_name_idx`, dan `Customer_skpd_name_idx`.*

---

### 5.2. Tutorial Penyelarasan Variabel Lingkungan (`.env`)

Sistem kini menerapkan *fail-fast secret validation* (`config/env.js`). Peladen akan otomatis menolak untuk menyala jika parameter kunci tidak terdefinisi.

#### Langkah 1: Buat Nilai Rahasia yang Aman (*Cryptographically Secure*)
Jalankan perintah Node.js berikut pada terminal untuk menghasilkan string acak aman untuk `JWT_SECRET` dan `WEBHOOK_SECRET`:

```bash
# Menghasilkan token acak 32-byte hexa
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Langkah 2: Konfigurasi Berkas `.env` Backend
Buka atau buat berkas `backend/.env`, lalu pastikan seluruh variabel berikut terisi:

```env
# Port aplikasi backend
PORT=3000

# URL Koneksi PostgreSQL
DATABASE_URL="postgresql://postgres:password_db_anda@localhost:5432/hts_chat_db?schema=public"

# Kunci Rahasia JWT (Wajib diisi, minimal 16 karakter acak)
JWT_SECRET="masukkan_string_acak_hasil_langkah_1_disini"

# Kredensial dan Endpoint Evolution API v2 (WhatsApp Engine)
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_TOKEN="token_api_evolution_anda"
EVOLUTION_INSTANCE_NAME="helpdesk-diskominfo"

# Shared Secret untuk Autentikasi Webhook Masuk (SEC-01)
# Nilai ini harus sama dengan header apikey yang dikonfigurasi pada Webhook Evolution API
WEBHOOK_SECRET="masukkan_string_acak_webhook_secret_disini"

# URL Asal Frontend (untuk pengamanan CORS Socket.io)
FRONTEND_URL="http://localhost:5173"
```

#### Langkah 3: Konfigurasi Webhook pada Evolution API
Pastikan pengaturan webhook pada dashboard Evolution API Anda menyertakan header keamanan berikut:
- **Webhook URL:** `http://IP_ATAU_DOMAIN_BACKEND:3000/api/webhook`
- **Headers:**
  - `apikey`: `<ISI_DENGAN_NILAI_WEBHOOK_SECRET>`
- **Events:** Centang `MESSAGES_UPSERT`.

---

### 5.3. Tutorial Pengujian Regresi Menyeluruh (End-to-End Testing)

Setelah backend dan basis data diperbarui, jalankan pengujian regresi berikut untuk memastikan seluruh sistem proteksi bekerja sesuai spesifikasi:

#### Uji 1: Validasi Proteksi Webhook Masuk (SEC-01)
Uji apakah peladen menolak request webhook tiruan yang tidak memiliki header otentikasi.

```bash
# Skenario A: Kirim request tanpa header apikey (Ekspektasi: HTTP 401 Unauthorized)
curl -i -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert"}'

# Skenario B: Kirim request dengan header apikey yang SALAH (Ekspektasi: HTTP 401 Unauthorized)
curl -i -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "apikey: token_palsu_123" \
  -d '{"event":"messages.upsert"}'

# Skenario C: Kirim request dengan header apikey yang BENAR (Ekspektasi: HTTP 200 OK)
curl -i -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "apikey: MASUKKAN_NILAI_WEBHOOK_SECRET" \
  -d '{"event":"messages.upsert","data":{}}'
```

#### Uji 2: Pengujian Anti-Race Lock & Deduplikasi Pesan (DATA-01 & DATA-02)
Jalankan pengujian konkurensi dengan mengirimkan dua payload webhook identik (`wa_message_id` sama) dalam milidetik yang sama.
- **Hasil yang Diharapkan:**
  - Pesan pertama diproses dengan sukses.
  - Pesan kedua dicegat oleh `perNumberLock` dan `prisma.message.create` menangkap kode `P2002` tanpa memunculkan crash/error pada log peladen.
  - Tidak terjadi duplikasi tiket ataupun pesan ganda di tabel `Message`.

#### Uji 3: Pengujian Handshake Autentikasi Socket.io (SEC-05)
Uji ketahanan peladen WebSocket terhadap akses tanpa izin menggunakan Node.js CLI:

```bash
# Pengujian Koneksi Socket Anonim (Ekspektasi: Error 'unauthorized')
node -e "
const io = require('socket.io-client');
const socket = io('http://localhost:3000', { autoConnect: true });
socket.on('connect_error', (err) => {
  console.log('✅ Uji Berhasil: Koneksi anonim ditolak ->', err.message);
  process.exit(0);
});
socket.on('connect', () => {
  console.error('❌ Gagal: Klien anonim berhasil terhubung tanpa token!');
  process.exit(1);
});
"
```

#### Uji 4: Pengujian State Machine & Pencegahan Double-Close (DATA-03)
1. Buka dashboard tiket helpdesk via browser.
2. Buka tiket dengan status `OPEN`.
3. Klik tombol **Tutup Tiket** dengan cepat secara berulang (*double-click*), atau simulasikan dua request POST bersamaan ke `/api/chat/tickets/:id/close`.
- **Hasil yang Diharapkan:**
  - Request pertama berhasil menutup tiket (HTTP 200 OK).
  - Request kedua langsung ditolak dengan pesan: `HTTP 409 Conflict: Tiket sudah dalam status CLOSED`.
  - Catatan internal penutupan tiket hanya dibuat satu kali.

#### Uji 5: Verifikasi Service Pembersihan Berkas Lampau (RES-03)
Nyalakan backend dengan perintah `npm run dev` atau `node src/index.js`.
Periksa log konsol startup untuk memverifikasi inisialisasi modul:
```text
[File Cleanup] Service diinisialisasi (Retensi: 90 hari, Interval cek: setiap 24 jam).
[HTS Keep-Alive] Background Heartbeat diinisialisasi (setiap 15 menit).
🚀 Server running on http://localhost:3000
```
Jika log di atas muncul, seluruh mekanisme pemeliharaan latar belakang telah berjalan optimal.

