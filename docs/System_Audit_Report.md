# Laporan Audit Sistem — HTS Chat Integration (Workflow V4.1)

**Tanggal:** 02 Oktober 2026
**Peran Audit:** Principal Software Architect & Staff Security/QA Auditor
**Cakupan Kode:** `backend/prisma/schema.prisma`, `backend/src/index.js`, seluruh `backend/src/routes/*`, `webhookController`, `chatController` (2751 baris), `htsClientService`, `evolutionService`, `htsKeepAliveService`, `imageStorage`, `reportController`, `authMiddleware`
**Dokumen Terkait:** `Architecture.md`, `Database_and_API.md`, `QA_and_Quality.md`

---

## 0. Konteks Arsitektur

| Aspek | Kondisi |
|---|---|
| Tech Stack | Node.js 18+/Express + Socket.io, PostgreSQL 15 + Prisma ORM, Redis, Evolution API v2 (Baileys), React 18 + Vite |
| Deployment | Single-process `node src/index.js` / pm2, Docker Compose untuk Postgres+Redis+Evolution, tanpa antrean job (tanpa BullMQ/worker) |
| Concurrency | In-process async; webhook Evolution → REST → Prisma → Socket.io; call HTTP sinkron ke portal HTS (eksternal) di dalam handler request |
| Alur Bisnis Utama | Pesan WA → `POST /api/webhook/whatsapp` → upsert `Customer` → resolve/buat `Ticket` → simpan `Message` → emit `new_message` → L1 triase → `assign` ke L2 (`TicketCategory`) → terbitkan ke portal HTS (`TicketHts`, pipeline 3 tahap) → L2 `resolve` per-tim → L1 `close` (dual-close lokal + HTS) → rekap SLA (`/api/reports`) |

---

## 1. Severity Matrix

| ID | Temuan | Severity | Lokasi |
|---|---|:---:|---|
| SEC-01 | Webhook `POST /api/webhook/whatsapp` tanpa autentikasi/signature + rate-limit di-skip + body 50MB → injeksi pesan/tiket palsu, picu auto-reply spam ke nomor arbitrer | **CRITICAL** | `routes/webhook.js`, `index.js:37,42` |
| SEC-02 | Tanpa `requireRole` di seluruh `/api/chat` → L2/SPV bisa balas WA, close tiket, assign, sync HTS; L1 bisa `resolve` solusi tim L2 | **CRITICAL** | `index.js:66`, `routes/chat.js` |
| SEC-03 | Fallback secret hardcoded: `JWT_SECRET \|\| 'supersecretkey_hts'`, `EVOLUTION_API_TOKEN \|\| 'SecureTokenUntukBackend123'` → env kosong = token JWT dapat dipalsukan | **CRITICAL** | `authMiddleware.js:2`, `evolutionService.js:5`, `webhookController.js:64` |
| SEC-04 | Path traversal: `selectedAttachmentUrls` dari body → `url.replace(/^\/uploads\//,'')` + `path.join` tanpa normalisasi → baca file sembarang (termasuk `backend/.env` berisi JWT_SECRET & kredensial DB), diekfil ke portal HTS | **CRITICAL** | `htsClientService.js:404-421,656-680`; input: `chatController.js:220-233` |
| DATA-01 | Race webhook: `findFirst` active ticket lalu `create` tanpa unique constraint → 2 tiket OPEN paralel + auto-reply ganda; catch fallback percuma (create tidak error) | **HIGH** | `webhookController.js:150-204` |
| DATA-02 | Dedupe `wa_message_id` check-then-insert, kolom hanya `@@index` (bukan `@unique`) → pesan ganda saat burst | **HIGH** | `webhookController.js:29-36`, `schema.prisma:144-150` |
| SEC-05 | Socket.io `origin:'*'`, tanpa handshake auth, `io.emit` global → catatan internal (`isInternal:true`), nama & nomor pelapor mengalir ke klien tak terautentikasi | **HIGH** | `index.js:11-16,82-88`; emit: `chatController.js:1822` |
| EDGE-01 | Zombie ticket: timeout HTS setelah tersimpan di server → lokal `400`, retry → lookup daftar `PENDING` gagal → `400` selamanya | **HIGH** | `chatController.js:250-298`, `htsClientService.js:563-597` |
| RES-01 | `axios.create` Evolution **tanpa timeout**; blast loop serial `await` tanpa timeout → Evolution hang = antrean request menumpuk | **HIGH** | `evolutionService.js:8-14`, `chatController.js:742-757` |
| LOGIC-01 | `lookupTicketByNumber` masih memalsukan tiket (`status:'PENDING'` fallback format nomor) → link nomor HTS yang tidak ada di portal | **MEDIUM** | `htsClientService.js:774-789` |
| LOGIC-02 | `reopenTicket` tidak reset `TicketCategory.is_resolved` → semua tim tampak selesai padahal tiket OPEN | **MEDIUM** | `chatController.js:2197-2231` |
| DATA-03 | Multi-write `closeTicket` tanpa `$transaction`, tanpa guard state machine (double-click/close ganda) | **MEDIUM** | `chatController.js:250-361` |
| AUTH-01 | `getMessages` tanpa cek role/kepemilikan; L2 dengan `category_id=null` melihat semua tiket; `GET /api/reports/tickets` tanpa `requireRole` | **MEDIUM** | `chatController.js:15,50-77`, `routes/report.js` |
| DATA-04 | Index kurang: query `status IN + is_aduan + ORDER BY created_at` tanpa compound; pencarian `ILIKE` butuh `pg_trgm` GIN | **MEDIUM** | `schema.prisma:94-96` |
| ARCH-01 | `chatController.js` 2751 baris: HTTP + bisnis + HTTP eksternal + socket campur → kegagalan bubaran jadi partial mutation | **MEDIUM** | `chatController.js` |
| RES-02 | Webhook balas `200` dulu lalu proses async + `catch → console.error` → crash = pesan hilang senyap (at-most-once), tanpa antrean/retry | **MEDIUM** | `webhookController.js:8,247-249` |
| RES-03 | `/uploads` tanpa retensi cron; nama multer `img_${Date.now()}${ext}` tanpa suffix random → collision antar-upload | **MEDIUM** | `imageStorage.js:17-21` |

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
