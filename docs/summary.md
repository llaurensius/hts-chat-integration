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

Berdasarkan laporan audit teknis independen awal (*System Audit Report*), lingkup permasalahan teknis yang diidentifikasi terbagi ke dalam empat kategori utama:

### A. Keamanan & Otorisasi (*Security & Access Control*)
1. **SEC-01 (Kritis):** Endpoint webhook publik (`/api/webhook`) tidak memvalidasi otentisitas pengirim, sehingga rentan injeksi pesan tiruan (*spoofing*) dan eksploitasi Denial-of-Service melalui payload JSON berukuran masif.
2. **SEC-02 & AUTH-01 (Kritis):** Rute operasional tiket ([`routes/chat.js`](../backend/src/routes/chat.js)) hanya mengandalkan pengecekan token JWT tanpa penegakan RBAC di tingkat peladen. Agen Level 2 (L2) tanpa kategori dapat mengakses seluruh tiket, dan Level 1 (L1) dapat menyelesaikan tugas teknis L2 tanpa wewenang.
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
- **Implementasi Otentikasi Webhook ([`webhookAuth.js`](../backend/src/middlewares/webhookAuth.js)):**
  Membangun middleware verifikasi *shared secret token* (`WEBHOOK_SECRET`) melalui header HTTP `apikey` atau `x-api-key`. Memisahkan rute webhook pada [`routes/webhook.js`](../backend/src/routes/webhook.js) dengan parser JSON mandiri (maksimal 10MB) serta menerapkan *rate limiter* khusus (300 request/menit).
- **Penegakan RBAC Sisi Peladen ([`routes/chat.js`](../backend/src/routes/chat.js) & [`routes/report.js`](../backend/src/routes/report.js)):**
  Memasang middleware `requireRole` di setiap rute operasional. Di controller, agen L2 dengan `category_id = null` dibatasi secara ketat sehingga tidak dapat membaca antrean tiket non-spesifik. Menambahkan validasi kepemilikan tiket teknis pada `resolveTicket` dan `returnTicket`.
- **Validasi Variabel Lingkungan Fail-Fast ([`config/env.js`](../backend/src/config/env.js)):**
  Membuat modul inisialisasi yang mengevaluasi keberadaan `DATABASE_URL`, `JWT_SECRET`, dan `EVOLUTION_API_TOKEN` saat proses Node.js dinyalakan. Menghapus seluruh nilai default rahasia pada seluruh repositori.
- **Pencegahan Path Traversal ([`utils/safePath.js`](../backend/src/utils/safePath.js)):**
  Mengembangkan fungsi sanitasi kanonikal berbasis `path.resolve` yang membatasi resolusi berkas lampiran hanya di dalam subdirektori `/uploads`. Diterapkan pada `closeTicket`, `syncTicketToHts`, dan fungsi unggah lampiran di `htsClientService.js`.

### 3.2. Pelaksanaan Sprint 2 (Integritas Data & Rekonsiliasi State)
- **Mekanisme Antirace Kondisi Webhook ([`utils/perNumberLock.js`](../backend/src/utils/perNumberLock.js)):**
  Menerapkan struktur antrean Promise in-memory (`withLock(waNumber, task)`) pada [`webhookController.js`](../backend/src/controllers/webhookController.js). Seluruh pesan yang tiba bersamaan dari nomor telepon yang sama dieksekusi secara serial, menghilangkan pembuatan tiket dobel.
- **Deduplikasi Pesan Atomik ([`schema.prisma`](../backend/prisma/schema.prisma)):**
  Mengubah definisi `wa_message_id` menjadi `@unique`. Menulis skrip migrasi SQL pembersihan baris duplikat historis dan pembuatan indeks unik. Pada controller, dibuat blok penanganan kesalahan khusus untuk kode Prisma `P2002` guna menolak pesan ganda tanpa memicu *unhandled rejection*.
