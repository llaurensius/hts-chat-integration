# 🔍 Laporan Audit Arsitektur & Rencana Perbaikan (Action Plan)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Peran Auditor:** Senior Software Architect & QA Specialist  
**Tanggal Audit:** 02 Oktober 2026  
**Status Dokumen:** Acuan Resmi Perbaikan Stabilitas & Skalabilitas  

---

## 📌 1. Ringkasan Eksekutif Audit

Audit menyeluruh telah dilakukan pada seluruh layer sistem (*Database Schema, Backend Core Controller, HTS Engine Service, Webhook Pipeline, dan Frontend State Lifecycle*). Sistem saat ini sudah berjalan fungsional, namun terdapat beberapa celah arsitektural (*bottlenecks, race conditions, missing indexes, dan memory leak*) yang berpotensi memicu kegagalan sistem saat volume pesan WhatsApp meningkat atau data riwayat aduan semakin besar.

---

## 🚦 2. Matriks Prioritas Temuan & Rencana Tindakan

| No | Kategori | Tingkat Urgensi | Masalah Arsitektural | Lokasi Berkas | Dampak Jika Dibiarkan | Status |
|:--:|---|:---:|---|---|---|:---:|
| 1 | **Concurrency** | **P0 (Kritis)** | Race Condition pembuatan Pelanggan & Tiket pada Webhook paralel | `backend/src/controllers/webhookController.js` | Error DB `P2002 Unique constraint` dan satu percakapan terpecah menjadi 2 tiket `OPEN` | ⏳ Direncanakan |
| 2 | **Performance** | **P0 (Kritis)** | Missing Index pada kolom `ticket_id` di tabel `Message` | `backend/prisma/schema.prisma` | Full Table Scan (Seq Scan), loading chat melambat drastis saat tabel berisi puluhan ribu pesan | ⏳ Direncanakan |
| 3 | **Relasi Data** | **P1 (Tinggi)** | Missing `onDelete: Cascade` pada `TicketCategory` & `Message` | `backend/prisma/schema.prisma` | Foreign key constraint violation (`P2003`) saat Admin menghapus tiket | ⏳ Direncanakan |
| 4 | **Memory Leak** | **P1 (Tinggi)** | Registrasi ganda listener Socket.io tanpa global cleanup | `frontend/src/App.jsx` | Heap size browser meningkat, audio chime berbunyi ganda (2x-3x) saat tab dibiarkan lama | ⏳ Direncanakan |
| 5 | **Storage Leak** | **P2 (Sedang)** | Penamaan file upload tanpa entropy acak & tanpa retensi | `backend/src/controllers/webhookController.js` | File tertimpa jika masuk di milidetik yang sama; disk server penuh tanpa cleanup | ⏳ Direncanakan |
| 6 | **Arsitektur** | **P2 (Sedang)** | Dualisme SSOT data tiket HTS (`Ticket` vs `TicketHts`) | `backend/src/controllers/chatController.js` & `reportController.js` | Inkonsistensi data ketika 1 percakapan memiliki lebih dari 1 tiket HTS | ⏳ Direncanakan |
| 7 | **Race Condition** | **P2 (Sedang)** | CSRF Invalidation pada concurrent submit HTS | `backend/src/services/htsClientService.js` | Error `403 Forbidden CSRF Mismatch` jika 2 petugas submit HTS di detik yang sama | ⏳ Direncanakan |

---

## 🛠️ 3. Rincian Teknis Temuan & Panduan Perbaikan Kode

---

### 🔹 Temuan 1 (P0): Race Condition Inbound Webhook Customer & Ticket
- **Lokasi:** `backend/src/controllers/webhookController.js`
- **Gejala:** Pelanggan mengirim teks dan gambar sekaligus dalam rentang < 500ms. Dua event webhook masuk bersamaan dan mengeksekusi `findUnique` yang sama-sama menghasilkan `null`, lalu keduanya mengeksekusi `create`.
- **Rencana Perbaikan:**
  1. Ganti `findUnique + create` pelanggan dengan `prisma.customer.upsert`.
  2. Bungkus logika pencarian dan pembuatan tiket aktif dalam blok `try/catch` atomik agar jika request kedua bentrok, ia otomatis fallback mengambil tiket yang baru saja dibuat oleh request pertama.

```javascript
// Target Kode Perbaikan:
const customer = await prisma.customer.upsert({
  where: { wa_number: waNumber },
  update: (!fromMe && resolvedName && resolvedName !== waNumber) ? { name: resolvedName } : {},
  create: {
    wa_number: waNumber,
    name: resolvedName,
    is_custom_name: false
  }
});

let ticketId;
const activeTicket = await prisma.ticket.findFirst({
  where: { 
    customer_id: customer.id, 
    status: { in: ['OPEN', 'RESOLVED'] } 
  },
  orderBy: { created_at: 'desc' }
});

if (!activeTicket) {
  try {
    const newTicket = await prisma.ticket.create({
      data: { 
        customer_id: customer.id, 
        status: 'OPEN',
        is_aduan: false,
        service_type: 'GENERAL_CHAT'
      }
    });
    ticketId = newTicket.id;
  } catch (raceErr) {
    const fallbackTicket = await prisma.ticket.findFirst({
      where: { customer_id: customer.id, status: { in: ['OPEN', 'RESOLVED'] } },
      orderBy: { created_at: 'desc' }
    });
    ticketId = fallbackTicket ? fallbackTicket.id : null;
  }
} else {
  ticketId = activeTicket.id;
}
```

