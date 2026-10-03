# 📋 Laporan Audit Kerentanan & Rekomendasi Solusi Teknis (Bug Audit & Fix Recommendations)

**Proyek:** `hts-chat-integration`  
**Peran Auditor:** Principal Full-Stack Engineer, Security Auditor, & QA Lead  
**Tanggal Audit:** 3 Oktober 2026  
**Status Audit Keseluruhan:** `[OPEN]` — Menunggu Tinjauan & Persetujuan Implementasi  

---

## 1. Ringkasan Eksekutif & Tabel Rekapitulasi

Audit komprehensif ini dilakukan secara menyeluruh terhadap seluruh arsitektur sistem `hts-chat-integration` yang mencakup komponen **Frontend** (React 18 + Vite), **Backend** (Node.js Express + Prisma ORM + PostgreSQL), serta **Integrasi Real-Time E2E** (Socket.io & Evolution API WhatsApp Gateway).

Tujuan audit adalah mengidentifikasi celah keamanan (IDOR, sanitasi input, kredensial), integritas basis data (transaksi, cascading delete, error handling Prisma), stabilitas logika bisnis (state machine guard, race condition), siklus hidup media (kebocoran berkas disk), serta anomali siklus hidup komponen frontend (re-render destruktif, state mutation, kepatuhan ESLint).

### Tabel Rekapitulasi Temuan

| ID Bug | Judul Masalah | Komponen / Lokasi | Severity | Kategori | Status |
|:---|:---|:---|:---:|:---:|:---:|
| **[BUG-001]** | Ketiadaan Validasi Kepemilikan Tiket pada Endpoint `unlinkHtsTicket` (IDOR) | `backend/src/controllers/chatController.js:2780` | **CRITICAL** | Security / Authorization (IDOR) | `[OPEN]` |
| **[BUG-002]** | Bypass Validasi Tiket Aduan & Ketiadaan State Machine Guard pada `closeGeneralChat` | `backend/src/controllers/chatController.js:2273` | **HIGH** | Business Logic & State Guard | `[OPEN]` |
| **[BUG-003]** | `useEffect` Re-render Loop & State Reset Destruktif pada Listener Riwayat Chat | `frontend/src/App.jsx:1782` | **HIGH** | Frontend State & UX Resilience | `[OPEN]` |
| **[BUG-004]** | Penghapusan Tiket Laporan Mengabaikan Model Relasi `TicketHts` | `backend/src/controllers/reportController.js:161` | **HIGH** | Database Integrity & Transaction | `[OPEN]` |
| **[BUG-005]** | Potensi Null Reference Crash (HTTP 500) pada `getMe` saat Pengguna Dihapus | `backend/src/controllers/authController.js:60` | **MEDIUM** | Null Reference & Error Handling | `[OPEN]` |
| **[BUG-006]** | Parameter Numerik `parseInt` Tanpa Pemeriksaan `isNaN` Membubarkan Query Prisma | `backend/src/controllers/chatController.js:124` | **MEDIUM** | Input Validation & Robustness | `[OPEN]` |
| **[BUG-007]** | Kunci Enkripsi Sesi Portal HTS Memiliki Fallback Rahasia Statis Lemah | `backend/src/services/htsClientService.js:6` | **MEDIUM** | Security Hardening / Fail-Fast | `[OPEN]` |
| **[BUG-008]** | Kebocoran Berkas Unggahan (Orphaned Media) di `/uploads` Saat Transmisi WA Gagal | `backend/src/controllers/chatController.js:582` | **MEDIUM** | Storage Lifecycle & File Leak | `[OPEN]` |
| **[BUG-009]** | Asimetri Kontrak Event Socket.io `ticket_updated` dan Penautan HTS | `backend/src/controllers/chatController.js:2059` | **MEDIUM** | E2E Integration & Socket Contract | `[OPEN]` |
| **[BUG-010]** | Validasi Kategori L2 pada `returnTicket` Tidak Mendukung Fallback Basis Data | `backend/src/controllers/chatController.js:1206` | **MEDIUM** | RBAC & Authorization Edge Case | `[OPEN]` |
| **[BUG-011]** | Pencarian Kontak Direktori Tanpa Debounce dan Kontrol Pembatalan Request | `frontend/src/App.jsx:4647` | **LOW** | Race Condition & Performance | `[OPEN]` |
| **[BUG-012]** | Akumulasi State/Handler Usang dan Unescaped JSX Entities Membatalkan Linter | `frontend/src/App.jsx:859` | **LOW** | Code Quality & Lint Compliance | `[OPEN]` |