- **Pembersihan Logika Tiket Fantasi & Rekonsiliasi Status ([`htsClientService.js`](../backend/src/services/htsClientService.js) & [`chatController.js`](../backend/src/controllers/chatController.js)):**
  Menghapus pembuatan objek tiket palsu pada `lookupTicketByNumber` dan menggantinya dengan error 404 eksplisit. Pada fungsi penutupan tiket (`closeTicket` dan `solveTicketHtsSingle`), ditambahkan alur rekonsiliasi otomatis: jika pengiriman ke portal mengalami *timeout* namun peladen HTS sebenarnya telah menandai tiket sebagai `SOLVED`, sistem lokal mendeteksi status tersebut dan menyelesaikan tiket tanpa kegagalan.
- **Ketahanan Klien HTTP & Paralelisasi Blast ([`evolutionService.js`](../backend/src/services/evolutionService.js)):**
  Menetapkan `timeout: 10000` (10 detik) pada instance Axios Evolution API, serta timeout 15 detik pada pengunggahan dan pengunduhan media. Mengubah loop notifikasi L2 pada `assignTicket` menjadi operasi paralel menggunakan `Promise.allSettled` dengan batas waktu 5000 ms per target.
- **Pembersihan State Re-open & Guard State Machine ([`chatController.js`](../backend/src/controllers/chatController.js)):**
  Pada `reopenTicket`, sistem kini mereset status `TicketCategory` (`is_resolved: false`, `resolved_at: null`, `solution: null`) dalam satu transaksi atomik `prisma.$transaction`. Pada `closeTicket`, diterapkan *atomic conditional update* (`where: { id, status: { not: 'CLOSED' } }`) yang mengembalikan HTTP 409 Conflict bila terjadi eksekusi ganda.

### 3.3. Pelaksanaan Sprint 3 (Siklus Hidup Berkas, Soket Aman & Indeks DB)
- **Otentikasi Handshake Socket.io ([`index.js`](../backend/src/index.js) & [`App.jsx`](../frontend/src/App.jsx)):**
  Memasang middleware `io.use` yang memvalidasi JWT token dari `socket.handshake.auth.token`. Menolak klien anonim tanpa otentikasi. Mengisolasi soket ke dalam room terpisah (`user_{id}`, `role_{role}`, `category_{id}`). Di sisi frontend, soket dikonfigurasi menggunakan callback token dinamis dari `localStorage` serta otomatis melakukan *disconnect* saat logout dan *reconnect* saat login.
- **Pencegahan Benturan Berkas & Retensi Berkas ([`utils/imageStorage.js`](../backend/src/utils/imageStorage.js) & [`services/fileCleanupService.js`](../backend/src/services/fileCleanupService.js)):**
  Menambahkan sufiks 6 digit acak pada nama berkas Multer (`img_${Date.now()}_${randomSuffix}${ext}`). Membuat service terjadwal berkala yang menghapus berkas fisik pada direktori `/uploads` untuk tiket yang telah berstatus `CLOSED` lebih dari 90 hari.
- **Optimasi Indeks Skema Database ([`schema.prisma`](../backend/prisma/schema.prisma)):**
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

## 5. Action Items & Panduan Eksekusi Lengkap (Tutorial Linux / WSL)

Bagian ini merupakan panduan praktis operasional (*step-by-step tutorial*) bagi pengembang maupun tim infrastruktur untuk menerapkan pembaruan, mengeksekusi migrasi basis data PostgreSQL, menyelaraskan variabel lingkungan, serta menjalankan pengujian regresi (*end-to-end testing*) pada sistem operasi **Linux / Windows Subsystem for Linux (WSL)**.

---

### 5.1. Persiapan Lingkungan (*Environment Setup*)

Buka terminal terminal Linux atau WSL (Ubuntu/Debian) Anda, lalu masuk ke direktori kerja backend proyek:

```bash
# Jika menggunakan WSL dengan repositori di drive D:
cd /mnt/d/Kuliah/Repository/hts-chat-integration/backend

# Atau jika repositori berada di dalam filesystem Linux murni:
# cd ~/hts-chat-integration/backend

# Pastikan Node.js v18+ dan psql/docker telah terpasang
node -v
npm -v
```

---

### 5.2. Langkah 1: Eksekusi Migrasi Basis Data PostgreSQL

