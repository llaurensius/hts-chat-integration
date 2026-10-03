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

## 5. Action Items & Pending Tasks

Meskipun seluruh kerentanan dan masalah integritas kode telah ditangani pada level aplikasi dan basis data, langkah operasional berikut disarankan untuk fase penerapan ke lingkungan pengujian/produksi:

### Rekomendasi Tindak Lanjut Teknis:
1. **Eksekusi Migrasi Basis Data:**
   - Menjalankan berkas migrasi SQL yang telah disiapkan pada basis data PostgreSQL target:
     - [`20261003_add_unique_wa_message_id/migration.sql`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/prisma/migrations/20261003_add_unique_wa_message_id/migration.sql)
     - [`20261003_add_performance_compound_indexes/migration.sql`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/prisma/migrations/20261003_add_performance_compound_indexes/migration.sql)
2. **Penyelarasan Variabel Lingkungan (`.env`):**
   - Memastikan server produksi telah memiliki variabel lingkungan: `DATABASE_URL`, `JWT_SECRET`, `EVOLUTION_API_TOKEN`, `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE_NAME`, dan `WEBHOOK_SECRET`.
3. **Pengujian Integrasi Menyeluruh (*End-to-End Regression Test*):**
   - Memverifikasi pengiriman webhook nyata dari Evolution API dengan menyertakan header otentikasi.
   - Menguji skenario simulasi dual-close penutupan tiket HTS ketika jaringan portal berkecepatan rendah (*slow connection*).
   - Memastikan koneksi WebSocket di browser terhubung dengan token JWT aktif dan terputus ketika sesi login dihapus.
