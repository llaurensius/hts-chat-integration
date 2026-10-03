# 📄 Laporan Analisis & Rencana Implementasi Perbaikan (HTS Chat Integration)

Dokumen ini memuat analisis mendalam mengenai 2 bug operasional, 1 kebutuhan peningkatan URL dashboard dinamis pada notifikasi WhatsApp, serta analisis potensi bug lain yang teridentifikasi dalam sistem.

---

## 📌 Ringkasan Masalah yang Dilaporkan

| No | Isu / Permintaan | Status Perbaikan | Modul Terkait |
|---|---|---|---|
| 1 | **Multi-Tiket HTS pada Tim yang Sama**: Tiket 1 Network sudah solved, tiket 2 Network belum solved. L2 tidak terkunci lagi di panel atas; tombol Selesaikan HTS di panel kanan dibatasi khusus L1. | **✅ SELESAI (Fixed)** | `App.jsx`, `chatController.js` (`resolveTicket`, `TicketCategory`) |
| 2 | **Notifikasi WA ke L2 via Panel Kanan**: Tautkan / Terbitkan tiket HTS di panel kanan otomatis mengirim pesan WA ke tim L2 dengan detail nomor HTS. | **✅ SELESAI (Fixed)** | `chatController.js` (`createTicketHts`, `linkHtsTicket`) |
| 3 | **URL Dashboard Dinamis pada Pesan WA**: URL dashboard di pesan WA otomatis menyesuaikan host aktif (localhost saat dev, IP/Domain saat di VPS), tidak lagi mencetak string koma. | **✅ SELESAI (Fixed)** | `chatController.js` (`getDynamicFrontendUrl`) |

---

## 🔍 Analisis Mendalam & Akar Masalah (Root Cause)

### 1. Bug Multi-Tiket HTS & Hak Akses L2 vs L1

#### A. Konfirmasi Hak Akses (L1 vs L2)
- **Aturan Bisnis**: Benar, **penyelesaian tiket resmi ke portal HTS Diskomdigi sepenuhnya merupakan wewenang L1** (Helpdesk).
  - Pada backend, route `POST /tickets/:ticketId/hts/:htsId/solve` diproteksi ketat dengan `requireRole(['ADMIN', 'SPV', 'L1'])`. L2 tidak memiliki sesi akun HTS (`HtsUserSession`).
  - **Kelemahan UI saat ini**: Di Panel Kanan (kartu tiket HTS), tombol **"Selesaikan HTS"** saat ini dirender untuk *semua role* (termasuk L2) tanpa validasi `isL1 || isAdmin`. Jika L2 mengkliknya dan mengisi form, L2 akan mendapatkan error HTTP 403 Forbidden (*Akses ditolak*).

#### B. Penyebab L2 Terkunci di Panel Atas
- Relasi kategori di database menggunakan tabel `TicketCategory` dengan composite primary key `@@id([ticket_id, category_id])`.
- Artinya, hanya ada **1 baris status `is_resolved` untuk 1 Tim/Kategori pada 1 obrolan tiket**, tidak peduli berapa banyak tiket HTS yang diterbitkan untuk tim tersebut.
- **Kronologi terjadinya bug**:
  1. Tiket 1 (Network) diterbitkan dan ditugaskan ke Tim Network.
  2. Tim Network menyelesaikan penanganan Tiket 1 dan menekan tombol **"Tandai Selesai"** di panel atas.
  3. Baris `TicketCategory` untuk Tim Network diperbarui menjadi `is_resolved = true`.
  4. Komponen tombol panel atas di `frontend/src/App.jsx` membaca status `isMyTeamResolved = myCatRelation?.is_resolved`. Karena bernilai `true`, tombol "Tandai Selesai" diganti dengan teks pasif:
     ```jsx
     <span className="...">Bagian Anda Selesai</span>
     ```
  5. Saat L1 menerbitkan atau menautkan **Tiket 2 (Network)** yang berstatus `PENDING`:
     - Fungsi `createTicketHts` maupun `linkHtsTicket` **tidak mereset status `is_resolved` tim Network kembali ke `false`**.
     - Akibatnya, bagi teknisi L2 Network, tombol panel atas tetap bertuliskan *"Bagian Anda Selesai"* (terkunci), dan L2 tidak bisa lagi menginputkan catatan solusi teknis untuk Tiket 2.