Terdapat dua berkas SQL migrasi idempotent di repositori:
1. `prisma/migrations/20261003_add_unique_wa_message_id/migration.sql` (Pembersihan duplikat historis & indeks `@unique` pada `wa_message_id`).
2. `prisma/migrations/20261003_add_performance_compound_indexes/migration.sql` (Penambahan indeks gabungan performa filter dan sorting).

Pilih salah satu metode eksekusi berikut sesuai dengan lingkungan database Anda:

#### Opsi A: Eksekusi Langsung via CLI `psql` (Database Lokal / Cloud / RDS)
Jika koneksi PostgreSQL Anda langsung dapat diakses dari terminal Linux/WSL:

```bash
# 1. Ekspor variabel dari file .env secara otomatis ke sesi bash
export $(grep -v '^#' .env | xargs)

# 2. Jalankan migrasi 1: Deduplikasi & Indeks Unik wa_message_id (DATA-02)
psql "$DATABASE_URL" -f prisma/migrations/20261003_add_unique_wa_message_id/migration.sql

# 3. Jalankan migrasi 2: Indeks Gabungan Performa (DATA-04)
psql "$DATABASE_URL" -f prisma/migrations/20261003_add_performance_compound_indexes/migration.sql
```

#### Opsi B: Eksekusi via Docker Container (Jika PostgreSQL Berjalan di Docker)
Jika service PostgreSQL Anda berjalan di dalam kontainer Docker:

```bash
# Cari nama container postgres Anda (misal: hts-postgres atau postgres-db)
docker ps

# Jalankan migrasi ke dalam kontainer
docker exec -i <NAMA_CONTAINER_POSTGRES> psql -U postgres -d hts_chat_db < prisma/migrations/20261003_add_unique_wa_message_id/migration.sql

docker exec -i <NAMA_CONTAINER_POSTGRES> psql -U postgres -d hts_chat_db < prisma/migrations/20261003_add_performance_compound_indexes/migration.sql
```

#### Opsi C: Verifikasi Keberadaan Indeks
Untuk memastikan indeks telah terpasang sempurna di PostgreSQL:

```bash
psql "$DATABASE_URL" -c "
SELECT indexname, tablename, indexdef 
FROM pg_indexes 
WHERE tablename IN ('Message', 'Ticket', 'Customer')
ORDER BY tablename, indexname;
"
```
*Hasil yang diharapkan memuat:*
- `Message_wa_message_id_key` (`CREATE UNIQUE INDEX ... ON "Message"("wa_message_id")`)
- `Ticket_status_is_aduan_created_at_idx`
- `Ticket_customer_id_status_idx`
- `Customer_name_idx`
- `Customer_skpd_name_idx`

---

### 5.3. Langkah 2: Konfigurasi Variabel Lingkungan (`.env`)

Sistem menerapkan validasi fail-fast (`config/env.js`). Peladen tidak akan menyala jika ada variabel wajib yang kosong.

#### 1. Generate Token Rahasia Kriptografis Aman via Terminal
Jalankan salah satu perintah bash berikut untuk membuat string acak 32-byte hexa:

```bash
# Menggunakan openssl bawaan Linux
openssl rand -hex 32

# Atau menggunakan Node.js crypto CLI
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 2. Sunting Berkas `.env` di Linux/WSL
Gunakan editor teks Linux (misalnya `nano .env`):

```bash
nano .env
```

Pastikan konfigurasi memuat parameter berikut:

```env
# Port aplikasi backend
PORT=3000

# URL Koneksi PostgreSQL
DATABASE_URL="postgresql://postgres:password_db_anda@localhost:5432/hts_chat_db?schema=public"

# Kunci Rahasia JWT (Wajib diisi string acak aman hasil generate)
JWT_SECRET="masukkan_string_acak_hasil_openssl_disini"

# Kredensial dan Endpoint Evolution API v2 (WhatsApp Engine)
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_TOKEN="token_api_evolution_anda"
EVOLUTION_INSTANCE_NAME="helpdesk-diskominfo"

# Shared Secret untuk Autentikasi Webhook Masuk (SEC-01)
# Header 'apikey' pada webhook Evolution API wajib menyertakan nilai ini
WEBHOOK_SECRET="masukkan_string_acak_webhook_secret_disini"

