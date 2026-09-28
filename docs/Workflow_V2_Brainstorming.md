# 🧠 Brainstorming Alur Kerja Baru (Workflow V2)

Dokumen ini berisi rancangan pembaruan alur kerja Helpdesk dan penambahan fitur baru berdasarkan hasil diskusi.

## 1. Alur Kerja Utama (Dispatcher -> L2 Routing)

Skenario penyelesaian tiket akan dirombak menjadi lebih terstruktur:

1. **Inbound Chat:** Pesan masuk ke nomor WA Helpdesk dari Pelapor.
2. **Auto-Reply (Dinamis):** Bot Helpdesk langsung menjawab secara otomatis. *(Teks auto-reply ini nantinya bisa diubah-ubah sesuka hati melalui menu Pengaturan di Dashboard).*
3. **Dispatcher Assignment (L1):** 
   - Agen L1 (Helpdesk) membaca pesan di Dashboard.
   - L1 menugaskannya (Assign) ke kategori masalah tertentu (misal: Troubleshooting -> Server).
4. **Auto-Notification ke Teknisi (L2):** 
   - Setelah tiket di-assign, Bot akan **otomatis mengirimkan pesan WhatsApp** ke nomor Teknisi L2 (atau Grup WA terkait).
   - Pesan berisi ringkasan kendala dan **Link URL** menuju tiket tersebut.
5. **Penanganan L2 (View-Only):** 
   - Teknisi L2 mengklik link dan masuk ke Dashboard.
   - Teknisi **hanya melihat (View-Only) riwayat percakapan dan detail tiket**, sebagai bekal informasi untuk melakukan perbaikan di lapangan/sistem. Teknisi *tidak perlu* membalas chat ke pelapor.

---

## 2. Fitur Pendukung Workflow (Disetujui)

Untuk mendukung kolaborasi antara L1 dan L2 tanpa mengganggu pelapor, ditambahkan dua fitur esensial:

1. **Status "Pekerjaan Selesai" (L2 to L1):** 
   Teknisi L2 akan memiliki tombol khusus **"Tandai Selesai"**. Saat ditekan, status tiket berubah (misal menjadi `RESOLVED`), memberikan notifikasi ke L1 bahwa perbaikan lapangan sudah rampung. Namun, wewenang untuk menutup tiket secara resmi (menjadi `CLOSED`) dan membalas pelapor tetap berada di tangan L1.
2. **Catatan Internal (Internal Notes):** 
   Tersedia tab atau kotak pesan khusus di Dashboard yang bersifat internal (rahasia). L2 dapat meninggalkan pesan teknis di sini (contoh: *"Kabel FO sudah disambung ulang"*), yang nantinya akan dibaca oleh L1 dan diramu bahasanya sebelum dikirimkan ke pelapor.

---

## 3. Pertimbangan Tambahan & Edge Cases (Disetujui)

Berdasarkan hasil diskusi lanjutan, berikut adalah penanganan untuk kasus-kasus spesifik:

1. **Kasus "Salah Kamar" (Salah Assign Kategori):**
   - **L2** memiliki tombol **"Kembalikan ke L1"** jika mereka merasa kendala tersebut bukan ranah divisinya.
   - **L1** memiliki wewenang untuk **"Re-Assign"** (memindahkan) tiket tersebut ke divisi lain (misal dari Server ke Network).
2. **Sistem Login & Hak Akses (RBAC):**
   - Mengingat perbedaan fungsi layar (L1 bisa chat, L2 view-only + notes), aplikasi akan dilengkapi dengan **Sistem Login**.
   - Setiap pengguna (L1, L2 Server, L2 Network, dsb) akan memiliki kredensial masing-masing sehingga sistem bisa menampilkan tombol dan batasan wewenang yang tepat.
3. **Peringatan Batas Waktu (SLA):**
   - Sistem akan memiliki fitur batas waktu penyelesaian (SLA). Tiket yang melewati batas waktu akan ditandai khusus.
   - *Catatan:* Fitur SLA disepakati untuk diimplementasikan **belakangan (Fase Lanjutan)** agar rilis fitur utama V2 bisa lebih cepat (Agile).

---

## 2. Struktur Kategori Baru (Klasifikasi Tiket)

Sistem *Tagging* sebelumnya akan diperluas menjadi hierarki kategori yang lebih spesifik. Ini juga bisa diatur (CRUD) nantinya melalui menu Master Data di Dashboard.

*Rancangan Kategori:*
- **Troubleshooting**
  - Core Network
  - Distribution Network
  - Email
  - Internet Desa
  - Mechanical & Electrical (M&E)
  - Server
- **Request** (Permintaan layanan/akses)
- **Monitoring** (Laporan pantauan)

*Catatan Teknis:* Setiap sub-kategori ini nantinya di-mapping ke **Nomor WA Teknisi/Grup L2** yang bertanggung jawab agar notifikasi (Langkah 4) terkirim ke orang yang tepat.

---

## 3. Dukungan Media (Gambar & Dokumen)

**Inbound (Pelapor ➡️ Helpdesk):**
- Saat pelapor mengirim gambar, payload dari Evolution API akan mengandung `imageMessage` (base64/mediaKey).
- Backend (Node.js) bertugas mengunduh/menyimpan gambar tersebut ke folder lokal (misal: `backend/uploads/`).
- URL gambar (`http://localhost:3000/uploads/gambar.jpg`) disimpan di kolom `attachment_url` pada tabel `Message`.
- Frontend merender tag `<img src="...">` di dalam balon obrolan.

**Outbound (Helpdesk ➡️ Pelapor):**
- Frontend ditambahkan tombol 📎 (Attachment) di sebelah tombol Kirim.
- Agen memilih file gambar, mengunggahnya ke Backend.
- Backend menembak endpoint `/message/sendMedia` milik Evolution API ke nomor pelapor.

---

## 4. Kebutuhan Modifikasi Teknis (Next Steps)

Jika alur ini disetujui, berikut adalah langkah teknis yang akan dieksekusi:

1. **Database Update:** 
   - Menambahkan tabel `TicketCategory` dan merelasikannya ke tiket.
   - Menambahkan kolom `whatsapp_group_id` atau `technician_wa_number` pada Master Data Kategori/Divisi.
2. **Backend Update:**
   - Menambahkan logika ekstraksi *Image/Media* pada Webhook.
   - Menambahkan API Outbound untuk Media (Upload + SendMedia).
   - Menambahkan fungsi *Trigger Blast WA* saat L1 menekan tombol "Assign to L2".
3. **Frontend Update:**
   - Menambahkan fitur Upload File.
   - Mengubah UI Chat Bubble agar bisa merender gambar (Image Preview).
   - Membuat Form *Assign Ticket* (menggantikan atau melengkapi fitur Modal Penutupan Tiket sebelumnya).