---

### 2. Notifikasi WhatsApp ke L2 dari Panel Kanan Tidak Berjalan

#### Penyebab:
- Pada **Panel Atas** (`assignCategory` / `POST /tickets/:ticketId/assign-category`), terdapat kode integrasi Evolution API yang mengambil data nomor kontak teknisi/grup dari `CategoryContact` dan melakukan blast WhatsApp dengan template:
  `🚨 *TUGAS BARU DARI HELPDESK (L2)* 🚨 ...`
- Sebaliknya, pada fungsi aksi di **Panel Kanan**:
  1. `createTicketHts` (Terbitkan Tiket HTS): Hanya membuat record `TicketHts` dan catatan internal obrolan. Sama sekali tidak ada kode pengiriman WhatsApp ke tim L2.
  2. `linkHtsTicket` (Tautkan Nomor HTS): Menambahkan `TicketCategory`, tetapi sama sekali tidak memanggil fungsi pengiriman WhatsApp ke tim L2.
  3. `syncTicketToHts` (Sinkronisasi HTS): Tidak memanggil pengiriman WhatsApp.

---

### 3. Masalah URL Dashboard pada Pesan WhatsApp

#### Penyebab:
- Di file `backend/.env`, variabel `FRONTEND_URL` berisi string multi-origin untuk keperluan CORS Socket.io:
  ```env
  FRONTEND_URL="http://localhost:5200,http://10.1.104.197:5200,https://10.1.104.197,http://10.1.104.197"
  ```
- Di kode backend (`chatController.js` baris 891):
  ```javascript
  const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  ```
- Variabel ini langsung dimasukkan mentah-mentah ke dalam teks template pesan WhatsApp. Akibatnya, pesan yang diterima teknisi L2 berisi keempat URL yang dipisahkan oleh koma.

#### Solusi Dinamis yang Dibutuhkan:
- Backend harus dapat mengekstrak origin dari HTTP Request pemanggil (`req.get('origin')` atau `req.headers.referer`):
  - Jika L1 sedang membuka aplikasi di `http://localhost:5200`, maka link dashboard di pesan WA adalah `http://localhost:5200`.
  - Jika L1 sedang membuka aplikasi di VPS/server jaringan kantor `http://10.1.104.197:5200`, maka link dashboard di pesan WA adalah `http://10.1.104.197:5200`.
  - Jika di-trigger dari background tanpa request origin, fallback mengambil entri URL pertama yang bersih.

---

## 🛠️ Rencana Implementasi Perbaikan (Implementation Plan)