# URL Frontend (untuk kontrol CORS Socket.io)
FRONTEND_URL="http://localhost:5173"
```
*Simpan perubahan dengan `Ctrl + O`, `Enter`, lalu keluar dengan `Ctrl + X`.*

#### 3. Konfigurasi Webhook di Panel Evolution API
Pada antarmuka/API manajemen Evolution API, pastikan webhook dikonfigurasi:
- **URL Webhook:** `http://IP_PELADEN_BACKEND:3000/api/webhook`
- **Headers:** Tambahkan header `apikey` dengan nilai sama persis seperti `WEBHOOK_SECRET`.
- **Events Subscribed:** `MESSAGES_UPSERT`.

---

### 5.4. Langkah 3: Menjalankan Peladen Backend

Jalankan perintah berikut untuk menguji dan menjalankan backend di Linux/WSL:

```bash
# 1. Pastikan dependensi npm terpasang
npm install

# 2. Jalankan server (Mode Development)
npm run dev

# Atau jalankan langsung via Node
# node src/index.js

# Atau jalankan di background menggunakan PM2 (Rekomendasi Server Linux)
# pm2 start src/index.js --name "hts-backend"
# pm2 logs hts-backend
```

**Output Log Konsol Startup yang Diharapkan:**
```text
[File Cleanup] Service diinisialisasi (Retensi: 90 hari, Interval cek: setiap 24 jam).
[HTS Keep-Alive] Background Heartbeat diinisialisasi (setiap 15 menit).
🚀 Server running on http://localhost:3000
```

---

### 5.5. Langkah 4: Pengujian Regresi Menyeluruh via Linux Terminal (*End-to-End Testing*)

Gunakan perintah-perintah Linux CLI berikut untuk memvalidasi proteksi keamanan dan integritas transaksi:

#### Pengujian 1: Validasi Keamanan Webhook Masuk (SEC-01)
Buka tab terminal Linux baru dan jalankan simulasi request HTTP:

```bash
# Skenario A: Request tanpa header otentikasi (Harus DITOLAK -> HTTP 401 Unauthorized)
curl -i -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert"}'

# Skenario B: Request dengan token palsu/salah (Harus DITOLAK -> HTTP 401 Unauthorized)
curl -i -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "apikey: token_salah_12345" \
  -d '{"event":"messages.upsert"}'

# Skenario C: Request dengan WEBHOOK_SECRET yang benar (Harus DITERIMA -> HTTP 200 OK)
curl -i -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "apikey: MASUKKAN_NILAI_WEBHOOK_SECRET_ANDA" \
  -d '{"event":"messages.upsert","data":{}}'
```

#### Pengujian 2: Validasi Handshake Authentication Socket.io (SEC-05)
Uji apakah klien anonim tanpa token JWT ditolak oleh peladen WebSocket:

```bash
# Jalankan skrip evaluasi soket singkat di Linux terminal
node -e "
const { io } = require('socket.io-client');
console.log('Mencoba koneksi socket tanpa token JWT...');
const socket = io('http://localhost:3000', { autoConnect: true });

socket.on('connect_error', (err) => {
  console.log('✅ Uji Berhasil! Koneksi ditolak oleh server ->', err.message);
  process.exit(0);
});

socket.on('connect', () => {
  console.error('❌ Gagal Keamanan: Klien anonim berhasil terhubung tanpa autentikasi!');
  process.exit(1);
});
"
```
*Hasil yang diharapkan: Menampilkan `✅ Uji Berhasil! Koneksi ditolak oleh server -> unauthorized`.*

#### Pengujian 3: Validasi Anti-Race Lock Webhook (DATA-01 & DATA-02)
Kirimkan dua pesan simultan menggunakan bash background execution (`&`) untuk menyimulasikan burst lonjakan pesan WhatsApp:

