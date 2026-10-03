# Laporan Audit Kode & Rekomendasi Perbaikan: hts-chat-integration

Dokumen ini disusun oleh **Senior Security & Code Auditor** serta **Principal Software Engineer** sebagai hasil inspeksi mendalam (*deep code audit*) terhadap seluruh arsitektur, kode sumber backend, skrip otomasi, konfigurasi orkestrasi kontainer, serta integrasi eksternal pada repositori `hts-chat-integration`.

---

## 1. Ringkasan Eksekutif

### 1.1 Gambaran Umum Kualitas dan Kestabilan Kode
Secara umum, arsitektur aplikasi `hts-chat-integration` telah mengimplementasikan pola integrasi multi-layanan yang fungsional antara Express.js, Prisma ORM, PostgreSQL, Socket.IO, WhatsApp Webhook (Evolution API), dan portal tiket eksternal Diskomdigi Provinsi Jawa Tengah (HTS). Fitur-fitur utama seperti pemisahan peran (RBAC L1, L2, Admin, SPV), lock serialisasi per-nomor (`perNumberLock`), sanitasi path lampiran (`safePath`), dan deduplikasi pesan telah dirintis dengan baik.

Namun demikian, hasil audit mendalam mengungkap **kelemahan struktural dan edge case kritis** yang dapat memicu degradasi layanan di lingkungan produksi:
1. **Kebocoran Memori (Memory Leak):** Terdapat kesalahan logika fundamental pada implementasi promise chaining di dalam modul mutex in-memory (`perNumberLock`), yang menyebabkan *key* Map nomor telepon WhatsApp tidak pernah dihapus dan terus menumpuk di memori proses Node.js.
2. **Celah Keamanan & Validasi Input (Security Vulnerabilities):** Konfigurasi CORS pada Socket.IO mengembalikan nilai `true` untuk semua origin (*permissive fallback*), Express CORS bersifat *wildcard*, endpoints otentikasi belum memiliki *brute-force rate limiter*, file upload pada master data belum dibatasi memorinya (*heap exhaustion DoS*), URL notifikasi WhatsApp rentan terhadap *Host Header Injection*, dan cookie sesi portal pemerintah disimpan dalam bentuk plaintext di database.
3. **Konkurensi & Integritas Data (Race Conditions & Data Integrity):** Mekanisme *fallback* saat pembuatan tiket baru pada webhook berpotensi menyuntikkan `null` ke relasi non-nullable database; deduplikasi *auto-reply* bot mengalami *double echo* yang tersimpan sebagai pesan agen palsu; dan fitur *reopen ticket* tidak memeriksa tiket aktif eksisting, sehingga berpotensi memecah riwayat percakapan menjadi beberapa tiket terbuka secara bersamaan.
4. **I/O Tersinkronisasi yang Memblokir Event Loop (Synchronous Blocking I/O):** Penggunaan fungsi `fs.writeFileSync`, `fs.readFileSync`, dan `fs.unlinkSync` secara berulang pada alur pemrosesan media webhook dan lampiran dapat membekukan *single thread* Node.js, mengakibatkan penumpukan latensi dan *timeout* request HTTP/WebSocket.
5. **Ketidakselarasan Lingkungan & Konfigurasi (Environment & Deployment Discrepancies):** Terjadi diskrepansi signifikan antara `docker-compose.yml` (port 5433, user `helpdesk_user`) dan `.env.example` (port 5432, user `postgres`), ketiadaan variabel wajib `JWT_SECRET` pada `.env.example` yang memicu *fail-fast crash* seketika, serta *hardcoded IP* Docker internal yang gagal berfungsi di lingkungan Windows/macOS.

### 1.2 Tabel Rekapitulasi Temuan Berdasarkan Tingkat Keparahan

| Tingkat Keparahan (Severity) | Jumlah Temuan | Area Terdampak Utama |
|---|---|---|
| **Critical** | 6 | Concurrency Mutex Lock, Socket.IO CORS, Deployment Env Vars, Docker Port Binding, File Upload Buffer DoS, Webhook Message Drop |
| **High** | 7 | Auto-Reply Deduplication, DB Foreign Key Cascades, Ticket Reopen State, HTS Unlink Data Loss, Host Header Injection, Plaintext Session Secrets, Centralized Error Handling |
| **Medium** | 9 | Blocking Sync File I/O, WhatsApp Media Silent Failure, Phone Number Regex Normalization, Hardcoded Docker Webhook IP, Unbounded Reporting Query, DB Dangling Attachments, Auth Brute-Force Rate Limiter, Heartbeat Concurrency Drift, JSON Parsing Crash |
| **Low / Code Smell** | 4 | Axios Timeout Config, Hardcoded Fallback User ID, Setting RBAC Inconsistency, Hardcoded Seed Passwords |
| **Total Temuan** | **26** | **Seluruh Sub-Sistem Backend, Database, dan Skrip Operasional** |

---

## 2. Rincian Temuan & Solusi Perbaikan

Berikut adalah rincian kartu temuan audit teknis yang diurutkan mulai dari tingkat keparahan paling kritis (*Critical*) hingga *Low / Code Smell*.

---