---

## 2. Detail Temuan Bug & Rekomendasi Solusi Teknis

---

### [BUG-001] Ketiadaan Validasi Kepemilikan Tiket pada Endpoint `unlinkHtsTicket` (IDOR)
- **Status:** `[OPEN]`
- **Lokasi:** `backend/src/controllers/chatController.js` (perkiraan baris 2774–2810)
- **Severity:** **CRITICAL**
- **Kategori:** Security / Authorization (Insecure Direct Object Reference)
- **Akar Masalah & Skenario Pemicu:**  
  Fungsi `unlinkHtsTicket` menerima dua parameter rute: `:ticketId` dan `:htsTicketId`. Fungsi melakukan kueri basis data untuk mencari record `TicketHts` berdasarkan ID:
  ```javascript
  ticketHts = await prisma.ticketHts.findUnique({ where: { id: parsedId } });
  ```
  Namun, controller **tidak pernah memvalidasi** apakah `ticketHts.ticket_id === parseInt(ticketId)`. Jika seorang agen nakal atau pengguna terotentikasi memanggil `DELETE /api/chat/tickets/1/hts/999/unlink`, di mana `999` adalah ID `TicketHts` milik Tiket #50 (pelanggan lain), sistem tetap mengeksekusi `prisma.ticketHts.delete` dan melepaskan tautan tiket HTS milik obrolan pelanggan lain tanpa otorisasi.
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -2786,6 +2786,10 @@ const unlinkHtsTicket = async (req, res) => {
     if (!ticketHts) {
       return res.status(404).json({ error: 'Data tiket HTS yang dimaksud tidak ditemukan pada percakapan ini' });
     }
+
+    if (ticketHts.ticket_id !== parseInt(ticketId)) {
+      return res.status(403).json({ error: 'Akses ditolak: Tiket HTS tidak terhubung ke percakapan tiket ini' });
+    }
 
     const currentTicket = await prisma.ticket.findUnique({
       where: { id: parseInt(ticketId) }
```

---

### [BUG-002] Bypass Validasi Tiket Aduan & Ketiadaan State Machine Guard pada `closeGeneralChat`
- **Status:** `[OPEN]`
- **Lokasi:** `backend/src/controllers/chatController.js` (perkiraan baris 2273–2339)
- **Severity:** **HIGH**
- **Kategori:** Business Logic & State Machine Guard
- **Akar Masalah & Skenario Pemicu:**  
  1. *Ketiadaan State Guard*: `closeGeneralChat` tidak memvalidasi status awal tiket. Jika tiket sudah berstatus `CLOSED`, request kedua akibat klik ganda atau tab paralel tetap mengeksekusi `prisma.ticket.update`, menimpa `closed_at`, dan menambahkan pesan internal duplikat `[SISTEM] Percakapan selesai ditutup`.
  2. *Bypass Aduan Teknis & HTS*: Controller tidak memverifikasi apakah tiket yang ditutup memiliki tiket HTS terhubung yang masih `PENDING` atau apakah tiket tersebut merupakan `is_aduan = true`. Operator dapat memanggil endpoint `/close-general` untuk menutup tiket aduan resmi secara instan tanpa menyelesaikan tiket di portal HTS, merusak integritas SLA MTTR.
  3. *Unresolved Categories*: Kategori tim L2 pada `TicketCategory` tidak diselesaikan (`is_resolved: true`).
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -2278,9 +2278,25 @@ const closeGeneralChat = async (req, res) => {
   try {
     const ticket = await prisma.ticket.findUnique({
       where: { id: parseInt(ticketId) },
-      include: { customer: true }
+      include: { customer: true, hts_tickets: true }
     });
 
     if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });
+    
+    if (ticket.status === 'CLOSED') {
+      return res.status(409).json({ error: 'Tiket sudah dalam status CLOSED' });
+    }
+
+    const hasPendingHts = ticket.hts_tickets?.some(h => h.hts_ticket_status !== 'SOLVED');
+    if (hasPendingHts) {
+      return res.status(400).json({
+        error: 'Tiket ini memiliki aduan HTS resmi yang belum diselesaikan. Gunakan form penutupan resmi HTS di panel obrolan.'
+      });
+    }
 
     const finalSummary = (summary && summary.trim()) || 'Percakapan biasa selesai';
@@ -2288,7 +2304,7 @@ const closeGeneralChat = async (req, res) => {
-    const updated = await prisma.ticket.update({
-      where: { id: ticket.id },
+    const [updateResult] = await prisma.$transaction([
+      prisma.ticket.updateMany({
+        where: { id: ticket.id, status: { not: 'CLOSED' } },
         data: {
           status: 'CLOSED',
           is_aduan: false,
           service_type: 'GENERAL_CHAT',
           summary: finalSummary,
           closed_at: new Date()
         }
-    });
+      }),
+      prisma.ticketCategory.updateMany({
+        where: { ticket_id: ticket.id },
+        data: { is_resolved: true, resolved_at: new Date() }
+      })
+    ]);
+
+    if (updateResult.count === 0) {
+      return res.status(409).json({ error: 'Tiket sudah ditutup oleh proses lain' });
+    }
+
+    const updated = await prisma.ticket.findUnique({
+      where: { id: ticket.id },
+      include: { customer: true, categories: { include: { category: true } }, hts_tickets: true }
+    });
```

---

### [BUG-003] `useEffect` Re-render Loop & State Reset Destruktif pada Listener Riwayat Chat
- **Status:** `[OPEN]`
- **Lokasi:** `frontend/src/App.jsx` (perkiraan baris 1782–1794)
- **Severity:** **HIGH**
- **Kategori:** Frontend State Management & UX Resilience
- **Akar Masalah & Skenario Pemicu:**  
  Pada baris 1782–1794:
  ```javascript
  useEffect(() => {
    if (activeTicket) {
      loadMessages(activeTicket.id);
      loadCustomerHistory(activeTicket);
      setWaArchivedMessages([]);
      setShowPastHistory(false);
    } ...
  }, [activeTicket]);
  ```
  Dependency array mencakup seluruh objek `activeTicket`. Setiap kali ada pesan baru dari socket atau pembaruan status minor, `loadTickets()` terpanggil dan memanggil `setActiveTicket(updatedActive)`. Karena referensi objek baru dibuat di memori, `useEffect` terpicu kembali. Efek sampingnya:
  1. `setWaArchivedMessages([])` menghapus riwayat arsip WA yang sedang dibaca operator.
  2. `setShowPastHistory(false)` menutup drawer/panel riwayat lampau yang sedang diperiksa operator.
  3. Memanggil ulang HTTP request `loadMessages` dan `loadCustomerHistory` secara terus-menerus.
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/frontend/src/App.jsx
+++ b/frontend/src/App.jsx
@@ -1780,7 +1780,7 @@ function MainApp() {
   }, [currentUser]); 
 
   useEffect(() => {
-    if (activeTicket) {
+    if (activeTicket?.id) {
       loadMessages(activeTicket.id);
       loadCustomerHistory(activeTicket);
       setWaArchivedMessages([]);
@@ -1790,7 +1790,7 @@ function MainApp() {
       setWaArchivedMessages([]);
       setShowPastHistory(false);
     }
-  }, [activeTicket]);
+  }, [activeTicket?.id]);
```

---

### [BUG-004] Penghapusan Tiket Laporan Mengabaikan Model Relasi `TicketHts`
- **Status:** `[OPEN]`
- **Lokasi:** `backend/src/controllers/reportController.js` (perkiraan baris 158–198)
- **Severity:** **HIGH**
- **Kategori:** Database Integrity & Transaction
- **Akar Masalah & Skenario Pemicu:**  
  Pada fungsi `deleteTicketReports`:
  - Saat `all === true`: Transaksi menghapus `message`, `ticketCategory`, `ticket`, dan `customer`. Namun pemanggilan `tx.ticketHts.deleteMany()` dan reset sequence `ALTER SEQUENCE "TicketHts_id_seq" RESTART WITH 1` tidak dijalankan.
  - Saat penghapusan batch selektif berdasarkan array `ids`: Transaksi hanya menghapus `message`, `ticketCategory`, dan `ticket`.
  Meskipun database memiliki foreign key `ON DELETE CASCADE` di tingkat PostgreSQL, Prisma client-side relation tracker akan menghasilkan peringatan atau potensi inkonsistensi record gantung jika foreign key cascade pada skema lama tidak terpicu secara seragam.
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/backend/src/controllers/reportController.js
+++ b/backend/src/controllers/reportController.js
@@ -161,10 +161,12 @@ const deleteTicketReports = async (req, res) => {
       await prisma.$transaction(async (tx) => {
+        await tx.ticketHts.deleteMany();
         await tx.message.deleteMany();
         await tx.ticketCategory.deleteMany();
         await tx.ticket.deleteMany();
         await tx.customer.deleteMany();
         await tx.$executeRawUnsafe(`ALTER SEQUENCE "Ticket_id_seq" RESTART WITH 1`);
+        await tx.$executeRawUnsafe(`ALTER SEQUENCE "TicketHts_id_seq" RESTART WITH 1`);
         await tx.$executeRawUnsafe(`ALTER SEQUENCE "Message_id_seq" RESTART WITH 1`);
         await tx.$executeRawUnsafe(`ALTER SEQUENCE "Customer_id_seq" RESTART WITH 1`);
       });
@@ -188,6 +190,9 @@ const deleteTicketReports = async (req, res) => {
     await prisma.$transaction([
+      prisma.ticketHts.deleteMany({
+        where: { ticket_id: { in: ticketIds } }
+      }),
       prisma.message.deleteMany({
         where: { ticket_id: { in: ticketIds } }
       }),
```

---

### [BUG-005] Potensi Null Reference Crash (HTTP 500) pada `getMe` saat Pengguna Dihapus
- **Status:** `[OPEN]`
- **Lokasi:** `backend/src/controllers/authController.js` (perkiraan baris 57–75)
- **Severity:** **MEDIUM**
- **Kategori:** Null/Undefined Reference & Error Handling
- **Akar Masalah & Skenario Pemicu:**  
  Ketika sebuah akun pengguna dihapus dari database oleh Administrator, klien browser pengguna tersebut masih menyimpan JWT token yang valid selama 12 jam di `localStorage`. Saat browser melakukan request ke `/api/auth/me`:
  ```javascript
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ id: user.id, ... });
  ```
  `user` bernilai `null`, menyebabkan runtime error `TypeError: Cannot read properties of null (reading 'id')` yang ditangkap sebagai HTTP 500 internal server error alih-alih HTTP 401/404 yang memicu redirect login otomatis di antarmuka frontend.
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/backend/src/controllers/authController.js
+++ b/backend/src/controllers/authController.js
@@ -62,6 +62,9 @@ const getMe = async (req, res) => {
       where: { id: req.user.id },
       select: { id: true, name: true, email: true, role: true, category_id: true, category: true }
     });
+    if (!user) {
+      return res.status(401).json({ error: 'Pengguna tidak ditemukan atau sesi telah berakhir' });
+    }
     res.json({
       id: user.id,
```

---

### [BUG-006] Parameter Numerik `parseInt` Tanpa Pemeriksaan `isNaN` Membubarkan Query Prisma
- **Status:** `[OPEN]`
- **Lokasi:** `backend/src/controllers/chatController.js` (`sendReply`, `closeTicket`, `sendMedia`, `assignTicket`, `resolveTicket`, `returnTicket`, `updateCustomer`, `syncTicketToHts`, `syncSolveHts`, `createTicketHts`, `solveTicketHtsSingle`, `toggleAduan`, `reopenTicket`, `linkHtsTicket`)
- **Severity:** **MEDIUM**
- **Kategori:** Input Validation & Database Robustness
- **Akar Masalah & Skenario Pemicu:**  
  Berbagai fungsi controller mengonversi parameter ID URL atau body langsung menggunakan `parseInt(ticketId)` ke dalam kueri Prisma:
  ```javascript
  where: { id: parseInt(ticketId) }
  ```
  Jika parameter berupa string acak (`undefined`, `null`, `"abc"`), `parseInt` mengembalikan `NaN`. Prisma ORM menolak `NaN` dengan melempar exception:
  `Argument 'id': Invalid value provided. Expected Int, provided Float/NaN.`
  Hal ini menghasilkan respon HTTP 500 Unhandled Error bagi klien, bukan HTTP 400 Bad Request yang bersih.
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -117,8 +117,12 @@ const sendReply = async (req, res) => {
   if (!ticketId || !text) {
     return res.status(400).json({ error: 'ticketId dan text wajib diisi' });
   }
+  const parsedTicketId = parseInt(ticketId, 10);
+  if (isNaN(parsedTicketId)) {
+    return res.status(400).json({ error: 'ID tiket tidak valid' });
+  }
 
   try {
     const ticket = await prisma.ticket.findUnique({
-      where: { id: parseInt(ticketId) },
+      where: { id: parsedTicketId },
       include: { customer: true }
     });
```
*(Pola validasi guard serupa diterapkan pada seluruh endpoint yang menerima parameter ID).*

---

### [BUG-007] Kunci Enkripsi Sesi Portal HTS Memiliki Fallback Rahasia Statis Lemah
- **Status:** `[OPEN]`
- **Lokasi:** `backend/src/services/htsClientService.js` (baris 6)
- **Severity:** **MEDIUM**
- **Kategori:** Security Hardening / Fail-Fast
- **Akar Masalah & Skenario Pemicu:**  
  Pada `htsClientService.js`:
  ```javascript
  const ENCRYPTION_KEY_RAW = process.env.SESSION_ENCRYPTION_KEY || process.env.JWT_SECRET || 'hts-session-secret-key-default-32-chars!!';
  ```
  Adanya string hardcoded fallback `'hts-session-secret-key-default-32-chars!!'` melanggar prinsip *fail-fast* yang sudah diterapkan pada Sprint 1. Jika konfigurasi `.env` gagal memuat `JWT_SECRET`, layanan ini akan mengenkripsi cookie PHP sesi portal HTS menggunakan string yang sudah diketahui secara publik di repositori Git.
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/backend/src/services/htsClientService.js
+++ b/backend/src/services/htsClientService.js
@@ -3,7 +3,8 @@ const crypto = require('crypto');
 const prisma = require('../config/db');
 const { getSafeUploadPath } = require('../utils/safePath');
+const { JWT_SECRET } = require('../config/env');
 
-const ENCRYPTION_KEY_RAW = process.env.SESSION_ENCRYPTION_KEY || process.env.JWT_SECRET || 'hts-session-secret-key-default-32-chars!!';
+const ENCRYPTION_KEY_RAW = process.env.SESSION_ENCRYPTION_KEY || JWT_SECRET;
 const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW).digest();
 const ALGORITHM = 'aes-256-gcm';
```

---

### [BUG-008] Kebocoran Berkas Unggahan (Orphaned Media) di `/uploads` Saat Transmisi WA Gagal
- **Status:** `[OPEN]`
- **Lokasi:** `backend/src/controllers/chatController.js` (perkiraan baris 535–587 dan 2350–2410)
- **Severity:** **MEDIUM**
- **Kategori:** Storage Lifecycle & File Resource Leak
- **Akar Masalah & Skenario Pemicu:**  
  Middleware Multer menyimpan berkas lampiran secara otomatis ke disk `/uploads` sebelum controller `sendMedia` mengeksekusi transmisi ke Evolution API. Apabila transmisi media ke WhatsApp gagal (`evoError`), controller mengembalikan status HTTP 502, namun tidak melakukan unlink (`fs.promises.unlink(file.path)`). Berkas fisik tersebut tersisa di server selamanya dan tidak pernah dibersihkan oleh `fileCleanupService` karena tidak memiliki keterkaitan dengan rekaman `Message` mana pun di basis data.
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -581,6 +581,7 @@ const sendMedia = async (req, res) => {
       waMessageId = evoMediaRes.data?.key?.id || null;
     } catch (evoError) {
       console.error('[Evolution API] Failed to send WA Media:', evoError?.response?.data || evoError.message);
+      if (file && file.path) await fs.promises.unlink(file.path).catch(() => {});
       return res.status(502).json({ error: 'Gagal mengirimkan media ke WhatsApp. Periksa status koneksi WhatsApp gateway.' });
     }
```

---

### [BUG-009] Asimetri Kontrak Event Socket.io `ticket_updated` dan Penautan HTS
- **Status:** `[OPEN]`
- **Lokasi:** `backend/src/controllers/chatController.js` (`createTicketHts:2059`, `solveTicketHtsSingle:2199`, `linkHtsTicket:3389`)
- **Severity:** **MEDIUM**
- **Kategori:** E2E Integration & Socket Contract
- **Akar Masalah & Skenario Pemicu:**  
  Pada `createTicketHts` dan `solveTicketHtsSingle`, backend memancarkan event `ticket_updated` hanya berupa `{ ticketId: ticket.id }` tanpa menyertakan objek `ticket: updatedTicket`. Akibatnya, logika `handleTicketUpdated` di frontend tidak dapat memperbarui state `activeTicket` secara instan dan harus menunggu respons HTTP `loadTickets()` selesai. Selain itu, pada `linkHtsTicket`, event `ticket_updated` sama sekali tidak dipancarkan, menyebabkan klien lain tidak mengetahui bahwa tiket telah dipromosikan ke aduan teknis resmi.
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -2057,7 +2057,7 @@ const createTicketHts = async (req, res) => {
     });
 
     if (req.io) {
-      req.io.emit('ticket_updated', { ticketId: ticket.id });
+      req.io.emit('ticket_updated', { ticketId: ticket.id, ticket: await prisma.ticket.findUnique({ where: { id: ticket.id }, include: { customer: true, categories: { include: { category: true } }, hts_tickets: { include: { category: true } } } }) });
       req.io.emit('hts_ticket_created', { ticketId: ticket.id, ticketHts: newTicketHts });
@@ -3386,6 +3386,7 @@ const linkHtsTicket = async (req, res) => {
     // 7. Siarkan notifikasi Socket.io ke dashboard
     if (req.io) {
+      req.io.emit('ticket_updated', { ticketId: ticket.id, ticket: updatedTicket });
       req.io.emit('hts_ticket_created', { ticketId: ticket.id, ticketHts: newTicketHts });
```

---

### [BUG-010] Validasi Kategori L2 pada `returnTicket` Tidak Mendukung Fallback Basis Data
- **Status:** `[OPEN]`
- **Lokasi:** `backend/src/controllers/chatController.js` (perkiraan baris 1206–1228)
- **Severity:** **MEDIUM**
- **Kategori:** RBAC & Authorization Edge Case
- **Akar Masalah & Skenario Pemicu:**  
  Pada `resolveTicket`, sistem menerapkan fallback: jika token JWT belum memuat `category_id`, sistem mengecek database `prisma.user.findUnique({ where: { id: user.id } })`. Sebaliknya, pada `returnTicket`, validasi hanya membaca `user.category_id` mentah dari token:
  ```javascript
  if (user && user.role === 'L2' && !user.category_id) {
    return res.status(403).json({ error: 'Akun teknisi Anda belum terhubung ke kategori manapun' });
  }
  ```
  Jika akun teknisi L2 baru saja ditugaskan kategori oleh Administrator tanpa login ulang, teknisi dapat menyelesaikan tiket via `resolveTicket` tetapi ditolak saat ingin mengembalikan tiket via `returnTicket`.
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/backend/src/controllers/chatController.js
+++ b/backend/src/controllers/chatController.js
@@ -1205,8 +1205,16 @@ const returnTicket = async (req, res) => {
       return res.status(403).json({ error: 'Akses ditolak: Petugas L1 tidak berwenang mengembalikan penugasan tim L2' });
     }
 
-    if (user && user.role === 'L2' && !user.category_id) {
+    let effectiveCategoryId = user?.category_id;
+    if (user && user.role === 'L2' && !effectiveCategoryId) {
+      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
+      if (dbUser && dbUser.category_id) {
+        effectiveCategoryId = dbUser.category_id;
+      }
+    }
+
+    if (user && user.role === 'L2' && !effectiveCategoryId) {
       return res.status(403).json({ error: 'Akun teknisi Anda belum terhubung ke kategori manapun' });
     }
```

---

### [BUG-011] Pencarian Kontak Direktori Tanpa Debounce dan Kontrol Pembatalan Request
- **Status:** `[OPEN]`
- **Lokasi:** `frontend/src/App.jsx` (perkiraan baris 4647 dan 350–380)
- **Severity:** **LOW**
- **Kategori:** Race Condition & Performance
- **Akar Masalah & Skenario Pemicu:**  
  Input pencarian modal *Start New Chat* memanggil `handleSearchContacts(e.target.value)` secara langsung pada setiap event `onChange` tanpa batas waktu tunda (debounce) maupun `AbortController`. Ketika pengguna mengetik cepat ("kominfo"), 7 request HTTP dikirimkan secara serentak. Jika respons untuk "k" tiba setelah respons untuk "kominfo", daftar kontak akan menampilkan hasil pencarian usang untuk huruf "k".
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/frontend/src/App.jsx
+++ b/frontend/src/App.jsx
@@ -884,6 +884,7 @@ function MainApp() {
   const [isSearchingContacts, setIsSearchingContacts] = useState(false);
+  const searchDebounceRef = useRef(null);
...
@@ -4644,7 +4645,14 @@ function MainApp() {
                     <input
                       type="text"
                       value={newChatSearchContact}
-                      onChange={e => handleSearchContacts(e.target.value)}
+                      onChange={e => {
+                        const val = e.target.value;
+                        setNewChatSearchContact(val);
+                        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
+                        searchDebounceRef.current = setTimeout(() => {
+                          handleSearchContacts(val);
+                        }, 300);
+                      }}
                       placeholder="Cari nama kontak HP, OPD/SKPD, atau nomor WA..."
```

---

### [BUG-012] Akumulasi State/Handler Usang dan Unescaped JSX Entities Membatalkan Linter
- **Status:** `[OPEN]`
- **Lokasi:** `frontend/src/App.jsx` (baris ~859–870, 920, 950, 1060, 1336, 1338, 3284, 3418, 5854) & `frontend/src/main.jsx` (baris 36)
- **Severity:** **LOW**
- **Kategori:** Code Quality & Lint Compliance
- **Akar Masalah & Skenario Pemicu:**  
  Eksekusi `npm run lint` menghasilkan 53 errors dan 2 warnings. Hal ini disebabkan oleh:
  1. Deklarasi 20+ variabel state dan handler modal assign lama yang telah dipindahkan ke Pusat Kendali Panel Kanan namun kodenya tidak dibersihkan.
  2. Karakter kutip dua `"` di dalam JSX tanpa entitas HTML `&quot;` (baris 3284 dan 3418).
  3. Variabel error yang tidak terpakai pada blok `catch (e)`.
  4. Ketiadaan prop-types pada `ErrorBoundary` di `main.jsx`.
- **Rekomendasi Solusi Teknis (Diff):**
```diff
--- a/frontend/src/App.jsx
+++ b/frontend/src/App.jsx
@@ -3281,7 +3281,7 @@ function MainApp() {
                       {activeTicket.customer?.wa_push_name && activeTicket.customer.wa_push_name !== activeTicket.customer.name && (
                         <div className="text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded mt-1.5 ml-6 border border-gray-200">
                           <span className="text-gray-400 block text-[9px] uppercase font-semibold">Nama Profil WhatsApp:</span>
-                          <span className="italic font-medium text-gray-600">"{activeTicket.customer.wa_push_name}"</span>
+                          <span className="italic font-medium text-gray-600">&quot;{activeTicket.customer.wa_push_name}&quot;</span>
                         </div>
                       )}
@@ -3415,7 +3415,7 @@ function MainApp() {
                                               {ht.solution && (
                                                 <p className="text-gray-700 italic text-[10px] line-clamp-2">
-                                                  "{ht.solution}"
+                                                  &quot;{ht.solution}&quot;
                                                 </p>
                                               )}
```
*(Dan menghapus variabel state/handler yang tidak lagi direferensikan).*

---

## 3. Rencana Bertahap Pelaksanaan Perbaikan (Phased Implementation Plan)

Perbaikan kode sumber akan dieksekusi secara bertahap setelah mendapatkan persetujuan tertulis dari Lead / User:

1. **Fase 1: Keamanan & Otorisasi Kritis (Security & Access Control)**
   - Perbaikan `[BUG-001]` (IDOR `unlinkHtsTicket`).
   - Perbaikan `[BUG-007]` (Fail-fast secret key HTS).
   - Perbaikan `[BUG-010]` (Fallback basis data RBAC L2 `returnTicket`).

2. **Fase 2: Integritas State Mesin & Transaksi Basis Data (State & Transaction Integrity)**
   - Perbaikan `[BUG-002]` (State guard & proteksi aduan `closeGeneralChat`).
   - Perbaikan `[BUG-004]` (Cascading deletion `TicketHts` di `reportController.js`).
   - Perbaikan `[BUG-005]` (Null safety di `authController.js:getMe`).
   - Perbaikan `[BUG-006]` (Pemeriksaan `isNaN` di seluruh parameter controller).

3. **Fase 3: Resiliensi Berkas & Sinkronisasi Real-Time (Storage & E2E Contracts)**
   - Perbaikan `[BUG-008]` (Penghapusan berkas yatim piatu di `/uploads` saat error WA).
   - Perbaikan `[BUG-009]` (Penyelarasan payload event `ticket_updated` Socket.io).

4. **Fase 4: Optimasi Frontend & Kualitas Kode (Frontend UX & Lint Compliance)**
   - Perbaikan `[BUG-003]` (Penyempurnaan dependency array `activeTicket?.id` untuk mencegah reset destruktif).
   - Perbaikan `[BUG-011]` (Debounce pencarian direktori kontak).
   - Perbaikan `[BUG-012]` (Pembersihan dead code, escape JSX, dan pemenuhan standar `npm run lint`).
   - Verifikasi regresi: `npm run lint` (0 error) dan `npm run build` (lulus).

---
*Dokumen ini diterbitkan dalam status **[OPEN]** dan menunggu konfirmasi sebelum modifikasi kode sumber dijalankan.*