```bash
PAYLOAD='{
  "event": "messages.upsert",
  "data": {
    "key": {
      "remoteJid": "628999888777@s.whatsapp.net",
      "fromMe": false,
      "id": "BURST_TEST_MSG_001"
    },
    "message": { "conversation": "Tes pesan burst konkurensi" },
    "messageTimestamp": 1759450000
  }
}'

# Kirim dua request secara paralel bersamaan
curl -s -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "apikey: MASUKKAN_NILAI_WEBHOOK_SECRET_ANDA" \
  -d "$PAYLOAD" & \
curl -s -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "apikey: MASUKKAN_NILAI_WEBHOOK_SECRET_ANDA" \
  -d "$PAYLOAD" &
wait
```
*Hasil yang diharapkan: Tidak ada server crash, hanya ada 1 record pesan yang tersimpan di basis data, dan tidak ada tiket ganda yang terbentuk.*

#### Pengujian 4: Validasi State Machine Anti-Double Close (DATA-03)
Simulasikan penutupan tiket ganda ke endpoint `/api/chat/tickets/:id/close`:
- Request pertama berhasil (HTTP 200).
- Request kedua yang datang dalam waktu berdekatan langsung ditolak oleh guard status dengan respons: `HTTP 409 Conflict: {"error":"Tiket sudah dalam status CLOSED"}`.

---

## 6. Changelog Komprehensif Evolusi Sistem (V1.0 s.d. V4.2.1)

| Versi Rilis | Tanggal Rilis | Sorotan Perubahan Utama & Capaian Fitur |
|---|:---:|---|
| **V1.0** | September 2026 | Inisialisasi arsitektur dasar: Webhook inbound WhatsApp via Baileys, pembalasan chat keluar, integrasi WebSocket dasar, pelabelan kategori, dan rekapitulasi awal. |
| **V2.0** | September 2026 | Otentikasi JWT dan perutean Role-Based Access Control (RBAC), dukungan pengiriman gambar dua arah, UI adaptif dispatcher vs teknisi, dan siklus tiket `RESOLVED`. |
| **V2.1 / V2.2** | September 2026 | Pembagian 3 pilar tim L2 (`Network`, `Server`, `M&E`), penugasan Smart Multi-Assign, penyelesaian mandiri per-tim (`is_resolved`), pelepasan tugas mandiri (*self-unassign*), klasifikasi jenis layanan (*Service Type*), sakelar bot auto-reply dinamis, dan buku kontak WhatsApp blast. |
| **V3.0** | September 2026 | Integrasi portal resmi HTS Diskominfo Jawa Tengah: reverse-engineering sesi cookie PHP `ci_session`, bypass CAPTCHA numerik live, pipeline aduan 3 tahap, sinkronisasi PIC resmi, dan dual-close tiket. |
| **V4.0** | Oktober 2026 | Arsitektur One-to-Many Multi-HTS (1 chat banyak nomor tiket resmi), klasifikasi Percakapan Biasa (`GENERAL_CHAT`) vs Aduan Teknis Resmi (`is_aduan`), catatan internal multimedia dua arah (L1 $\leftrightarrow$ L2), perombakan UI 3 kolom, Balasan Cepat (*Quick Replies*), dan disaster recovery penautan manual nomor aduan. |
| **V4.1** | 02 Oktober 2026 | Manajemen Master Data Kontak (impor file Excel, CSV, dan vCard VCF), Start New Chat (outbound) dengan direktori kontak berpangkal paginasi, re-open tiket selesai, unlink nomor HTS, sinkronisasi balasan langsung dari ponsel helpdesk (`fromMe=true`), dan dukungan WhatsApp LID addressing. |
| **V4.2** | 03 Oktober 2026 | **Hardening Keamanan & Kestabilan Sistem (Sprint 1–3):** Otentikasi Webhook Shared Secret (`webhookAuth`), penegakan RBAC mutlak sisi peladen (`requireRole`), validasi fail-fast variabel lingkungan (`config/env.js`), pencegahan *Path Traversal* (`safePath.js`), proteksi race condition antrean in-memory (`perNumberLock.js`), constraint basis data unik `@unique wa_message_id`, otentikasi handshake WebSocket (`io.use`) disertai partisi *rooms*, background worker retensi berkas media otomatis (90 hari), dan indeks komposit basis data performa tinggi. |
| **V4.2.1** | 03 Oktober 2026 | **Full-Stack SPA Integration & UX Resilience:** Integrasi komprehensif Frontend React 18 + Vite 5 (workspace 5-tab, tata letak 3-kolom reaktif, slash command `/` autocomplete balasan cepat, audio chime Web Audio API D5-A5, dan HTML5 desktop push). Remediasi permanen isu balapan event soket pada alur Auto-Open HTS pasca penugasan L2 (`ticket_updated`), serta konsolidasi living documentation 7 dokumen standar enterprise. |