### [BUG-001] In-Memory Mutex Lock Key Leak (Unbounded Memory Leak pada withLock)
- **Lokasi File:** `backend/src/utils/perNumberLock.js` (L16-L26)
- **Severity:** Critical
- **Kategori:** Resource Leak / Stabilitas
- **Deskripsi Masalah:** Pada fungsi `withLock`, baris 19 mendaftarkan promise baru ke dalam Map melalui `chains.set(key, run.catch(() => {}))`. Pemanggilan `.catch()` menghasilkan **instance Promise baru** yang berbeda referensi memori dari variabel `run`. Pada baris 20, blok `run.finally()` mengecek kondisi `if (chains.get(key) === run)`. Karena `chains.get(key)` berisi objek promise hasil `.catch()`, perbandingan identitas objek (`===`) **selalu bernilai false**. Akibatnya, `chains.delete(key)` tidak pernah dieksekusi seumur hidup aplikasi.
- **Skenario Pemicu:** Setiap kali ada pesan WhatsApp masuk dari nomor unik baru atau nomor yang sama setelah jeda lama, sebuah *entry* permanen ditambahkan ke `Map`.
- **Dampak:** Memori heap Node.js mengalami kebocoran (*unbounded memory leak*). Pada server produksi yang menangani ribuan nomor kontak warga, memori akan terus merangkak naik hingga memicu Node.js *Out-Of-Memory (OOM) crash*.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/utils/perNumberLock.js
+++ b/backend/src/utils/perNumberLock.js
@@ -16,11 +16,12 @@
 const withLock = (key, fn) => {
   const prev = chains.get(key) || Promise.resolve();
   const run = prev.then(fn, fn);
-  chains.set(key, run.catch(() => {}));
-  run.finally(() => {
-    if (chains.get(key) === run) {
+  const cleanupPromise = run.catch(() => {});
+  chains.set(key, cleanupPromise);
+  cleanupPromise.finally(() => {
+    if (chains.get(key) === cleanupPromise) {
       chains.delete(key);
     }
   });
   return run;
 };
```

---

### [BUG-002] Permissive Socket.IO CORS & Wildcard Express CORS Exposing Real-Time Chat
- **Lokasi File:** `backend/src/index.js` (L18-L28, L53)
- **Severity:** Critical
- **Kategori:** Keamanan
- **Deskripsi Masalah:** Logika callback CORS Socket.IO pada baris 19-24 memiliki celah fatal: jika origin tidak lolos pengecekan pertama, baris 23 secara sepihak memanggil `return callback(null, true);`. Hal ini membuat validasi origin sama sekali tidak berguna dan mengizinkan koneksi WebSocket dari domain mana pun di internet. Selain itu, pengecekan `origin.includes('localhost')` rentan dibobol menggunakan domain penyerang seperti `http://attacker-localhost.com`. Sementara itu, rute Express menggunakan `app.use(cors())` tanpa argumen (*wildcard open* `*`).
- **Skenario Pemicu:** Penyerang membuat situs web phishing/malicious, menyisipkan skrip `socket.io-client`, dan memanfaatkan token JWT yang dicuri dari browser korban (atau koneksi cross-origin) untuk mendengarkan broadcast event internal seperti `new_message`, data identitas pelapor, dan catatan internal tiket.
- **Dampak:** Pelanggaran kerahasiaan data percakapan aduan masyarakat dan kebocoran identitas pelapor ke pihak ketiga di luar domain resmi Helpdesk.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/index.js
+++ b/backend/src/index.js
@@ -14,24 +14,35 @@
 const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';
+const ALLOWED_ORIGINS = [
+  FRONTEND_ORIGIN,
+  'http://localhost:5173',
+  'http://127.0.0.1:5173'
+].filter(Boolean);
 
 const io = new Server(server, {
   cors: {
     origin: (origin, callback) => {
-      if (!origin || origin === FRONTEND_ORIGIN || origin.includes('localhost') || origin.includes('127.0.0.1')) {
+      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
         return callback(null, true);
       }
-      return callback(null, true);
+      return callback(new Error('Origin tidak diizinkan oleh CORS policy Socket.IO'), false);
     },
     methods: ['GET', 'POST', 'PUT', 'DELETE'],
     credentials: true
   },
 });
 
-app.use(cors());
+app.use(cors({
+  origin: (origin, callback) => {
+    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
+      return callback(null, true);
+    }
+    return callback(new Error('Origin tidak diizinkan oleh CORS policy REST API'), false);
+  },
+  credentials: true
+}));
```

---

### [BUG-003] Ketiadaan Variabel Wajib JWT_SECRET pada .env.example Membakar Fail-Fast Crash
- **Lokasi File:** `backend/.env.example` (L1-L7) vs `backend/src/config/env.js` (L3-L19)
- **Severity:** Critical
- **Kategori:** Integrasi / Stabilitas
- **Deskripsi Masalah:** Pada `backend/src/config/env.js`, modul memberlakukan aturan fail-fast `SEC-03` di mana jika salah satu dari `DATABASE_URL`, `JWT_SECRET`, atau `EVOLUTION_API_TOKEN` kosong/tidak ada, aplikasi langsung memanggil `process.exit(1)`. Namun, pada berkas template `backend/.env.example`, variabel `JWT_SECRET` **sama sekali tidak dicantumkan**.
- **Skenario Pemicu:** DevOps engineer atau developer baru melakukan *clone* repositori, menyalin `cp .env.example .env`, lalu menjalankan `npm start` atau `docker compose up`.
- **Dampak:** Backend gagal menyala secara instan (*instant boot failure*), menghambat proses *continuous deployment* dan membingungkan tim operasional.
- **Rekomendasi Solusi:**
```diff
--- a/backend/.env.example
+++ b/backend/.env.example
@@ -1,7 +1,14 @@
 PORT=3000
-DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hts_chat_integration?schema=public"
+DATABASE_URL="postgresql://helpdesk_user:SecretPassword123!@localhost:5433/wa_helpdesk?schema=public"
+
+# Keamanan JWT (Ganti dengan string rahasia 32+ karakter acak)
+JWT_SECRET="GantiDenganKunciRahasiaJWTYangKuatDanUnik123!"
 
 # Evolution API
 EVOLUTION_API_URL="http://localhost:8080"
 EVOLUTION_API_TOKEN="SecureTokenUntukBackend123"
+EVOLUTION_INSTANCE_NAME="helpdesk-wa"
+WEBHOOK_SECRET="SecureTokenUntukBackend123"
+
+# Frontend Origin untuk CORS
+FRONTEND_URL="http://localhost:5173"
```

---

### [BUG-004] Diskrepansi Port & Kredensial Database antara docker-compose.yml dan .env.example
- **Lokasi File:** `backend/.env.example` (L2) vs `docker/docker-compose.yml` (L6-L11)
- **Severity:** Critical
- **Kategori:** Integrasi / Stabilitas
- **Deskripsi Masalah:** Di dalam berkas `docker/docker-compose.yml`, container PostgreSQL diekspos ke host pada port **`5433:5432`**, dengan kredensial user `helpdesk_user`, password `SecretPassword123!`, dan database `wa_helpdesk`. Sebaliknya, `.env.example` menyetel string koneksi ke port **`5432`** dengan user `postgres` dan database `hts_chat_integration`.
- **Skenario Pemicu:** Menjalankan `docker compose up` di folder `docker`, lalu menjalankan migrasi backend `npx prisma migrate dev` dari komputer lokal atau container lain yang mengacu pada `.env.example`.
- **Dampak:** Prisma gagal terhubung ke database (`P1001: Can't reach database server at localhost:5432`). Aplikasi tidak dapat dijalankan sama sekali pada lingkungan instalasi baru.
- **Rekomendasi Solusi:**
  - Sesuaikan nilai default `DATABASE_URL` di `backend/.env.example` agar langsung mengarah ke `postgresql://helpdesk_user:SecretPassword123!@localhost:5433/wa_helpdesk?schema=public` (seperti yang ditunjukkan pada perbaikan [BUG-003]).

---

### [BUG-005] Uncontrolled Multer memoryStorage Memicu Fatal Node.js Heap Out-Of-Memory (OOM) Crash
- **Lokasi File:** `backend/src/routes/admin.js` (L15-L16) & `backend/src/controllers/adminController.js` (L317-L336)
- **Severity:** Critical
- **Kategori:** Resource Leak / Keamanan (Denial of Service)
- **Deskripsi Masalah:** Pada rute impor master data kontak (`POST /api/admin/contacts/import`), berkas diunggah menggunakan `multer({ storage: multer.memoryStorage() })` **tanpa batasan ukuran file (`limits.fileSize`)** dan **tanpa validasi ekstensi/tipe MIME**. File yang diunggah disimpan seutuhnya ke dalam RAM sebagai Node.js `Buffer`. Jika pengguna mengunggah file 200MB - 1GB (atau file zip bomb berkedok csv), V8 heap memory akan langsung habis.
- **Skenario Pemicu:** Administrator secara tidak sengaja atau aktor jahat yang menguasai akun Admin mengunggah berkas CSV/Excel berukuran ratusan megabyte.
- **Dampak:** Proses backend mati mendadak (*crashes with JavaScript heap out of memory*), seluruh koneksi aktif terputus, dan layanan helpdesk lumpuh total (*Denial of Service*).
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/routes/admin.js
+++ b/backend/src/routes/admin.js
@@ -15,2 +15,14 @@ const multer = require('multer');
-const uploadDoc = multer({ storage: multer.memoryStorage() });
+const uploadDoc = multer({
+  storage: multer.memoryStorage(),
+  limits: { fileSize: 15 * 1024 * 1024 }, // Maksimal 15MB
+  fileFilter: (req, file, cb) => {
+    const allowedExts = ['.xlsx', '.xls', '.csv', '.vcf', '.vcard'];
+    const ext = require('path').extname(file.originalname).toLowerCase();
+    if (allowedExts.includes(ext)) {
+      cb(null, true);
+    } else {
+      cb(new Error('Format berkas tidak didukung. Unggah berkas Excel (.xlsx/.xls), CSV, atau VCF.'));
+    }
+  }
+});
```

---

### [BUG-006] Fallback Ticket Race Condition pada Webhook Menyebabkan Foreign Key Crash & Kehilangan Pesan
- **Lokasi File:** `backend/src/controllers/webhookController.js` (L167-L207, L231-L246)
- **Severity:** Critical
- **Kategori:** Logika Bisnis / Stabilitas
- **Deskripsi Masalah:** Ketika pelanggan baru mengirim pesan, sistem mencoba menjalankan `prisma.ticket.create`. Jika terjadi bentrok konkurensi (misal dua pesan tiba bersamaan) atau transient DB glitch sehingga masuk ke blok `catch (raceErr)`, sistem menjalankan pencarian fallback: `fallbackTicket = await prisma.ticket.findFirst(...)`. Jika `fallbackTicket` ternyata tidak ditemukan atau bernilai `null`, variabel `ticketId` diset menjadi `null`. Kode kemudian berlanjut ke baris 231 untuk membuat pesan: `await prisma.message.create({ data: { ticket_id: ticketId, ... } })`. Karena kolom `ticket_id` di tabel `Message` bersifat `NOT NULL`, Prisma melempar error validasi fatal dan seluruh pemrosesan webhook terhenti.
- **Skenario Pemicu:** Lonjakan pesan masuk bersamaan dari nomor baru saat kondisi database mengalami beban tinggi.
- **Dampak:** Pesan masuk dari masyarakat gagal tersimpan ke database secara permanen (*silent message loss*), dan agen helpdesk tidak pernah mengetahui adanya pesan tersebut.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/controllers/webhookController.js
+++ b/backend/src/controllers/webhookController.js
@@ -204,3 +204,8 @@ const handleIncomingMessage = async (req, res) => {
         ticketId = fallbackTicket ? fallbackTicket.id : null;
+        if (!ticketId) {
+          console.error(`[Webhook] Fatal: Gagal membuat dan mengambil fallback tiket untuk customer ${customer.id}`);
+          return; // Hentikan alur agar tidak mencoba insert Message dengan ticket_id null
+        }
       }
     } else {
```

---

### [BUG-007] Double Echo Auto-Reply Bot Tersimpan Sebagai Pesan Duplikat Agen
- **Lokasi File:** `backend/src/controllers/webhookController.js` (L186-L193, L212-L225)
- **Severity:** High
- **Kategori:** Logika Bisnis
- **Deskripsi Masalah:** Saat mengirimkan balasan otomatis bot (*Auto-Reply*), `webhookController` menyimpan pesan ke tabel `Message` dengan `sender_type: 'BOT'`, namun **tidak menyimpan `wa_message_id`** hasil respons dari Evolution API. Beberapa milidetik kemudian, Evolution API mengirimkan kembali webhook event `messages.upsert` dengan flag `fromMe: true` (mirroring pesan keluar). Pengecekan deduplikasi awal (L40-L47) gagal karena ID pesan di DB bernilai `null`. Lalu pengecekan duplikasi cadangan di baris 215 secara spesifik menyaring `sender_type: 'AGENT'`. Akibatnya, pesan bot tadi tidak terdeteksi sebagai duplikat, dan baris 228 mengevaluasi `senderType = fromMe ? 'AGENT' : 'CUSTOMER'`, lalu menyimpan kembali pesan bot tersebut sebagai pesan dari **AGENT**.
- **Skenario Pemicu:** Setiap kali pelanggan mengirimkan pesan pembuka baru dan bot membalas otomatis.
- **Dampak:** Pada tampilan chat dashboard dan database, pesan auto-reply muncul dua kali secara berturut-turut: pertama sebagai `BOT`, kedua sebagai `AGENT (Helpdesk HP)`. Hal ini mengacaukan riwayat percakapan dan perhitungan metrik respon awal (FRT).
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/controllers/webhookController.js
+++ b/backend/src/controllers/webhookController.js
@@ -186,8 +186,9 @@ const handleIncomingMessage = async (req, res) => {
             try {
-              await evolutionService.sendText(waNumber, autoReplyText);
+              const botSendRes = await evolutionService.sendText(waNumber, autoReplyText);
               await prisma.message.create({
                 data: {
                   ticket_id: ticketId,
                   sender_type: 'BOT',
-                  message_text: autoReplyText
+                  message_text: autoReplyText,
+                  wa_message_id: botSendRes?.key?.id || null
                 }
               });
@@ -216,3 +217,3 @@ const handleIncomingMessage = async (req, res) => {
         where: {
           ticket_id: ticketId,
-          sender_type: 'AGENT',
+          sender_type: { in: ['AGENT', 'BOT'] },
           message_text: conversation,
```

---

### [BUG-008] Unchecked Foreign Key Deletion pada clearAllCustomerContacts Memicu Error 500
- **Lokasi File:** `backend/src/controllers/adminController.js` (L250-L274)
- **Severity:** High
- **Kategori:** Stabilitas / Integritas Data
- **Deskripsi Masalah:** Pada fungsi `clearAllCustomerContacts`, sistem memeriksa tiket aktif (`OPEN`, `RESOLVED`). Jika `activeTicketsCount === 0`, sistem mengizinkan penghapusan tanpa parameter `force: true`. Namun, jika di database masih tersimpan tiket lama berstatus **`CLOSED`**, eksekusi `await tx.customer.deleteMany()` akan gagal karena tabel `Ticket` memiliki relasi foreign key `customer_id` ke tabel `Customer` tanpa opsi `onDelete: Cascade` pada skema Prisma.
- **Skenario Pemicu:** Administrator menekan tombol "Hapus Semua Kontak" ketika semua tiket telah berstatus CLOSED (tidak ada yang aktif), tanpa mencentang opsi Hapus Paksa.
- **Dampak:** PostgreSQL menolak kueri dengan error `23503: foreign_key_violation ("Ticket_customer_id_fkey")`, server mengembalikan status 500, dan aksi gagal total.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/controllers/adminController.js
+++ b/backend/src/controllers/adminController.js
@@ -253,6 +253,14 @@ const clearAllCustomerContacts = async (req, res) => {
     });
+    const totalTicketsCount = await prisma.ticket.count();
 
-    if (activeTicketsCount > 0 && !req.body.force) {
+    if (totalTicketsCount > 0 && !req.body.force) {
       return res.status(400).json({
         requires_force: true,
-        error: `Terdapat ${activeTicketsCount} tiket yang masih aktif (OPEN / RESOLVED). Selesaikan atau hapus tiket terlebih dahulu, atau gunakan opsi hapus paksa.`
+        error: `Terdapat ${totalTicketsCount} data riwayat tiket (${activeTicketsCount} aktif). Anda harus menggunakan opsi Hapus Paksa (Force Delete) untuk membersihkan seluruh data pelanggan beserta tiket terkait.`
       });
     }
```

---

### [BUG-009] Reopen Ticket Tidak Memvalidasi Tiket Aktif Eksisting (Split Conversation State)
- **Lokasi File:** `backend/src/controllers/chatController.js` (L2570-L2604)
- **Severity:** High
- **Kategori:** Logika Bisnis / Integritas Data
- **Deskripsi Masalah:** Fungsi `reopenTicket` hanya memvalidasi apakah tiket yang bersangkutan berstatus `CLOSED`. Fungsi ini **tidak mengecek apakah pelanggan (`customer_id`) sudah memiliki tiket lain yang sedang berstatus `OPEN` atau `RESOLVED`**.
- **Skenario Pemicu:** Pelanggan A menyelesaikan Tiket 1 (CLOSED). Beberapa hari kemudian, Pelanggan A mengirim pesan baru sehingga sistem otomatis membuka Tiket 2 (OPEN). Lalu seorang agen membuka riwayat Tiket 1 dan mengklik tombol "Re-open Tiket".
- **Dampak:** Pelanggan A kini memiliki dua tiket OPEN secara bersamaan. Saat pesan WhatsApp masuk berikutnya diterima, kueri `findFirst` pada webhook akan secara arbitrer memasukkan pesan ke salah satu tiket, memecah riwayat percakapan menjadi dua tempat dan merusak konsistensi SLA.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -2589,4 +2589,17 @@ const reopenTicket = async (req, res) => {
       return res.status(400).json({ error: 'Hanya tiket dengan status CLOSED yang dapat diaktifkan kembali' });
     }
 
+    // Cegah membuka kembali jika pelanggan sudah memiliki tiket aktif lain
+    const activeExistingTicket = await prisma.ticket.findFirst({
+      where: {
+        customer_id: ticket.customer_id,
+        status: { in: ['OPEN', 'RESOLVED'] },
+        id: { not: ticket.id }
+      }
+    });
+    if (activeExistingTicket) {
+      return res.status(400).json({
+        error: `Pelanggan ini sedang memiliki tiket aktif lain (#${activeExistingTicket.id}). Tutup tiket aktif tersebut terlebih dahulu sebelum mengaktifkan kembali tiket ini.`
+      });
+    }
+
     // Catat pesan log sistem internal
```

---

### [BUG-010] Unhandled Fallback pada unlinkHtsTicket Menghapus Data Tiket HTS yang Salah
- **Lokasi File:** `backend/src/controllers/chatController.js` (L2465-L2478)
- **Severity:** High
- **Kategori:** Logika Bisnis / Integritas Data
- **Deskripsi Masalah:** Pada fungsi `unlinkHtsTicket`, jika parameter `htsTicketId` tidak ditemukan di tabel `TicketHts` (misal karena ID salah atau sudah terhapus), baris 2474 mengeksekusi *fallback*:
  ```javascript
  if (!ticketHts) {
    ticketHts = await prisma.ticketHts.findFirst({
      where: { ticket_id: parseInt(ticketId) }
    });
  }
  ```
  Fallback ini akan secara serampangan mengambil record `TicketHts` **pertama mana pun** milik tiket tersebut, lalu langsung menghapusnya di baris 2495 (`await prisma.ticketHts.delete(...)`).
- **Skenario Pemicu:** Sebuah tiket aduan memiliki 3 tiket HTS tertaut (misal: ID 101, 102, 103). Petugas bermaksud melepas ID 999 (salah klik/stale ID).
- **Dampak:** Tiket HTS ID 101 milik petugas terhapus secara tidak sengaja dari database (*unintended deletion*), padahal ID yang diminta adalah ID lain yang tidak valid.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -2472,9 +2472,7 @@ const unlinkHtsTicket = async (req, res) => {
     }
 
     if (!ticketHts) {
-      ticketHts = await prisma.ticketHts.findFirst({
-        where: { ticket_id: parseInt(ticketId) }
-      });
+      return res.status(404).json({ error: 'Data tiket HTS yang dimaksud tidak ditemukan pada percakapan ini' });
     }
 
     const currentTicket = await prisma.ticket.findUnique({
```

---

### [BUG-011] Host Header Injection pada Link Notifikasi WhatsApp Blast L2
- **Lokasi File:** `backend/src/controllers/chatController.js` (L830-L832)
- **Severity:** High
- **Kategori:** Keamanan
- **Deskripsi Masalah:** Saat mengirimkan blast notifikasi penugasan tiket ke grup/teknisi WhatsApp L2, variabel URL dashboard dibuat menggunakan:
  ```javascript
  const hostHeader = req.headers.host || 'localhost:5173';
  const dashboardUrl = hostHeader.includes(':') ? `http://${hostHeader.split(':')[0]}:5173` : `http://${hostHeader}:5173`;
  ```
  Nilai `req.headers.host` dikontrol sepenuhnya oleh client HTTP. Penyerang dapat memanipulasi header `Host: evil-phishing.com`, sehingga tautan yang dikirimkan via WhatsApp resmi Helpdesk menjadi tautan jebakan (*phishing*). Selain itu, *hardcoded port 5173* (port dev Vite) menyebabkan tautan di lingkungan produksi (domain HTTPS) menjadi rusak dan tidak dapat diklik teknisi.
- **Skenario Pemicu:** Penugasan tiket via endpoint API dengan header `Host` yang telah dimodifikasi atau deployment pada domain publik tanpa port 5173.
- **Dampak:** Potensi serangan *phishing* terhadap teknisi internal pemerintah serta kegagalan teknisi membuka dashboard dari tautan WhatsApp.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -829,4 +829,2 @@ const assignTicket = async (req, res) => {
     const instanceName = EVOLUTION_INSTANCE_NAME;
-    const hostHeader = req.headers.host || 'localhost:5173';
-    const dashboardUrl = hostHeader.includes(':') ? `http://${hostHeader.split(':')[0]}:5173` : `http://${hostHeader}:5173`;
+    const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
```

---

### [BUG-012] Penyimpanan Cookie Sesi Login Portal HTS Pemerintah dalam Bentuk Plaintext
- **Lokasi File:** `backend/src/services/htsClientService.js` (L73-L84, L185-L192) & `backend/prisma/schema.prisma` (L72)
- **Severity:** High
- **Kategori:** Keamanan
- **Deskripsi Masalah:** Kolom `cookie_data` pada model `HtsUserSession` menyimpan seluruh cookie sesi PHP CodeIgniter (`ci_session`) dalam bentuk JSON teks biasa (*plaintext*) ke dalam PostgreSQL. Sesi ini memiliki wewenang penuh atas portal resmi pemerintah provinsi (`hts.diskomdigi.jatengprov.go.id`).
- **Skenario Pemicu:** Terjadinya kebocoran file backup database SQL, akses tidak sah ke database oleh pihak ketiga, atau log query database.
- **Dampak:** Pembajakan sesi (*session hijacking*) akun resmi ASN/petugas pada portal pemerintah provinsi tanpa perlu mengetahui password atau memecahkan CAPTCHA.
- **Rekomendasi Solusi:**
  - Enkripsi string cookie sebelum disimpan ke database menggunakan algoritma AES-256-GCM dengan kunci rahasia simetris dari environment variable (`SESSION_ENCRYPTION_KEY`). Dekripsi cookie hanya dilakukan di memori saat hendak melakukan request HTTP ke portal HTS.

---

### [BUG-013] Ketiadaan Centralized Error Handler dan Listener Crash Proses Node.js
- **Lokasi File:** `backend/src/index.js` (L49-L121)
- **Severity:** High
- **Kategori:** Stabilitas
- **Deskripsi Masalah:** Aplikasi Express tidak memiliki middleware centralized error handler (`app.use((err, req, res, next) => ...)`). Jika sebuah route handler atau middleware pihak ketiga (seperti Multer) melempar error unhandled, Express akan menggunakan default HTML error renderer yang berisiko membocorkan *stack trace* file internal ke client. Selain itu, proses Node.js tidak memiliki listener untuk `process.on('unhandledRejection')`, `process.on('uncaughtException')`, serta sinyal terminasi kontainer (`SIGTERM` / `SIGINT`).
- **Skenario Pemicu:** Terjadi error pada runtime asynchronous atau proses orkestrator kontainer Docker melakukan restart/stop.
- **Dampak:** Server dapat mati tiba-tiba tanpa logging terstruktur, koneksi database pool Prisma tertinggal dalam kondisi *hanging*, dan file yang sedang ditulis mengalami korupsi.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/index.js
+++ b/backend/src/index.js
@@ -113,3 +113,15 @@ app.use('/api/hts', verifyToken, htsRoutes);
 
+// Centralized Error Handler (Express)
+app.use((err, req, res, next) => {
+  console.error(`[Unhandled API Error] ${req.method} ${req.originalUrl}:`, err);
+  if (err.name === 'MulterError') {
+    return res.status(400).json({ error: `File upload error: ${err.message}` });
+  }
+  res.status(err.status || 500).json({
+    error: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan internal server' : err.message
+  });
+});
+
 // Health check endpoint
 app.get('/api/health', (req, res) => {
@@ -148,3 +160,17 @@ server.listen(PORT, () => {
 });
+
+// Process Lifecycle & Graceful Shutdown
+process.on('unhandledRejection', (reason, promise) => {
+  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
+});
+process.on('uncaughtException', (error) => {
+  console.error('[FATAL] Uncaught Exception:', error);
+  process.exit(1);
+});
+process.on('SIGTERM', async () => {
+  console.log('[System] Menerima SIGTERM, menutup server secara anggun...');
+  server.close(async () => {
+    const prisma = require('./config/db');
+    await prisma.$disconnect();
+    process.exit(0);
+  });
+});
```

---

### [BUG-014] Operasi I/O Berkas Tersinkronisasi (fs.sync) Memblokir Node.js Event Loop
- **Lokasi File:** 
  - `backend/src/controllers/webhookController.js` (L100-L101: `fs.existsSync`, `fs.mkdirSync`, `fs.writeFileSync`)
  - `backend/src/controllers/chatController.js` (L498: `fs.readFileSync(file.path, { encoding: 'base64' })`)
  - `backend/src/services/htsClientService.js` (L411, L680: `fs.readFileSync(safeFilePath)`)
  - `backend/src/services/fileCleanupService.js` (L51: `fs.unlinkSync(filePath)`)
- **Severity:** Medium
- **Kategori:** Stabilitas / Konkurensi
- **Deskripsi Masalah:** Node.js beroperasi pada arsitektur *single-threaded event loop*. Penggunaan fungsi berkas bertipe `*Sync` (khususnya membaca dan menulis file media berukuran megabyte) menghentikan seluruh pemrosesan event loop. Saat operasi I/O ini berjalan, server tidak dapat melayani request HTTP lain, tidak dapat menerima event webhook WhatsApp, dan menghentikan pengiriman detak jantung WebSocket.
- **Skenario Pemicu:** Beberapa pengguna mengirimkan foto atau lampiran dokumen secara serentak ke nomor Helpdesk.
- **Dampak:** Lonjakan waktu respons API (*latency spike*), webhook Evolution API mengalami *connection timeout*, dan Socket.IO client terputus (*ping timeout*).
- **Rekomendasi Solusi:**
  - Ganti seluruh pemanggilan `fs.*Sync` dengan modul `fs.promises` (misal: `await fs.promises.writeFile`, `await fs.promises.readFile`, `await fs.promises.unlink`).

---

### [BUG-015] Silent Failure pada Pengiriman Media WhatsApp (False Positive Success)
- **Lokasi File:** `backend/src/controllers/chatController.js` (L513-L524)
- **Severity:** Medium
- **Kategori:** Integrasi / Logika Bisnis
- **Deskripsi Masalah:** Pada fungsi `sendMedia`, ketika panggilan API ke Evolution API (`/message/sendMedia`) gagal (misal karena instance WA terputus atau nomor tujuan tidak terdaftar), blok `catch (evoError)` hanya mencetak log ke konsol tanpa melempar error kembali (*swallowed exception*). Kode tetap melanjutkan eksekusi untuk menyimpan pesan ke database dan mengembalikan `{ success: true, message: savedMessage }`.
- **Skenario Pemicu:** Petugas helpdesk mengirim gambar solusi ke pelapor saat koneksi WhatsApp server sedang terputus sejenak.
- **Dampak:** Petugas di web dashboard melihat centang hijau seolah-olah gambar berhasil terkirim ke WhatsApp warga, padahal warga tidak pernah menerima gambar tersebut (*false sense of delivery*).
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -522,3 +522,4 @@ const sendMedia = async (req, res) => {
     } catch (evoError) {
       console.error('[Evolution API] Failed to send WA Media:', evoError?.response?.data || evoError.message);
+      return res.status(502).json({ error: 'Gagal mengirimkan media ke WhatsApp. Periksa status koneksi WhatsApp gateway.' });
     }
```

---

### [BUG-016] Cacat Normalisasi Nomor HP Indonesia 12-Digit pada Impor dan Outbound Chat
- **Lokasi File:** `backend/src/controllers/adminController.js` (L376) & `backend/src/controllers/chatController.js` (L2755)
- **Severity:** Medium
- **Kategori:** Logika Bisnis
- **Deskripsi Masalah:** Logika penambahan kode negara `62` pada nomor ponsel Indonesia memiliki aturan:
  ```javascript
  else if (!cleanNum.startsWith('62') && cleanNum.length <= 11) {
    cleanNum = '62' + cleanNum;
  }
  ```
  Di Indonesia, nomor ponsel seluler umumnya memiliki panjang 11 hingga 13 digit (misal: `0812345678901` setelah dihilangkan angka 0 menjadi `812345678901` yang memiliki **12 digit**). Kondisi `cleanNum.length <= 11` menyebabkan nomor seluler 12 digit yang diinput tanpa angka 0 di depan **tidak ditambahkan kode negara 62**.
- **Skenario Pemicu:** Pengguna memasukkan nomor kontak impor atau outbound chat berupa `812345678901`.
- **Dampak:** Nomor tersimpan sebagai `812345678901` bukannya `62812345678901`, menyebabkan kegagalan pengiriman pesan via Evolution API (`number is not registered on WhatsApp`).
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -2754,4 +2754,4 @@ const startNewChat = async (req, res) => {
   if (cleanNumber.startsWith('0')) {
     cleanNumber = '62' + cleanNumber.substring(1);
-  } else if (!cleanNumber.startsWith('62') && cleanNumber.length <= 11) {
+  } else if (cleanNumber.startsWith('8')) {
     cleanNumber = '62' + cleanNumber;
   }
```

---

### [BUG-017] Hardcoded Docker IP 172.17.0.1 dan Kebocoran Token pada URL Query (setupEvolution.js)
- **Lokasi File:** `backend/src/scripts/setupEvolution.js` (L9-L10)
- **Severity:** Medium
- **Kategori:** Integrasi / Keamanan
- **Deskripsi Masalah:** Pada skrip penyiapan instance Evolution API, baris 10 mengatur webhook URL:
  `http://172.17.0.1:3000/api/webhook/whatsapp?token=${encodeURIComponent(secretToken)}`.
  1. Alamat IP `172.17.0.1` adalah default bridge Docker Linux. Pada Windows (Docker Desktop) dan macOS, IP ini tidak dapat menjangkau host backend (harus menggunakan `host.docker.internal`).
  2. Menyertakan secret token ke dalam URL query parameter (`?token=...`) menyebabkan token rahasia tercatat dalam teks terbuka di log akses web server, log proxy, dan riwayat HTTP.
- **Skenario Pemicu:** Menjalankan `npm run setup:evolution` di lingkungan Windows atau production VPS dengan custom bridge network.
- **Dampak:** Webhook WhatsApp gagal mencapai backend (pesan masuk tidak diterima sistem sama sekali), serta kebocoran kredensial rahasia pada file log sistem.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/scripts/setupEvolution.js
+++ b/backend/src/scripts/setupEvolution.js
@@ -9,4 +9,5 @@
 const secretToken = WEBHOOK_SECRET || EVO_KEY;
-const WEBHOOK_URL = `http://172.17.0.1:3000/api/webhook/whatsapp?token=${encodeURIComponent(secretToken)}`;
+const BACKEND_HOST = process.env.BACKEND_INTERNAL_URL || (process.platform === 'win32' ? 'http://host.docker.internal:3000' : 'http://172.17.0.1:3000');
+const WEBHOOK_URL = `${BACKEND_HOST}/api/webhook/whatsapp`;
```

---

### [BUG-018] Unbounded Query dan Risiko Kehabisan Memori pada Reporting API (getTicketReports)
- **Lokasi File:** `backend/src/controllers/reportController.js` (L34-L57)
- **Severity:** Medium
- **Kategori:** Resource Management / Stabilitas
- **Deskripsi Masalah:** Endpoint `GET /api/reports/tickets` menjalankan `prisma.ticket.findMany({ where: whereClause, include: { customer: true, messages: ..., categories: ..., hts_tickets: ... } })` **tanpa paginasi sama sekali** (tidak ada `take`, `skip`, atau batas limit maksimal).
- **Skenario Pemicu:** Helpdesk telah beroperasi selama 6 bulan dan database memuat puluhan ribu riwayat tiket beserta ratusan ribu relasi pesan. Petugas membuka menu Laporan tanpa filter rentang tanggal sempit.
- **Dampak:** Node.js mencoba memuat ratusan ribu objek JSON relasional ke dalam memori secara simultan, mengakibatkan *database query timeout*, *CPU 100% saturation*, dan *server crash*.
- **Rekomendasi Solusi:**
  - Tambahkan parameter `limit` (default: 50, max: 200) dan `page` / `cursor`, atau wajibkan filter rentang tanggal maksimal 31 hari jika tidak menggunakan paginasi.

---

### [BUG-019] File Cleanup Service Meninggalkan Rekam Jejak Rusak di Database (Dangling 404 Media)
- **Lokasi File:** `backend/src/services/fileCleanupService.js` (L41-L58)
- **Severity:** Medium
- **Kategori:** Integritas Data / Stabilitas
- **Deskripsi Masalah:** Background service `cleanupExpiredUploads` menghapus berkas fisik gambar di folder `uploads` untuk tiket yang telah ditutup melewati masa retensi (90 hari). Namun, fungsi ini **tidak memperbarui kolom `attachment_url` pada tabel `Message`**.
- **Skenario Pemicu:** Petugas membuka riwayat percakapan tiket lama yang berkas gambarnya telah dihapus oleh sistem retensi.
- **Dampak:** Antarmuka web frontend menampilkan ikon gambar pecah (*broken image* / 404 Not Found), menimbulkan kesan sistem mengalami kerusakan berkas.
- **Rekomendasi Solusi:**
  - Setelah berkas berhasil di-unlink dari storage, jalankan `prisma.message.update({ where: { id: msg.id }, data: { attachment_url: null } })` atau beri penanda bahwa media telah diarsipkan sesuai kebijakan retensi.

---

### [BUG-020] Ketiadaan Brute-Force Rate Limiter pada Endpoint Login Otentikasi
- **Lokasi File:** `backend/src/routes/auth.js` (L6) & `backend/src/index.js` (L64-L71)
- **Severity:** Medium
- **Kategori:** Keamanan
- **Deskripsi Masalah:** Endpoint `POST /api/auth/login` hanya dilindungi oleh rate limiter global API umum (`1000 request per 15 menit per IP`). Tidak ada rate limiter ketat khusus percobaan login yang gagal.
- **Skenario Pemicu:** Penyerang menjalankan kamus serangan *credential stuffing* atau *brute force password* terhadap akun staf L1/Admin dengan frekuensi 900 percobaan per 15 menit per IP.
- **Dampak:** Risiko pengambilalihan akun staf (*account takeover*) meningkat pesat, terutama jika pengguna menggunakan password lemah.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/routes/auth.js
+++ b/backend/src/routes/auth.js
@@ -3,4 +3,11 @@ const router = express.Router();
 const { login, getMe } = require('../controllers/authController');
 const { verifyToken } = require('../middlewares/authMiddleware');
+const rateLimit = require('express-rate-limit');
+
+const loginLimiter = rateLimit({
+  windowMs: 15 * 60 * 1000,
+  max: 10, // Maksimal 10 percobaan login gagal per IP per 15 menit
+  message: { error: 'Terlalu banyak percobaan login yang gagal. Silakan coba kembali dalam 15 menit.' }
+});
 
-router.post('/login', login);
+router.post('/login', loginLimiter, login);
 router.get('/me', verifyToken, getMe);
```

---

### [BUG-021] Overlapping Heartbeat Ticks & Interval Drift pada htsKeepAliveService
- **Lokasi File:** `backend/src/services/htsKeepAliveService.js` (L48-L67)
- **Severity:** Medium
- **Kategori:** Stabilitas / Konkurensi
- **Deskripsi Masalah:** Service heartbeat menggunakan `setInterval(pingActiveHtsSessions, intervalMs)`. Fungsi `pingActiveHtsSessions` menjalankan beberapa panggilan HTTP berurutan ke server eksternal HTS. Jika server eksternal sedang mengalami *slowdown* atau *timeout*, durasi eksekusi dapat melampaui interval timer. `setInterval` tidak menunggu eksekusi sebelumnya selesai, sehingga interval berikutnya akan berjalan bertumpuk (*overlapping ticks*).
- **Skenario Pemicu:** Gangguan jaringan atau antrean pada server portal HTS Diskomdigi.
- **Dampak:** Akumulasi request paralel ke portal pemerintah yang memicu pemblokiran IP (*IP rate-limited / blacklisted*) dan kehabisan socket koneksi internal.
- **Rekomendasi Solusi:**
  - Gunakan flag konkurensi (`let isRunning = false; if (isRunning) return; ... isRunning = false;`) atau beralih ke pola *recursive setTimeout*.

---

### [BUG-022] Fragile JSON Parsing & Type Mismatch pada createTicketHts & updateAutoReplySetting
- **Lokasi File:** 
  - `backend/src/controllers/chatController.js` (L1742-L1748)
  - `backend/src/controllers/settingController.js` (L32)
- **Severity:** Medium
- **Kategori:** Logika Bisnis / Validasi Input
- **Deskripsi Masalah:**
  1. Pada `createTicketHts`, `JSON.parse(req.body.selectedAttachmentUrls)` dipanggil tanpa blok `try/catch`. Jika client mengirimkan string JSON yang tidak valid (misal `"[abc"`), proses melempar `SyntaxError` tak tertangani. Selain itu, jika hasil parsing bukan array, pemanggilan `.forEach()` melempar `TypeError`.
  2. Pada `settingController.updateAutoReplySetting`, baris `if (message !== undefined && message.trim().length === 0)` mengasumsikan tipe data `message` selalu string. Jika client mengirimkan `{ message: 123 }`, pemanggilan `.trim()` melempar error `message.trim is not a function`.
- **Skenario Pemicu:** Pengiriman payload malformed dari API client atau integrasi frontend yang belum divalidasi.
- **Dampak:** Kegagalan request secara tiba-tiba dan error status 500 yang tidak ramah pengguna.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/controllers/settingController.js
+++ b/backend/src/controllers/settingController.js
@@ -32,3 +32,3 @@ const updateAutoReplySetting = async (req, res) => {
-  if (message !== undefined && message.trim().length === 0) {
+  if (message !== undefined && (typeof message !== 'string' || message.trim().length === 0)) {
     return res.status(400).json({ error: 'Pesan balasan tidak boleh kosong dan harus berupa teks' });
   }
```

---

### [BUG-023] Missing Timeout pada Pembuatan Instance Axios di setupEvolution.js
- **Lokasi File:** `backend/src/scripts/setupEvolution.js` (L12-L18)
- **Severity:** Low
- **Kategori:** Integrasi
- **Deskripsi Masalah:** Instansiasi Axios `axios.create({ baseURL: EVO_URL, ... })` tidak menyertakan konfigurasi `timeout`. Secara default pada Axios, timeout bernilai `0` (tak terbatas).
- **Skenario Pemicu:** Container Evolution API mengalami freeze/hang saat skrip setup dijalankan.
- **Dampak:** Skrip setup menggantung tanpa henti (*infinite hang*) dan menghalangi alur pipeline otomasi build.
- **Rekomendasi Solusi:** Tambahkan konfigurasi `timeout: 10000` pada objek `axios.create`.

---

### [BUG-024] Hardcoded Fallback User ID 1 pada Controller Messages
- **Lokasi File:** `backend/src/controllers/chatController.js` (L392, L416, L534, L819, L1010, L1127)
- **Severity:** Low / Code Smell
- **Kategori:** Logika Bisnis / Integritas Data
- **Deskripsi Masalah:** Pada beberapa pembuatan catatan sistem internal, terdapat baris fallback: `sender_id: req.user ? req.user.id : 1`. Jika pengguna dengan ID `1` telah dihapus dari database atau database menggunakan UUID / ID acak, kueri `prisma.message.create` akan gagal dengan error pelanggaran foreign key `Message_sender_id_fkey`.
- **Skenario Pemicu:** Sistem dijalankan pada database yang akun pertamanya (ID 1) telah dihapus atau sequence ID dimulai dari angka selain 1.
- **Dampak:** Aksi penugasan, penyelesaian, atau pengembalian tiket gagal dijalankan dengan status error 500.
- **Rekomendasi Solusi:** Gunakan nilai `sender_id: req.user?.id || null` karena kolom `sender_id` di skema `Message` bersifat opsional (`Int?`).

---

### [BUG-025] Inkonsistensi RBAC pada Pengaturan Auto-Reply (Admin Dilarang Mengubah Setting)
- **Lokasi File:** `backend/src/routes/setting.js` (L7-L8)
- **Severity:** Low / Code Smell
- **Kategori:** Logika Bisnis / Keamanan
- **Deskripsi Masalah:** Rute `GET /api/settings/autoreply` dan `PUT /api/settings/autoreply` menerapkan middleware `requireRole(['L1'])`. Peran `ADMIN` dan `SPV` tidak disertakan di dalam array peran yang diizinkan. Hal ini tidak logis karena Administrator sistem seharusnya memiliki hak istimewa tertinggi untuk mengelola seluruh konfigurasi aplikasi.
- **Skenario Pemicu:** Administrator login ke dashboard dan mencoba mengubah pesan auto-reply bot.
- **Dampak:** Administrator mendapatkan pesan kesalahan `403 Forbidden: Akses ditolak. Anda tidak memiliki wewenang`.
- **Rekomendasi Solusi:**
```diff
--- a/backend/src/routes/setting.js
+++ b/backend/src/routes/setting.js
@@ -6,4 +6,4 @@ const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
 
-// Proteksi khusus peran L1 sesuai kebutuhan bisnis
-router.get('/autoreply', verifyToken, requireRole(['L1']), settingController.getAutoReplySetting);
-router.put('/autoreply', verifyToken, requireRole(['L1']), settingController.updateAutoReplySetting);
+// Akses konfigurasi auto-reply untuk L1, SPV, dan Administrator
+router.get('/autoreply', verifyToken, requireRole(['L1', 'ADMIN', 'SPV']), settingController.getAutoReplySetting);
+router.put('/autoreply', verifyToken, requireRole(['L1', 'ADMIN', 'SPV']), settingController.updateAutoReplySetting);
```

---

### [BUG-026] Hardcoded Default Passwords pada Database Seed Script
- **Lokasi File:** `backend/prisma/seed.js` (L46)
- **Severity:** Low / Code Smell
- **Kategori:** Keamanan
- **Deskripsi Masalah:** Skrip seeding database membuat seluruh akun bawaan (Administrator, Supervisor, Dispatcher L1, dan Teknisi L2) menggunakan password default yang sama dalam format teks terbuka di skrip: `'password123'`.
- **Skenario Pemicu:** Database di-seed pada server produksi dan administrator lupa mengubah password akun-akun bawaan tersebut.
- **Dampak:** Potensi akses ilegal oleh pihak luar yang mencoba kredensial default bawaan sistem.
- **Rekomendasi Solusi:** Ambil password seed dari environment variable `SEED_DEFAULT_PASSWORD` atau wajibkan penggantian password saat login pertama kali (*force password reset on first login*).

---

## 3. Prioritas Tindakan (Action Plan)

Untuk menjamin kelancaran rilis dan menjaga ketersediaan layanan (*high availability*), tim pengembang diinstruksikan untuk menjalankan perbaikan secara bertahap sesuai prioritas berikut:

### Fase 1: Perbaikan Kritis (Mendesak Diperbaiki Sebelum Release / Deployment Produksi)
*Target: Mencegah server crash, kebocoran memori instan, dan kegagalan booting.*
1. **Perbaiki Memory Leak `withLock` ([BUG-001]):** Ubah logika `.finally()` agar mencocokkan promise pembersih yang benar, memastikan Map key dibersihkan setelah antrean pesan selesai.
2. **Koreksi Konfigurasi Lingkungan & Docker ([BUG-003], [BUG-004]):** Tambahkan `JWT_SECRET` ke `.env.example`, selaraskan port dan kredensial PostgreSQL antara `docker-compose.yml` (port 5433) dan konfigurasi backend.
3. **Kunci Celah Keamanan CORS Socket.IO & REST ([BUG-002]):** Hapus fallback `return callback(null, true)` dan batasi akses Socket.IO serta Express hanya pada origin resmi yang terdaftar di environment.
4. **Proteksi Buffer Upload Kontak ([BUG-005]):** Tambahkan batasan `fileSize: 15MB` dan filter ekstensi berkas pada Multer untuk mencegah serangan *heap exhaustion DoS*.
5. **Amankan Fallback Tiket Webhook ([BUG-006]):** Berikan penanganan null-check eksplisit pada `ticketId` di `webhookController` agar pesan tidak dibuang saat terjadi bentrok konkurensi.

### Fase 2: Peningkatan Stabilitas, Integritas Data & Jaringan
*Target: Menjamin integritas data percakapan, keandalan webhook, dan ketahanan integrasi eksternal.*
1. **Perbaiki Deduplikasi Auto-Reply Bot ([BUG-007]):** Simpan `wa_message_id` saat bot mengirim balasan otomatis dan perluas filter deduplikasi untuk mencakup sender `BOT`.
2. **Perbaiki Logika Status Tiket ([BUG-008], [BUG-009], [BUG-010]):** 
   - Wajibkan opsi *force delete* pada pembersihan data kontak jika masih ada riwayat tiket CLOSED.
   - Cegah pembukaan kembali (*reopen*) tiket jika pelanggan telah memiliki tiket aktif lain.
   - Hapus fallback arbitrer pada `unlinkHtsTicket` agar tidak menghapus tiket HTS yang salah.
3. **Cegah Host Header Injection ([BUG-011]):** Ganti interpolasi `req.headers.host` pada blast WhatsApp dengan variabel statis `FRONTEND_URL`.
4. **Implementasikan Centralized Error Handler & Process Shutdown ([BUG-013]):** Pasang middleware penanganan error global Express serta listener `SIGTERM`, `unhandledRejection`, dan `uncaughtException`.
5. **Enkripsi Kredensial Sesi Pemerintah ([BUG-012]):** Terapkan enkripsi AES-256 pada kolom `cookie_data` sesi login portal HTS di database.
6. **Eliminasi Silent Failure Pengiriman Media ([BUG-015]):** Kembalikan status error 502 ke client jika pengiriman berkas ke Evolution API gagal.

### Fase 3: Quick Wins, Optimalisasi Performa & Code Smell (Refactoring Ringan)
*Target: Meningkatkan throughput server, konsistensi kode, dan kenyamanan operasional.*
1. **Migrasi I/O Berkas ke Asynchronous ([BUG-014]):** Ubah seluruh pemanggilan `fs.*Sync` menjadi `fs.promises.*` agar event loop Node.js tidak terblokir saat lalu lintas media padat.
2. **Koreksi Normalisasi Nomor WhatsApp ([BUG-016]):** Sempurnakan regex / pemformatan nomor ponsel 12-digit Indonesia yang diawali angka 8.
3. **Perbaiki Script Setup Evolution ([BUG-017], [BUG-023]):** Hilangkan hardcoded IP `172.17.0.1`, hilangkan token pada query parameter, dan tambahkan timeout pada Axios.
4. **Beri Paginasi pada Laporan Tiket ([BUG-018]):** Terapkan limit dan cursor pagination pada endpoint `GET /api/reports/tickets`.
5. **Bersihkan Referensi Berkas Terhapus ([BUG-019]):** Update `attachment_url` menjadi null di database saat berkas fisik dihapus oleh cleanup service.
6. **Pasang Brute-Force Rate Limiter pada Login ([BUG-020]):** Batasi percobaan login maksimal 10 kali per 15 menit per IP.
7. **Pencegahan Concurrency Drift pada Heartbeat ([BUG-021]):** Pasang guard lock boolean pada loop keep-alive HTS.
8. **Pembersihan Code Smell & RBAC ([BUG-022], [BUG-024], [BUG-025], [BUG-026]):** Berikan try-catch pada parsing JSON, hilangkan hardcoded `sender_id: 1`, izinkan peran Admin mengakses konfigurasi auto-reply, dan amankan seed password.

---
*Laporan ini disusun secara objektif berdasarkan verifikasi statis kode sumber dan standar rekayasa perangkat lunak modern (OWASP Top 10, Node.js Best Practices, Clean Code).*
