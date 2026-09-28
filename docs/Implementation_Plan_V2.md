# 🛠️ Rencana Implementasi Fitur Tambahan (Workflow V2.2)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Dokumen:** Panduan Teknis & Roadmap Eksekusi  
**Status:** Draf Perencanaan Siap Eksekusi (*Ready for Phased Execution*)

---

## 📌 Ringkasan 3 Fitur yang Akan Diimplementasikan

1. **Fitur 1: Pengaturan Auto-Reply Bot & Sakelar On/Off (Khusus Dispatcher L1)**
   - Menu tersendiri di sidebar untuk akun L1.
   - Textarea untuk mengubah teks balasan otomatis secara dinamis tanpa restart server.
   - Sakelar (*Toggle Switch*) untuk mengaktifkan / menonaktifkan bot sewaktu-waktu.
   - Hak akses terbatas: **Hanya L1 saja**.
2. **Fitur 2: Penghapusan Rekap Hasil Aduan & Reset Data Pengujian (Khusus Admin)**
   - Kotak centang (*checkbox*) per baris pada tabel Rekap Hasil Aduan.
   - Tombol 🟥 **"Hapus Terpilih"** untuk menghapus beberapa tiket yang dicentang.
   - Tombol ⚠️ **"Hapus Semua Data"** dengan konfirmasi ganda untuk mengosongkan seluruh tiket, pesan, dan data kontak testing (*fresh start*).
   - Hak akses terbatas: **Hanya Admin saja**.
3. **Fitur 3: Pengaturan Multi-Kontak WhatsApp Blast L2 Dinamis (Khusus Admin)**
   - Menu tersendiri di sidebar untuk akun Admin (misal: "Kontak Tim L2").
   - 3 Kartu Manajemen Tim: **Network**, **Server**, dan **Mechanical & Electrical (M&E)**.
   - Penambahan personil/grup fleksibel tanpa batas (nomor HP teknisi maupun ID Grup WhatsApp `xxx@g.us`).
   - Saat tiket di-assign, bot otomatis melakukan *loop* blast ke seluruh kontak yang terdaftar di tim tersebut.
   - Hak akses terbatas: **Hanya Admin saja**.

---

## 🏗️ FASE 1: Penyesuaian Skema Database (Prisma ORM)

### 1.1 Penambahan Model `Setting`
Untuk menyimpan konfigurasi aplikasi dinamis (seperti status dan pesan auto-reply bot):
```prisma
model Setting {
  key        String   @id // Contoh: "auto_reply"
  value      String   @db.Text // Teks balasan bot
  is_active  Boolean  @default(true) // Sakelar ON / OFF
  updated_at DateTime @updatedAt
}
```

### 1.2 Penambahan Model `CategoryContact`
Untuk menyimpan daftar kontak tujuan WhatsApp Blast per tim L2 secara dinamis:
```prisma
model CategoryContact {
  id          Int      @id @default(autoincrement())
  category_id Int
  name        String   // Misal: "Budi (Teknisi 1)" atau "Grup Alert Network"
  wa_target   String   // Misal: "628123456789" atau "1203632948293@g.us"
  created_at  DateTime @default(now())
  category    Category @relation(fields: [category_id], references: [id], onDelete: Cascade)
}
```

Tambahkan relasi di model `Category`:
```prisma
model Category {
  id               Int               @id @default(autoincrement())
  name             String
  wa_target_number String?          // (Bisa dipertahankan sebagai legacy fallback)
  users            User[]
  tickets          TicketCategory[]
  contacts         CategoryContact[] // Relasi baru multi-kontak
}
```

### 1.3 Eksekusi Sinkronisasi Database
```bash
cd backend
npx prisma db push
```

---

## ⚙️ FASE 2: Pengembangan Backend (API & Controllers)

### 2.1 Modul Pengaturan Bot (`/api/settings`) - Khusus L1
- **File:** `backend/src/controllers/settingController.js` & `backend/src/routes/setting.js`
- **Endpoints:**
  - `GET /api/settings/autoreply`
    - Middleware: `verifyToken`, `requireRole(['L1'])`
    - Mengembalikan status `isActive` dan teks `message`.
  - `PUT /api/settings/autoreply`
    - Middleware: `verifyToken`, `requireRole(['L1'])`
    - Menerima body: `{ message: string, isActive: boolean }`.
    - Menyimpan ke tabel `Setting` (upsert).
- **Integrasi Webhook (`backend/src/controllers/webhookController.js`):**
  - Saat pesan masuk dari customer baru, baca pengaturan `auto_reply` dari tabel `Setting`.
  - Jika `is_active === true`, kirim balasan otomatis sesuai teks template yang tersimpan.
  - Jika `is_active === false`, jangan kirim pesan bot (hanya buat tiket dan pesan masuk).

### 2.2 Modul Hapus Rekapitulasi Tiket (`/api/reports`) - Khusus Admin
- **File:** `backend/src/controllers/reportController.js` & `backend/src/routes/report.js`
- **Endpoint:**
  - `DELETE /api/reports/tickets`
    - Middleware: `verifyToken`, `requireRole(['ADMIN'])`
    - Menerima body:
      - `{ ids: [1, 2, 3] }` (Hapus tiket-tiket terpilih).
      - `{ all: true }` (Hapus semua data tiket, pesan, lampiran, dan data customer testing).
    - Menghapus secara transaksional (`prisma.$transaction`) dengan urutan aman:
      1. Hapus `Message` terkait.
      2. Hapus `TicketCategory` terkait.
      3. Hapus `Ticket` terkait.
      4. Jika `all === true`, hapus juga seluruh data di tabel `Customer`.