---

## 7. Langkah Operasional Berikutnya & Roadmap Produksi

1. **Eksekusi Pengujian Lapangan Bersama (User Acceptance Testing - UAT):**
   - Melakukan simulasi impor berkas riil master data kontak OPD Jawa Tengah (`docs/contacts.csv` dan `docs/contacts.vcf`).
   - Menguji pengiriman pesan outbound *Start New Chat* ke nomor penguji eksternal.
   - Menguji alur aktivasi kembali tiket (*Re-Open Ticket*) pada tiket selesai.
2. **Standardisasi Kredensial Produksi (Pre-Launch Checklist):**
   - Mengganti seluruh kata sandi akun benih default (`password123`) pada tabel `User` dengan kata sandi acak yang kuat.
   - Memastikan `JWT_SECRET` dan `WEBHOOK_SECRET` pada file `.env` peladen produksi di-generate menggunakan `openssl rand -hex 32`.
3. **Penyelarasan Domain & Sertifikat SSL:**
   - Memastikan domain resmi Diskominfo (misal: `helpdesk.diskominfo.jatengprov.go.id`) terhubung ke VPS dan dilindungi sertifikat SSL Let's Encrypt melalui Certbot Nginx.
4. **Pemantauan Kapasitas Storage & Log:**
   - Memverifikasi eksekusi pertama background worker `fileCleanupService` setelah peladen menyala lebih dari 24 jam.
   - Mengaktifkan modul rotasi log `pm2-logrotate` untuk mencegah penumpukan file log peladen di VPS.

---

## 8. Milestone 8: Harmonisasi Living Documentation & Konsolidasi Full-Stack (Oktober 2026)

### 8.1 Latar Belakang & Ruang Lingkup
Mengikuti integrasi komponen antarmuka pengguna berbasis React 18 dan Vite 5 pada direktori [`frontend/`](../frontend), dilakukan audit menyeluruh dan peremajaan dokumentasi hidup (*living documentation*) pada direktori [`docs/`](./). Pekerjaan ini memastikan keselarasan 100% antara implementasi riil kode sumber (*Single Source of Truth*) dengan spesifikasi arsitektur, panduan deployment, dan modul pengujian mutu.

### 8.2 Perbaikan Bug Kunci: Resilient Auto-Open HTS Workflow
- **Masalah:** Tombol *"Terbitkan ke Portal HTS"* pada drawer formulir HTS tidak merespons jika dibuka otomatis melalui penugasan L2 dengan opsi `autoOpenHts = true`.
- **Akar Masalah (RCA):** Controller backend [`chatController.js`](../backend/src/controllers/chatController.js) memancarkan event Socket.io `ticket_closed` saat tiket di-assign ke L2, padahal status tiket tetap `OPEN`. Akibatnya, listener frontend [`handleTicketClosed`](../frontend/src/App.jsx) mengosongkan state `activeTicket = null`, sehingga saat drawer terbuka, tombol kehilangan objek tiket aktif.
- **Solusi Final:** Backend diubah untuk memancarkan event `ticket_updated`. State `activeTicket` di frontend dipertahankan utuh, sehingga drawer formulir HTS dapat mengirimkan tiket ke portal HTS tanpa kendala balapan data (*race condition*). Skenario ini kini telah dibakukan pada Modul Pengujian TC-10.6 di [`QA_and_Quality.md`](./QA_and_Quality.md).

