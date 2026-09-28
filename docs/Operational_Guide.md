# 📘 Panduan Operasional Harian & SOP (Operational Guide)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Status:** Produksi / Workflow V2

Dokumen ini adalah pedoman operasional standar (*Standard Operating Procedure* - SOP) bagi seluruh petugas Helpdesk, Dispatcher L1, Teknisi L2, dan Administrator dalam menjalankan tugas harian.

---

## 🎧 1. Prosedur Operasional Dispatcher L1 (Garda Depan)

Dispatcher L1 bertindak sebagai pengelola utama alur komunikasi aduan pelanggan.

### Tahap 1: Menerima Aduan Baru
1. Saat pelanggan mengirim pesan WhatsApp, sistem otomatis membuat tiket berstatus **`OPEN`** dan Bot membalas dengan pesan sambutan.
2. Tiket baru akan muncul di kolom kiri **"Antrean Aduan"** berlabel abu-abu **`[Belum Ditugaskan]`**.
3. Klik tiket tersebut untuk membuka ruang percakapan.
4. Dispatcher dapat langsung membalas pelanggan melalui kotak chat di bagian bawah (mendukung teks dan tombol 📎 untuk mengirim gambar penjelasan).

### Tahap 2: Menugaskan Tiket (Multi-Assign ke Tim L2)
1. Jika kendala membutuhkan penanganan teknis lapangan, klik tombol **"Assign ke L2"** di header atas.
2. Pada modal yang muncul:
   - **Centang Tim Tujuan:** Pilih satu atau beberapa tim sekaligus (`Network`, `Server`, dan/atau `Mechanical & Electrical (M&E)`).
   - **Pilih Jenis Layanan:** Tentukan apakah aduan bertipe *Troubleshooting (Gangguan)*, *Request Layanan*, atau *Monitoring*.
3. Klik **"Tugaskan L2"**.
4. Sistem otomatis mencatat catatan internal dan menembakkan pesan WhatsApp Blast ke grup/teknisi tim terkait.

### Tahap 3: Memantau Progres Penanganan Tim L2
- Pada header obrolan tiket, Dispatcher dapat melihat status real-time masing-masing tim:
  - Label Hijau: `✓ Network: Selesai`
  - Label Oranye: `⏳ Server: Sedang Dikerjakan`
- Jika seluruh tim telah menyelesaikan kendala, tiket otomatis berstatus **`RESOLVED`** (berlabel biru di antrean).

### Tahap 4: Menutup Tiket Secara Resmi (Official Closure)
1. Hubungi kembali pelanggan via chat untuk memastikan layanan telah berfungsi normal.
2. Klik tombol **"Selesaikan"** di header atas.
3. Konfirmasi tag kategori dan **wajib mengisi Kesimpulan Penanganan** (minimal 10 karakter, contoh: *"Kabel FO putus telah disambung dan switch core di-restart. Jalur internet normal kembali"*).
4. Klik **"Tutup Tiket"**. Tiket resmi berstatus `CLOSED` dan otomatis dipindahkan ke menu **Rekap Hasil Aduan**.

---

## 🔧 2. Prosedur Operasional Teknisi L2 (Spesialis Lapangan)

Teknisi L2 bertugas menyelesaikan permasalahan teknis sesuai keahlian bidangnya.

### Tahap 1: Menerima Tugas
1. Teknisi menerima notifikasi tugas baru di WhatsApp dari bot Helpdesk.
2. Buka dashboard web (`http://localhost:5173` atau alamat IP LAN kantor `http://192.168.10.100:5173`).
3. Login menggunakan akun bidang masing-masing (`l2_network`, `l2_server`, atau `l2_me`).
4. Antrean hanya akan menampilkan tiket aduan yang didelegasikan ke tim Anda.