### Langkah 1: Helper Terpusat untuk URL Dashboard & Blast WhatsApp (Backend)
1. **Helper `getDynamicFrontendUrl(req)`**:
   Mengekstrak origin request browser pemanggil secara dinamis:
   ```javascript
   function getDynamicFrontendUrl(req) {
     const origin = req?.get?.('origin') || req?.headers?.origin;
     if (origin && !origin.includes(',')) return origin;
     
     const referer = req?.get?.('referer') || req?.headers?.referer;
     if (referer) {
       try {
         const parsed = new URL(referer);
         return `${parsed.protocol}//${parsed.host}`;
       } catch (_) {}
     }
     
     const rawEnv = process.env.FRONTEND_URL || 'http://localhost:5200';
     return rawEnv.split(',')[0].trim();
   }
   ```
2. **Helper `sendL2TaskNotificationBlast({ ticket, category, req, serviceTypeDisplay, customTitle })`**:
   Membungkus logika blast WhatsApp ke `CategoryContact` / `wa_target_number` ke dalam satu fungsi terpusat yang reusable, sehingga format pesan, penanganan error, dan URL dinamis konsisten di semua titik panggilan.

### Langkah 2: Perbaikan Penugasan & Notifikasi di Panel Kanan (Backend)
1. **Pada `linkHtsTicket`**:
   - Jika `category_id` dipilih dan tim ditugaskan:
     - Buat/update relasi di `TicketCategory`.
     - **Reset `is_resolved = false`** jika tiket HTS yang ditautkan berstatus `PENDING`.
     - Panggil `sendL2TaskNotificationBlast(...)` untuk memberitahu tim L2.
2. **Pada `createTicketHts`**:
   - Pastikan relasi tim di `TicketCategory` dibuat jika belum ada.
   - **Reset `is_resolved = false`** untuk tim tersebut karena ada tiket HTS baru yang pending.
   - Panggil `sendL2TaskNotificationBlast(...)` dengan keterangan nomor aduan HTS yang baru diterbitkan.

### Langkah 3: Perbaikan Logika "Tandai Selesai" & Hak Akses UI (Frontend & Backend)
1. **UI Panel Kanan (`App.jsx`)**:
   - Sembunyikan tombol **"Selesaikan HTS"** jika user yang login adalah L2 (`!isL1 && !isAdmin`).
   - Tampilkan badge informasi bagi L2: *"Penyelesaian HTS dilakukan oleh L1"* atau cukup tombol *"Lihat Detail"* jika sudah selesai.
2. **Evaluasi Tombol "Tandai Selesai" di Panel Atas (`App.jsx`)**:
   - Periksa apakah tim L2 memiliki tiket HTS yang masih `PENDING` di tiket aktif ini:
     ```javascript
     const hasPendingHtsForMyTeam = activeTicket.hts_tickets?.some(
       ht => (ht.category_id === myCatRelation.category_id || ht.category?.name === myCatRelation.category?.name) 
             && ht.hts_ticket_status !== 'SOLVED'
     );
     // Jika masih ada tiket HTS pending untuk tim ini, jangan kunci tombol selesai!
     const isMyTeamReallyFinished = myCatRelation.is_resolved && !hasPendingHtsForMyTeam;
     ```
   - Dengan logika ini, meskipun L2 sudah pernah menandai selesai Tiket 1, saat Tiket 2 (Network) diterbitkan dan masih `PENDING`, tombol "Tandai Selesai" di panel atas **akan otomatis aktif kembali**.
3. **Backend `resolveTicket`**:
   - Ketika L2 submit solusi, selain memperbarui `TicketCategory`, sistem juga otomatis mengisi field `solution` pada tiket `TicketHts` milik tim tersebut yang masih berstatus `PENDING`.
   - Hal ini memudahkan L1 saat membuka modal penyelesaian HTS, karena solusi teknis dari L2 sudah otomatis terisi dan siap dikirim ke portal HTS.

---

## ⚠️ Potensi Bug Lain & Catatan Arsitektur (Potential Edge Cases)

1. **Anti-Spam Notifikasi WhatsApp**:
   - Jika L1 melakukan *assign* tim di panel atas LALU beberapa detik kemudian menerbitkan tiket HTS di panel kanan untuk tim yang sama, tim L2 berpotensi menerima 2 notifikasi WA beruntun.
   - *Mitigasi*: Buat deteksi jika tim baru saja dikirimi notifikasi dalam rentang 30 detik terakhir untuk tiket yang sama, notifikasi kedua disesuaikan bunyinya menjadi: *"Pembaruan Tiket HTS: Nomor #xxxx telah diterbitkan untuk penugasan ini."* atau tidak di-blast ulang jika belum ada nomor HTS baru.
2. **Kondisi Unlink Tiket HTS**:
   - Jika ada 2 tiket HTS (Tiket 1 & Tiket 2) lalu L1 me-unlink salah satunya, status `is_resolved` tim harus dicek ulang agar tidak menggantung.
3. **Sinkronisasi Otomatis Status RESOLVED**:
   - Ketika L2 menandai selesai di panel atas, status tiket induk chat menjadi `RESOLVED`. Namun di portal HTS, tiket fisiknya belum tentu `SOLVED` sampai L1 menutupnya. Sistem saat ini sudah memvalidasi ini di `handleCloseTicket` (L1 tidak bisa close tiket chat sebelum semua HTS solved).
