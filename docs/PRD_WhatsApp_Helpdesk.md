# 📋 Product Requirements Document (PRD)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi:** 2.0 (Workflow V2 - Multi-Assign & RBAC)  
**Status:** Produksi / Disetujui (*Approved & Implemented*)

---

## 1. Ringkasan Eksekutif & Tujuan Sistem
Sistem **HTS Chat Integration** adalah solusi terpadu yang menjembatani saluran komunikasi WhatsApp (sebagai kanal pelaporan aduan dari instansi/pelanggan) dengan Dasbor Web Helpdesk terpusat bagi tim internal.

Sistem dirancang untuk:
1. **Memangkas waktu respons aduan:** Pesan masuk otomatis direspons oleh Bot dan langsung terdistribusi ke antrean Dispatcher L1.
2. **Memfasilitasi kolaborasi lintas bidang teknis (*Many-to-One Collaboration*):** Satu tiket aduan dapat ditugaskan ke beberapa tim teknisi L2 sekaligus (misal tim Network dan Server) secara paralel tanpa memecah riwayat percakapan.
3. **Menjaga privasi komunikasi teknisi:** Tim teknisi L2 berfokus pada analisis teknis dan koordinasi via *Catatan Internal*, sementara interaksi langsung ke pelanggan tetap satu pintu melalui Dispatcher L1.
4. **Menghasilkan pelaporan siap saji:** Menghasilkan rekapitulasi data penanganan, durasi SLA, dan kesimpulan solusi akhir yang dapat diekspor ke format CSV.

---

## 2. Profil Pengguna (*User Personas*)

1. **Pelapor (PIC / Pelanggan WhatsApp):**
   - Mengirimkan laporan gangguan, permohonan layanan, atau konsultasi melalui WhatsApp.
   - Menerima balasan otomatis dan berinteraksi langsung dengan Dispatcher L1.
   - Mengirimkan tangkapan layar (foto/gambar) kendala.
2. **Dispatcher L1 (Garda Depan / Helpdesk):**
   - Melakukan triase aduan masuk, menentukan jenis layanan, dan menugaskan tiket ke tim teknisi L2 terkait.
   - Berkomunikasi langsung dua arah dengan pelapor via teks dan lampiran gambar.
   - Menutup tiket secara resmi setelah seluruh teknisi menyelesaikan tugasnya dan mengisi kesimpulan penanganan.
3. **Teknisi L2 (Spesialis Lapangan - Network, Server, M&E):**
   - Menerima notifikasi tugas otomatis (*WhatsApp Blast*).
   - Melihat riwayat aduan pelanggan dalam mode baca (*View-Only*).
   - Berkoordinasi antar teknisi menggunakan fitur *Catatan Internal*.
   - Menandai selesai penanganan bagian timnya atau mengembalikan penugasan jika bukan kewenangannya.
4. **Administrator (Super Admin):**
   - Memiliki visibilitas menyeluruh (bisa melihat antrean L1 dan L2 sekaligus).
   - Mengelola akun petugas (tambah, lihat, dan hapus pengguna L1/L2) serta penentuan kategori tim teknisi.
5. **Supervisor (SPV):**
   - Memantau kelancaran operasional antrean aduan secara *real-time*.
   - Mengakses data rekapitulasi, mengevaluasi durasi penanganan, dan mengunduh laporan bulanan.

---

## 3. Fitur Utama & Kriteria Keberhasilan (*Acceptance Criteria*)

### F1. Inbound Webhook & Auto-Reply Bot
- Sistem menerima pesan masuk dari WhatsApp melalui Evolution API v2.
- Jika nomor baru atau tiket sebelumnya sudah ditutup (`CLOSED`), sistem otomatis membuat tiket baru dan membalas seketika:  
  *"Baik untuk aduan akan kami cek dahulu mohon ditunggu."*
- Jika tiket pelanggan masih aktif (`OPEN` atau `RESOLVED`), pesan susulan otomatis digabungkan ke dalam tiket yang sedang berjalan.