### Tahap 2: Menganalisis Kendala & Koordinasi Internal
1. Klik tiket aduan untuk membaca riwayat keluhan dan gambar lampiran dari pelapor.
2. *Catatan Penting:* Teknisi L2 berada dalam mode **View-Only** (tidak bisa membalas langsung ke nomor WhatsApp pelapor guna mencegah simpang siur informasi).
3. Gunakan kolom kuning **"Tulis catatan internal L2..."** untuk menuliskan temuan lapangan atau berkoordinasi dengan tim teknisi lain. Catatan ini dijamin privat dan hanya dibaca oleh tim internal helpdesk.

### Tahap 3: Menandai Selesai atau Melepas Penugasan
- **Jika Kendala Tim Anda Sudah Beres:**  
  Klik tombol hijau **"Tandai Selesai"**. Status tim Anda akan berubah menjadi `✓ Bagian Anda Selesai`. Jika ada tim lain yang masih bekerja, biarkan tiket tetap berjalan hingga tim lain menyelesaikan bagiannya.
- **Jika Kendala Bukan di Ranah Tim Anda (Salah Kamar):**  
  Klik tombol **"Kembalikan / Lepas"**. Masukkan alasan singkat (misal: *"Diperiksa tidak ada kendala di sisi server, murni gangguan jalur link network"*). Tim Anda akan langsung dilepas dari tiket tersebut tanpa mengganggu proses kerja tim lain.

---

## 👑 3. Prosedur Administrator

1. **Visibilitas Global:** Admin dapat melihat antrean aduan L1 dan seluruh kategori L2 secara bersamaan.
2. **Manajemen Pengguna:**
   - Masuk ke tab **"Users"** di sidebar kiri.
   - Buat akun baru dengan mengisi Nama, Email, Password, Role (`L1`, `L2`, `SPV`, atau `ADMIN`), serta Kategori khusus jika rolenya adalah `L2`.
   - Menghapus akun yang sudah tidak aktif (sistem memproteksi agar Admin tidak dapat menghapus akunnya sendiri).

---

## 📊 4. Prosedur Supervisor (SPV)

1. **Monitoring Antrean:** Memantau distribusi tiket yang sedang aktif dan memastikan tidak ada tiket yang terbengkalai tanpa penugasan.
2. **Rekap Hasil Aduan & Export CSV:**
   - Masuk ke tab **"Rekap Hasil Aduan"** (ikon dokumen di sidebar).
   - Melihat tabel laporan historis tiket: Pelapor, Status, Jenis Layanan, Tim Terkait, Waktu Masuk, Durasi Penanganan, dan Kesimpulan Solusi.
   - Klik tombol hijau **"Export CSV"** untuk mengunduh rekapitulasi data siap buka di Microsoft Excel / Google Sheets untuk bahan paparan manajemen.

---

## 🛠️ 5. Troubleshooting Cepat (FAQ Operasional)

| Masalah | Kemungkinan Penyebab | Tindakan Solusi |
|---|---|---|
| Pesan WhatsApp masuk tidak muncul di antrean web | Server backend mati atau Evolution API terputus | Buka terminal server, jalankan `curl http://localhost:3000/api/chat/categories`. Jika mati, jalankan `npm run dev` di folder `backend`. |
| Gambar dari WhatsApp pelapor tidak muncul di web | File terkirim sebelum update payload limit | Sistem kini mendukung gambar hingga 50MB. Minta pelapor mengirimkan ulang gambarnya. |
| Komputer lain di kantor tidak bisa membuka web | Firewall memblokir port atau IP salah | Cek IP server via `hostname -I`. Pastikan port 5173 diizinkan (`sudo ufw allow 5173/tcp`). Buka via format `http://<IP_KOMPUTER>:5173`. |
| Sesi WhatsApp terputus / Logout | Nomor WA di HP ter-logout | Jalankan `node setupEvolution.js` di folder `backend` dan scan ulang QR code melalui WhatsApp Perangkat Tertaut. |
| Port 3000 / 5173 "Address already in use" | Proses Node.js sebelumnya masih menggantung | Eksekusi `killall node`, lalu jalankan ulang `npm run dev` pada backend dan frontend. |