### 8.3 Konsolidasi Dokumentasi (Clean Enterprise Architecture)
Sesuai kesepakatan dan arahan arsitektur, 6 berkas laporan audit dan RFC rancangan historis berikut telah **dilebur intinya secara komprehensif** ke dalam 7 dokumen hidup utama:
1. `System_Audit_Report.md` & `Bug_Audit_and_Fix_Recommendations.md` $\rightarrow$ Diserap ke dalam [`Architecture.md`](./Architecture.md) Bab 5 dan [`QA_and_Quality.md`](./QA_and_Quality.md) Bab 5 (Audit Remediasi Kerentanan Sprint 1–3).
2. `Technical_Design_HTS_Integration_Refactoring.md` & `Technical_Design_Multi_HTS_Independent_Resolution.md` $\rightarrow$ Diserap ke dalam [`Architecture.md`](./Architecture.md) Bab 4.3 dan [`Features_and_Capabilities.md`](./Features_and_Capabilities.md) Bab 4–5 (Arsitektur One-to-Many Multi-HTS).
3. `Technical_Specification_Fixes_V4.2.md` $\rightarrow$ Diserap ke dalam [`QA_and_Quality.md`](./QA_and_Quality.md) dan [`summary.md`](./summary.md).
4. `Report_and_Fix_Plan_Assign_AutoOpen_HTS.md` $\rightarrow$ Diserap ke dalam [`Architecture.md`](./Architecture.md) Bab 4.2 dan [`QA_and_Quality.md`](./QA_and_Quality.md) TC-10.6.

Fisik ke-6 file tersebut telah dihapus secara bersih dari root folder `docs/`, menyisakan struktur dokumentasi hidup yang ramping, elegan, dan profesional berstandar enterprise:
* [`docs/Project_Overview.md`](./Project_Overview.md)
* [`docs/Architecture.md`](./Architecture.md)
* [`docs/Features_and_Capabilities.md`](./Features_and_Capabilities.md)
* [`docs/Database_and_API.md`](./Database_and_API.md)
* [`docs/Operations_and_Deployment.md`](./Operations_and_Deployment.md)
* [`docs/QA_and_Quality.md`](./QA_and_Quality.md)
* [`docs/summary.md`](./summary.md)
* *(Serta fixture data pengujian:* [`docs/contacts.csv`](./contacts.csv) *dan* [`docs/contacts.vcf`](./contacts.vcf)*)*

---

## 9. Milestone 9: Audit Kualitas Full-Stack & Peremajaan Dokumentasi Hidup (Oktober 2026)

### 9.1 Latar Belakang & Ruang Lingkup
Melakukan inspeksi mendalam terhadap seluruh pilar aplikasi (`frontend/`, `backend/`, `docker/`, dan `docs/`) untuk menyelaraskan dokumentasi teknis dengan implementasi aktual kode sumber:
- **Frontend SPA (`frontend/`):** Dokumentasi komprehensif komponen React 18, toolchain Vite 5, arsitektur workspace 5-tab, tata letak 3-kolom, matriks 11 sub-komponen modal dialog, integrasi keyboard navigasi slash commands (`/`), sintesis nada dering audio native Web Audio API (D5 $\rightarrow$ A5), serta notifikasi latar belakang HTML5 Desktop Notification API.
- **Backend API (`backend/`):** Sinkronisasi rute operasional terbaru (`start-new-chat`, `contacts/search` berpaginasi, impor dan penghapusan bersih master kontak, `link-hts` disaster recovery, `unlink-hts`, `complete-pic`, `reopen`, `settings/autoreply`).
- **Deployment & Nginx:** Standarisasi panduan build statis Vite (`frontend/dist/`), konfigurasi virtual host Nginx reverse proxy tingkat produksi (caching immutable 1 tahun untuk `/assets/`, `client_max_body_size 50M;`, WebSocket proxy timeout 86400s, SPA fall-through `try_files`), serta manajemen process manager PM2.
- **Sanitasi Path Dokumentasi:** Pembersihan 100% tautan absolut Windows lokal (`file:///d:/Kuliah/...`) menjadi tautan Markdown relatif yang bersih, portabel, dan siap publikasi Git.

### 9.2 Status Kesiapan Sistem (Production-Ready)
Seluruh modul dinyatakan beroperasi dengan stabilitas tinggi, lulus verifikasi integrasi basis data, dan memiliki dokumentasi yang selaras dengan kenyataan kode sumber (*Single Source of Truth*).

***

Laporan eksekutif ini mencerminkan status operasional aktual dan siap dijadikan standar acuan tata kelola teknis sistem HTS Chat Integration.