---

### 🔹 Temuan 2 & 3 (P0 & P1): Integritas Skema Database & Pengindeksan Performa
- **Lokasi:** `backend/prisma/schema.prisma`
- **Gejala:**
  - Tabel `Message` tidak memiliki indeks pada kolom `ticket_id` dan `created_at`.
  - Tabel `TicketCategory` dan `Message` tidak memiliki trigger `onDelete: Cascade` ke `Ticket`.
- **Rencana Perbaikan:**
  Perbarui deklarasi model pada `schema.prisma` lalu jalankan `npx prisma db push`:

```prisma
model TicketCategory {
  ticket_id   Int
  category_id Int
  is_resolved Boolean   @default(false)
  resolved_at DateTime?
  solution    String?   @db.Text
  ticket      Ticket    @relation(fields: [ticket_id], references: [id], onDelete: Cascade)
  category    Category  @relation(fields: [category_id], references: [id], onDelete: Cascade)

  @@id([ticket_id, category_id])
}

model Message {
  id             Int        @id @default(autoincrement())
  ticket_id      Int
  ticket         Ticket     @relation(fields: [ticket_id], references: [id], onDelete: Cascade)
  sender_type    SenderType
  sender_id      Int?
  sender         User?      @relation(fields: [sender_id], references: [id], onDelete: SetNull)
  message_text   String?
  attachment_url String?
  wa_message_id  String?
  is_internal    Boolean    @default(false)
  created_at     DateTime   @default(now())

  @@index([ticket_id])
  @@index([ticket_id, created_at])
  @@index([wa_message_id])
}
```

---

### 🔹 Temuan 4 (P1): Pembersihan Global Event Listener Socket.io Frontend
- **Lokasi:** `frontend/src/App.jsx`
- **Gejala:** Hook `useEffect` mendaftarkan listener `new_message`, `ticket_assigned`, dsb. dengan ketergantungan `[currentUser]`. Re-render memicu penumpukan listener di memory.
- **Rencana Perbaikan:**
  Pastikan registrasi listener Socket.io memiliki cleanup handler yang melepas seluruh listener secara mutlak dan dijalankan secara stabil:

```javascript
useEffect(() => {
  socket.on('new_message', handleNewMessage);
  socket.on('ticket_assigned', handleTicketAssigned);
  socket.on('ticket_closed', handleTicketClosed);
  socket.on('customer_updated', handleCustomerUpdated);

  return () => {
    socket.off('new_message', handleNewMessage);
    socket.off('ticket_assigned', handleTicketAssigned);
    socket.off('ticket_closed', handleTicketClosed);
    socket.off('customer_updated', handleCustomerUpdated);
  };
}, []); // Listener global lifecycle stabil
```

---

### 🔹 Temuan 5 (P2): Penambahan Entropi Acak pada Nama Berkas Gambar Webhook
- **Lokasi:** `backend/src/controllers/webhookController.js`
- **Gejala:** `const filename = img_${Date.now()}.jpg;` rentan collision jika 2 gambar diterima bersamaan.
- **Rencana Perbaikan:**
  Tambahkan random entropy:
  ```javascript
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const filename = `img_${Date.now()}_${randomSuffix}.jpg`;
  ```

---

### 🔹 Temuan 6 (P2): Penyelarasan Single Source of Truth (SSOT) Multi-HTS
- **Lokasi:** `backend/src/controllers/reportController.js` & `chatController.js`
- **Gejala:** Kolom legacy `Ticket.hts_ticket_no` tertimpa jika 1 percakapan memiliki > 1 tiket HTS.
- **Rencana Perbaikan:**
  Pastikan seluruh query laporan dan kalkulasi antarmuka membaca array relasi `Ticket.hts_tickets` sebagai rujukan utama.

---

## 📅 4. Tahapan Eksekusi Perbaikan (Execution Checklist)

- [ ] **Step 1:** Perbarui skema Prisma (`onDelete: Cascade` dan `@@index`), lalu jalankan `npx prisma db push`.
- [ ] **Step 2:** Refactor `webhookController.js` untuk mengeliminasi race condition pembuatan customer/tiket dan collision nama berkas.
- [ ] **Step 3:** Bersihkan lifecycle listener Socket.io di `frontend/src/App.jsx`.
- [ ] **Step 4:** Verifikasi query database dan performa sistem pasca-perbaikan.