### F2. Pertukaran Media Gambar Dua Arah (Bi-directional Images)
- **Pelapor ➡️ Helpdesk:** Foto kendala yang dikirim via WhatsApp otomatis diunduh, disimpan di `/uploads/`, dan dirender di dalam *bubble chat* dashboard web.
- **Helpdesk ➡️ Pelapor:** Dispatcher L1 dapat melampirkan file gambar penjelasan (maks. 10MB) yang otomatis terkirim langsung ke WhatsApp pelapor.

### F3. Pendelegasian Multi-Assign (Satu atau Banyak Tim L2)
- Dispatcher L1 dapat menugaskan tiket ke **satu, dua, atau tiga tim L2 sekaligus** via kotak centang (*checkbox*):
  - `Network`
  - `Server`
  - `Mechanical & Electrical (M&E)`
- Tiket akan langsung muncul di antrean semua teknisi tim yang dicentang secara bersamaan.

### F4. Klasifikasi Jenis Layanan (*Service Type*)
- Saat penugasan tiket, L1 dapat mengklasifikasikan jenis pekerjaan:
  - `TROUBLESHOOTING` (Penanganan Gangguan)
  - `REQUEST_LAYANAN` (Permintaan Layanan)
  - `MONITORING` (Pemantauan Sistem)
- Jenis layanan tercatat di tiket dan tampil pada rekap laporan CSV.

### F5. Notifikasi WhatsApp Blast ke Teknisi L2
- Saat tiket didelegasikan, sistem secara otomatis mengirim pesan WhatsApp ke nomor target teknisi/grup masing-masing tim yang ditugaskan, memuat ringkasan kendala, nama pelapor, dan link akses dashboard.

### F6. Ruang Kolaborasi Catatan Internal L2
- Teknisi L2 memiliki kolom input khusus *Catatan Internal* berwarna kuning.
- Catatan internal **hanya terlihat oleh tim internal di dashboard** dan **dijamin tidak terkirim** ke nomor WhatsApp pelapor.

### F7. Penyelesaian Mandiri Per-Tim (*Per-Team Resolution*)
- Masing-masing tim menandai selesai bagian kendalanya sendiri (`is_resolved = true`).
- Tiket utama tetap berstatus `OPEN` selama masih ada tim yang belum selesai, disertai indikator visual:  
  `[✓ Network: Selesai] | [⏳ Server: Sedang Dikerjakan]`.
- Status tiket utama otomatis berubah menjadi `RESOLVED` ketika **seluruh tim yang ditugaskan telah menyatakan selesai**.

### F8. Pelepasan Penugasan Mandiri (*Self-Unassign Return*)
- Teknisi L2 dapat mengembalikan penugasan timnya jika bukan ranah kewenangannya dengan menyertakan alasan.
- Tiket otomatis lepas dari antrean tim tersebut tanpa membatalkan penugasan tim lain yang masih bekerja.

### F9. Penutupan Resmi Tiket & Kesimpulan Solusi (*Mandatory Summary*)
- Tiket berstatus `RESOLVED` hanya dapat ditutup resmi (`CLOSED`) oleh Dispatcher L1 setelah mengonfirmasi kepuasan pelapor.
- L1 diwajibkan menuliskan ringkasan solusi penanganan (minimal 10 karakter) sebelum tiket dapat ditutup.

### F10. Dasbor Rekapitulasi & Export CSV
- Tab khusus rekapitulasi menampilkan seluruh riwayat tiket, waktu masuk, waktu selesai, durasi penanganan, tim terkait, jenis layanan, dan kesimpulan solusi.
- Tersedia tombol **"Export CSV"** untuk mengunduh rekap laporan dalam format spreadsheet.

### F11. Akses Jaringan Lokal (Multi-Device LAN Access)
- Seluruh antarmuka web dashboard dapat diakses oleh komputer lain di jaringan LAN / Wi-Fi lokal kantor melalui alamat IP host (port `5173`) secara dinamis tanpa perlu instalasi tambahan di perangkat klien.
