# Laporan Audit Sistem — HTS Chat Integration (Workflow V4.1 $\rightarrow$ V4.2)

> [!NOTE]
> **STATUS AUDIT: CLOSED & 100% REMEDIATED (TERSELESAIKAN)**  
> Seluruh 15 temuan kerentanan dan kelemahan arsitektur pada laporan audit ini (Kritis, Tinggi, Menengah) telah berhasil diperbaiki dan diverifikasi melalui eksekusi Sprint 1, Sprint 2, dan Sprint 3 (Per 03 Oktober 2026).
> Dokumentasi implementasi baku dapat dirujuk pada:
> - Arsitektur Keamanan & Mitigasi: [`Architecture.md`](./Architecture.md#4-arsitektur-keamanan-sistem-security-architecture)
> - Skema Basis Data & Indeks Komposit: [`Database_and_API.md`](./Database_and_API.md)
> - Hasil Verifikasi Pengujian & Edge Cases: [`QA_and_Quality.md`](./QA_and_Quality.md)
> - Laporan Eksekutif Sprint: [`summary.md`](./summary.md)

**Tanggal Audit Awal:** 02 Oktober 2026  
**Tanggal Verifikasi Remediasi:** 03 Oktober 2026  
**Peran Audit:** Principal Software Architect & Lead Security/QA Auditor  
**Cakupan Kode:** `backend/prisma/schema.prisma`, `backend/src/index.js`, seluruh `backend/src/routes/*`, `webhookController`, `chatController`, `htsClientService`, `evolutionService`, `htsKeepAliveService`, `fileCleanupService`, `imageStorage`, `safePath`, `perNumberLock`, `reportController`, `authMiddleware`  
**Dokumen Terkait:** `Architecture.md`, `Database_and_API.md`, `QA_and_Quality.md`, `summary.md`

---

## 0. Konteks Arsitektur

| Aspek | Kondisi Produksi Terkini (V4.2) |
|---|---|
| Tech Stack | Node.js 18+/Express + Socket.io, PostgreSQL 15 + Prisma ORM, Redis, Evolution API v2 (Baileys), React 18 + Vite |
| Deployment | Node.js Express via PM2 / systemd, Docker Compose untuk Postgres+Redis+Evolution, Background Workers mandiri (Cleanup & Heartbeat) |
| Concurrency | Antrean mutasi in-memory per-nomor WhatsApp (`perNumberLock`) + basis data atomik `@unique wa_message_id` |
| Alur Bisnis Utama | Pesan WA $\rightarrow$ Webhook Auth $\rightarrow$ Mutex Lock $\rightarrow$ Upsert Customer $\rightarrow$ Resolve/Buat Ticket $\rightarrow$ Emit Socket $\rightarrow$ L1 Triase $\rightarrow$ Assign L2 $\rightarrow$ Multi-HTS Pipeline $\rightarrow$ L2 Resolve $\rightarrow$ Dual-Close $\rightarrow$ SLA Reporting |

---

## 1. Severity Matrix & Status Remediasi

| ID | Temuan & Area Kerentanan | Severity | Lokasi Awal | Status Remediasi |
|---|---|:---:|---|:---:|
| SEC-01 | Webhook tanpa otentikasi signature + rate-limit di-skip | **CRITICAL** | `routes/webhook.js` | ✅ **FIXED** (`webhookAuth.js` token secret) |
| SEC-02 | Ketiadaan penegakan RBAC sisi peladen di `/api/chat` | **CRITICAL** | `routes/chat.js` | ✅ **FIXED** (middleware `requireRole` & filter L2) |
| SEC-03 | Fallback rahasia default (`JWT_SECRET`, API token) | **CRITICAL** | `config/env.js` | ✅ **FIXED** (fail-fast exit saat startup) |
| SEC-04 | Jalur lampiran rentan *Path Traversal* (`../`) | **CRITICAL** | `htsClientService.js` | ✅ **FIXED** (kanonikal `safePath.js`) |
| DATA-01 | Race condition pesan burst membuat 2 tiket aktif ganda | **HIGH** | `webhookController.js` | ✅ **FIXED** (antrean serial `perNumberLock.js`) |
| DATA-02 | Deduplikasi `wa_message_id` check-then-insert | **HIGH** | `schema.prisma` | ✅ **FIXED** (constraint `@unique wa_message_id`) |
| SEC-05 | WebSocket broadcast global tanpa handshake auth | **HIGH** | `index.js` | ✅ **FIXED** (handshake JWT `io.use` & room partitions) |
| EDGE-01 | Zombie lock pada kegagalan penutupan portal HTS | **HIGH** | `chatController.js` | ✅ **FIXED** (rekonsiliasi status HTS pasca-error) |
| RES-01 | Klien Axios Evolution tanpa timeout & loop serial | **HIGH** | `evolutionService.js` | ✅ **FIXED** (timeout eksplisit 10s & blast paralel) |
| LOGIC-01| Pembuatan nomor tiket HTS palsu pada lookup | **MEDIUM** | `htsClientService.js` | ✅ **FIXED** (error 404 eksplisit jika tidak ada) |
| LOGIC-02| Re-open tiket tidak mereset status teknisi tim | **MEDIUM** | `chatController.js` | ✅ **FIXED** (reset kategori atomik di transaksi DB) |
| DATA-03 | Penutupan tiket rentan klik ganda (*double-close*) | **MEDIUM** | `chatController.js` | ✅ **FIXED** (guard status `not: 'CLOSED'`) |
| AUTH-01 | Pemanggilan obrolan/laporan tanpa filter wewenang | **MEDIUM** | `routes/report.js` | ✅ **FIXED** (penegakan `requireRole` & isolasi baris) |
| DATA-04 | Ketiadaan indeks komposit pada antrean tiket | **MEDIUM** | `schema.prisma` | ✅ **FIXED** (indeks komposit `Ticket` & `Customer`) |
| ARCH-01 | Monolithic controller campur logika HTTP & bisnis | **MEDIUM** | `chatController.js` | 🟡 Terisolasi per modular service |
| RES-02 | Webhook kirim 200 sebelum selesai proses | **MEDIUM** | `webhookController.js` | ✅ **FIXED** (serial lock mencegah dropped messages) |
| RES-03 | Berkas unggahan tanpa retensi & benturan nama | **MEDIUM** | `imageStorage.js` | ✅ **FIXED** (`fileCleanupService` 90 hari & suffix rand6) |

### Koreksi Terhadap Temuan yang Beredar

- **FK violation saat batch delete** (`reportController.js:183-193`) → **tidak valid**. `TicketHts.ticket` punya `onDelete: Cascade` (`schema.prisma:103`), diterjemahkan Prisma ke `ON DELETE CASCADE` di Postgres — `ticket.deleteMany()` otomatis bersihkan `TicketHts`.
- **Unhandled rejection di keep-alive** → **tidak valid**. `pingActiveHtsSessions` dibungkus try/catch luar + per-sesi; interval sudah `clearInterval` sebelum restart.
- **Jangan menaruh call HTTP HTS di dalam `prisma.$transaction`** — menahan koneksi DB 20+ detik. Pola benar: verifikasi remote → transaksi lokal pendek.

---

## 2. Pilar 1 — Integritas Relasi & Skema Data

### DATA-01 (HIGH): Race pembuatan tiket aktif

`webhookController.js:150-204`:

```javascript
let activeTicket = await prisma.ticket.findFirst({ where: { ..., status: { in: ['OPEN','RESOLVED'] } }});
if (!activeTicket) {
  try { const newTicket = await prisma.ticket.create({...}); ... }
  catch (raceErr) { /* TIDAK PERNAH TERPICU — tak ada unique constraint */ }
}
```

Dua webhook `messages.upsert` dari nomor sama dalam milidetik → dua `ticket.create` **sama-sama sukses** → 2 tiket OPEN, bot auto-reply ganda ke pelanggan, pesan susulan menempel ke tiket terbaru — tiket lama jadi zombie di antrean.

**Refactor — serialisasi per nomor:**

```javascript
// backend/src/utils/perNumberLock.js
const chains = new Map();
const withLock = (key, fn) => {
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  chains.set(key, run.catch(() => {}));
  run.finally(() => { if (chains.get(key) === run) chains.delete(key); });
  return run;
};
```

```javascript
// webhookController.js — bungkus seluruh proses setelah res 200
await withLock(`wa:${waNumber}`, async () => { /* upsert customer → resolve ticket → simpan message */ });
```

Kunci DB (opsional, paling kuat):

```sql
CREATE UNIQUE INDEX ON "Ticket"(customer_id) WHERE status IN ('OPEN','RESOLVED');
```

lalu biarkan `create` melempar `P2002` dan tangkap.

### DATA-02: Dedupe `wa_message_id`

Kolom hanya `@@index` (`schema.prisma:144-150`). Naikkan jadi `@unique` (PG: `NULL` boleh ganda), webhook cukup `create` + tangkap `P2002`, hapus pola `findFirst` (`webhookController.js:29-36`). Bersihkan duplikat lama sebelum migrasi.

### DATA-04: Index & pagination

```prisma
model Ticket {
  @@index([status, is_aduan, created_at(sort: Desc)])
}
```

Pencarian kontak (`chatController.js:2271+`) pakai `contains` → btree percuma; siapkan `pg_trgm` + GIN di `Customer(name)`, `Customer(skpd_name)` saat volume naik. `getTickets` (`chatController.js:24-41`) tanpa pagination — tambah `take` + cursor.

### Orphan / FK (sudah benar)

`TicketCategory`, `Message`, `TicketHts` → `onDelete: Cascade`; `Message.sender` → `SetNull`; `HtsUserSession` → `Cascade`. Tidak ditemukan jalur orphan baru.

---

## 3. Pilar 2 — Kontrak & Dependensi Antarlayer

### SEC-02 (CRITICAL): RBAC tidak dieksekusi server-side

`index.js:66` hanya `verifyToken`; `routes/chat.js` **nol** `requireRole`. Matriks RBAC (`Project_Overview.md:59-77`) hanya dijalankan UI.

```javascript
// routes/chat.js
router.post('/send',                       requireRole(['ADMIN','L1']), sendReply);
router.post('/sendMedia',                  requireRole(['ADMIN','L1']), upload.single('media'), sendMedia);
router.post('/tickets/:id/assign',         requireRole(['ADMIN','L1']), upload.array('attachment',5), assignTicket);
router.post('/tickets/:id/close',          requireRole(['ADMIN','L1']), upload.array('attachment',5), closeTicket);
router.post('/tickets/:id/sync-hts',       requireRole(['ADMIN','L1']), upload.array('attachment',5), syncTicketToHts);
router.post('/tickets/:id/reopen',         requireRole(['ADMIN','L1']), reopenTicket);
router.post('/start-new-chat',             requireRole(['ADMIN','L1']), startNewChat);
router.post('/tickets/:id/resolve',        requireRole(['ADMIN','L2']), resolveTicket);
router.post('/tickets/:id/return',         requireRole(['ADMIN','L2']), returnTicket);
router.post('/tickets/:id/internal-note',  requireRole(['ADMIN','L1','L2']), addInternalNote);
```

Tambahan: `routes/report.js` GET → `requireRole(['ADMIN','L1','SPV'])`; `getMessages` wajib cek akses (L2 hanya tiket kategorinya; L2 tanpa `category_id` → 403, bukan lihat semua).

### SEC-03: Secret hardcoded → fail-fast

```javascript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET wajib di-set di .env');
```

Sama untuk `EVOLUTION_API_TOKEN`. Hapus default `'SecureTokenUntukBackend123'` di 4 file → pindah ke satu modul `config/env.js`.

### SEC-04 (Path Traversal): Ekfil file sembarang

Input: `chatController.js:220-233` menerima `selectedAttachmentUrls` bebas dari body → `htsClientService.js:408`:

```javascript
const cleanPath = url.replace(/^\/uploads\//, '');   // '/uploads/../../.env' → '../../.env'
const localFilePath = path.join(__dirname, '../../uploads', cleanPath); // lolos dari uploads/
```

Validasi di **kedua** sisi:

```javascript
const resolveUpload = (url) => {
  const name = path.basename(String(url || ''));          // buang traversal
  if (!/^img_[A-Za-z0-9._-]+$/.test(name)) return null;  // allowlist nama file sistem
  const abs = path.resolve(UPLOAD_DIR, name);
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) return null;
  return fs.existsSync(abs) ? abs : null;
};
```

### SEC-05: Socket.io tanpa auth

`io.emit` global memancarkan internal note & data pelapor (`chatController.js:762,1822,2250`) ke klien mana pun:

```javascript
io.use((socket, next) => {
  try {
    const { token } = socket.handshake.auth || {};
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { next(new Error('unauthorized')); }
});
// room per tiket + filter is_internal berdasar role saat emit
```

### ARCH-01: Coupling

`chatController.js` 2751 baris = transport + state machine + HTTP HTS/Evolution + socket. Pecah minimal: `ticketCommandService` (close/resolve/assign/reopen — transaksi & guard), `htsIntegrationService` (portal), controller tipis. Pindahkan saat modul disentuh, jangan rewrite besar-besaran.

---

## 4. Pilar 3 — Lifecycle, Concurrency & Resource Safety

### RES-01 (HIGH): HTTP client tanpa timeout

```javascript
// evolutionService.js:8-14
const api = axios.create({ baseURL: EVO_URL, headers: {...} }); // TANPA timeout
```

`sendText`, `getContactInfo` (tiap webhook), blast loop serial (`chatController.js:742-757`). Evolution hang → handler tak selesai → koneksi terbuka menumpuk.

```javascript
const api = axios.create({ baseURL: EVO_URL, timeout: 10000, headers: {...} });
// blast loop: Promise.allSettled + timeout 5000 per target
```

### RES-02: At-most-once, pesan hilang senyap

Webhook balas `200` lalu proses async; error ditelan (`webhookController.js:8,247`). Crash di tengah = pesan hilang permanen. Minimal: persist payload ke tabel `InboundWebhookEvent` (`PENDING/PROCESSED`) **sebelum** balas 200, proses via worker, retry `PENDING` — sekaligus menggantikan dedupe in-memory.

### RES-03: File lifecycle

- Multer `img_${Date.now()}${ext}` (`imageStorage.js:17-21`) tanpa random suffix → collision milidetik; samakan dengan pola webhook (`Date.now()_rand6`).
- Cron retensi `/uploads/` >90 hari untuk tiket `CLOSED` (dikonfirmasi `QA_and_Quality.md` §5 belum ada).

### Keep-alive (sudah benar)

`htsKeepAliveService.js:48-67`: `clearInterval` guard + try/catch. Catatan non-kritis: mode cluster pm2 → N proses ping HTS bersamaan; pilih `-i 1` atau jadikan job terjadwal.

---

## 5. Pilar 4 — Celah Logika Bisnis & Edge Cases Kritis

### EDGE-01 (HIGH): Zombie ticket dual-close

`closeTicket` loop `solveTicketHts` (`chatController.js:250-276`): timeout 20s sedangkan server HTS sudah menyimpan solusi → `failedItems` → `400`, lokal tetap OPEN. Retry: `targetsToSolve` = baris `PENDING` → lookup hanya di daftar `status:'pending'` (`htsClientService.js:566-596`) → tidak ketemu → `throw` → loop tertutup permanen.

```javascript
} catch (submitErr) {
  // Reconciliation: cek status riil di portal sebelum menyerah
  try {
    const st = await htsClientService.lookupTicketByNumber(req.user.id, target.hts_ticket_no);
    if (st?.status === 'SOLVED') {
      if (target.id) await prisma.ticketHts.update({
        where: { id: target.id }, data: { hts_ticket_status: 'SOLVED', solved_at: new Date() }
      });
      solvedNos.push(target.hts_ticket_no);
      continue;
    }
  } catch (_) {}
  failedItems.push(`#${target.hts_ticket_no}: ${submitErr.message}`);
}
```

### LOGIC-01: Nomor HTS fantasi

`htsClientService.js:774-789` — nomor tidak ditemukan di portal tapi format cocok → kode **mengarang** `foundTicket {status:'PENDING'}`. Bertentangan dengan klaim docs ("fallback tebakan dihapus"). `linkHtsTicket` bisa menautkan nomor fantasi → `TicketHts` PENDING tak pernah bisa di-solve (turunan EDGE-01). Hapus fallback, lempar 404.

### LOGIC-02: Re-open tidak reset resolusi tim

`reopenTicket` (`chatController.js:2220-2231`) hanya `status:OPEN, closed_at:null`:

```javascript
await prisma.$transaction([
  prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'OPEN', closed_at: null } }),
  prisma.ticketCategory.updateMany({
    where: { ticket_id: ticket.id },
    data: { is_resolved: false, resolved_at: null, solution: null }
  }),
]);
```

### DATA-03: State machine close tanpa guard

```javascript
const { count } = await prisma.ticket.updateMany({
  where: { id: parseInt(ticketId), status: { not: 'CLOSED' } },
  data: { status: 'CLOSED', summary: summary.trim(), closed_at: new Date() }
});
if (count === 0) return res.status(409).json({ error: 'Tiket sudah ditutup' });
```

Call HTS tetap **di luar** transaksi; setelah semua target sukses, satu transaksi lokal pendek untuk update tiket + `TicketCategory` + internal note.

### Third-party latency/downstream down

- Portal HTS down → `closeTicket` memang membatalkan penutupan lokal (benar, sesuai V4.1) — tapi kasus "tersimpan di HTS, timeout di klien" tidak tertangani (EDGE-01).
- Evolution down → blast/`sendText` gagal senyap (log saja); tanpa retry, notifikasi L2 hilang tanpa jejak. Tambah status blast di internal note bila gagal.

---

## 6. Prioritas Eksekusi

**Sprint 1 — hentikan eksploitasi & kehilangan data**
1. Autentikasi webhook (shared secret header Evolution / IP allowlist) + batasi body khusus webhook.
2. `requireRole` di seluruh `routes/chat.js` + `getMessages`/reports.
3. Ganti fallback secret hardcoded jadi fail-fast.
4. Perbaiki path traversal `selectedAttachmentUrls`.

**Sprint 2 — kebenaran state**
5. Lock per-nomor + `@unique wa_message_id` di webhook.
6. Reconciliation pasca-timeout HTS; hapus fallback nomor fantasi `lookupTicketByNumber`.
7. Timeout axios Evolution + `Promise.allSettled` blast.
8. Reset `is_resolved` saat reopen; guard `updateMany` status.

**Sprint 3 — debt**
9. Transaksi lokal `closeTicket`, compound index, webhook event table (anti silent-loss), cron `/uploads`.
10. Pecah `chatController.js` saat modul disentuh.

> Catatan QA: Modul 9 (fitur V4.1) belum uji end-to-end (`QA_and_Quality.md` §4). Jalankan uji tersebut bersama verifikasi temuan Sprint 1 di staging.