### 2.3 Modul Manajemen Multi-Kontak L2 (`/api/admin/categories`) - Khusus Admin
- **File:** `backend/src/controllers/adminController.js` & `backend/src/routes/admin.js`
- **Endpoints:**
  - `GET /api/admin/categories/contacts`
    - Mengambil daftar 3 tim (`Network`, `Server`, `M&E`) beserta kontak-kontak yang terdaftar di dalamnya.
  - `POST /api/admin/categories/:categoryId/contacts`
    - Menambah kontak baru (nama personil/grup & nomor WA / ID grup).
  - `DELETE /api/admin/categories/contacts/:contactId`
    - Menghapus kontak teknisi.
- **Pembaruan Logika Blast (`backend/src/controllers/chatController.js` -> `assignTicket`):**
  - Ambil relasi `contacts` dari masing-masing kategori yang ditugaskan.
  - Lakukan *loop* pengiriman pesan WhatsApp Blast via Evolution API ke seluruh nomor/grup yang terdaftar di tim tersebut.

---

## 🎨 FASE 3: Pengembangan Frontend UI (React & Tailwind)

### 3.1 Antarmuka Fitur 1: Auto-Reply Bot (Khusus L1)
- **Menu Sidebar:**
  - Tampilkan ikon Bot (`Bot` dari `lucide-react`) di sidebar kiri **hanya jika `currentUser.role === 'L1'`**.
- **Tampilan Halaman:**
  - Kartu kontrol utama:
    - Sakelar toggle status: **Balasan Otomatis Aktif / Nonaktif** (indikator hijau/abu-abu).
    - Textarea: Input pesan template sambutan (dengan karakter counter dan placeholder informatif).
    - Tombol simpan: **"Simpan Perubahan"** dengan notifikasi toast/alert sukses.

### 3.2 Antarmuka Fitur 2: Hapus Rekap Aduan (Khusus Admin)
- **Halaman Rekap Hasil Aduan:**
  - Tampilkan kolom kotak centang (*checkbox*) di tabel **hanya jika `currentUser.role === 'ADMIN'`**.
  - Checkbox di header tabel untuk *Select All*.
  - Di sebelah tombol "Export CSV", tambahkan 2 tombol aksi Admin:
    - 🟥 **"Hapus Terpilih (X)"**: Aktif jika ada baris yang dicentang.
    - ⚠️ **"Hapus Semua Data"**: Tombol peringatan merah dengan dialog konfirmasi pop-up ganda sebelum eksekusi.

### 3.3 Antarmuka Fitur 3: Pengaturan Tim & Kontak L2 (Khusus Admin)
- **Menu Sidebar:**
  - Tampilkan ikon kontak (`Radio` atau `PhoneCall` dari `lucide-react`) di sidebar kiri **hanya jika `currentUser.role === 'ADMIN'`**.
- **Tampilan Halaman:**
  - Menampilkan 3 kartu tim utama berdampingan atau *grid*:
    1. **Tim Network**
    2. **Tim Server**
    3. **Tim Mechanical & Electrical (M&E)**
  - Di dalam setiap kartu tim:
    - Daftar kontak/grup yang aktif beserta lencana tipe (*Personil* atau *Grup WA*).
    - Tombol hapus kontak (ikon sampah).
    - Form mini: Input Nama/Keterangan & Nomor WA / ID Grup, serta tombol "+ Tambah Kontak".

---

## 🧪 FASE 4: Skenario Pengujian Menyeluruh (Verification)

1. **Uji Fitur 1 (Auto-Reply Bot):**
   - Login sebagai `l1@helpdesk.go.id`.
   - Ubah template pesan sambutan bot, klik simpan.
   - Kirim pesan dari nomor baru WhatsApp: pastikan pesan balasan bot sesuai teks baru.
   - Ubah sakelar menjadi Nonaktif (Off). Kirim pesan baru: pastikan bot **tidak membalas**, namun tiket tetap terbentuk di dashboard.
   - Login sebagai Admin / L2: pastikan menu "Auto-Reply Bot" **tidak muncul**.
2. **Uji Fitur 2 (Hapus Rekap):**
   - Login sebagai L1: pastikan tombol hapus **tidak terlihat**.
   - Login sebagai Admin: centang 2 tiket pengujian, klik "Hapus Terpilih", pastikan tiket terhapus bersih.
   - Klik "Hapus Semua Data", konfirmasi: pastikan seluruh tiket dan riwayat kembali kosong (*fresh state*).
3. **Uji Fitur 3 (Multi-Kontak WA Blast):**
   - Login sebagai Admin, buka menu "Kontak Tim L2".
   - Daftarkan 2 nomor telepon pada Tim Network (misal nomor Anda dan nomor rekan).
   - Login sebagai L1, assign tiket ke Tim Network.
   - Pastikan kedua nomor tersebut menerima pesan WhatsApp Blast secara bersamaan.

---

*Panduan ini disusun untuk dieksekusi secara bertahap mulai dari Fase 1 hingga Fase 4.*
