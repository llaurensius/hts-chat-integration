# 📘 Panduan Operasional Harian & SOP (Operational Guide)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi:** Workflow V2.2  
**Status:** Produksi  

Dokumen ini adalah pedoman operasional standar (*Standard Operating Procedure* - SOP) bagi seluruh petugas Helpdesk, Dispatcher L1, Teknisi L2, Supervisor, dan Administrator dalam menjalankan tugas harian.

---

## 🎧 1. Prosedur Operasional Dispatcher L1 (Garda Depan)

Dispatcher L1 bertindak sebagai pengelola utama alur komunikasi aduan pelanggan dan penanggung jawab siklus tiket.

### Tahap 1: Menerima Aduan Baru
1. Saat pelanggan mengirim pesan WhatsApp, sistem otomatis membuat tiket berstatus **`OPEN`** dan Bot membalas dengan pesan sambutan (jika bot aktif).
2. Tiket baru akan muncul di kolom kiri **"Antrean Aduan"** berlabel abu-abu **`[Belum Ditugaskan]`**.
3. Klik tiket tersebut untuk membuka ruang percakapan.
4. Dispatcher dapat langsung membalas pelanggan melalui kotak chat di bagian bawah (mendukung pesan teks dan tombol 📎 untuk mengirim gambar penjelasan).

### Tahap 2: Menugaskan / Mengubah Tim L2 (Smart Multi-Assign)
1. Jika kendala membutuhkan penanganan teknis lapangan, klik tombol **"Assign ke L2"** (atau **"Ubah / Tambah Tim L2"** jika tiket sudah memiliki penugasan sebelumnya).
2. Pada modal yang muncul:
   - **Centang Tim Tujuan:** Pilih satu atau beberapa tim sekaligus (`Network`, `Server`, dan/atau `Mechanical & Electrical (M&E)`).
   - **Tim yang Sedang Bertugas:** Otomatis tercentang (*pre-fill*) dan memiliki tanda `(Sedang Ditugaskan)`.
   - **Menambah Tim:** Cukup centang tim tambahan tanpa khawatir tim lama terhapus (sistem menggunakan mode *merge*).
   - **Melepas Tim:** Jika Anda menghapus centang pada tim yang sedang bertugas, sistem akan memunculkan dialog konfirmasi peringatan sebelum penugasan dilepas.
   - **Pilih Jenis Layanan:** Tentukan apakah aduan bertipe *Troubleshooting (Gangguan)*, *Request Layanan*, atau *Monitoring*.
3. Klik **"Simpan Penugasan"**.
4. WhatsApp Blast otomatis dikirimkan **hanya ke tim yang baru ditambahkan** untuk mencegah spam notifikasi berulang.

### Tahap 3: Memantau Progres Penanganan Tim L2
- Pada header obrolan tiket, Dispatcher dapat melihat status real-time masing-masing tim:
  - Label Hijau: `✓ Network: Selesai`
  - Label Oranye: `⏳ Server: Sedang Dikerjakan`
- Jika seluruh tim telah menyelesaikan kendala, tiket otomatis berstatus **`RESOLVED`** (berlabel biru di antrean).

### Tahap 4: Menutup Tiket Secara Resmi (Official Closure)
1. Hubungi kembali pelanggan via chat untuk memastikan layanan telah berfungsi normal.
2. Klik tombol **"Selesaikan"** di header atas.
3. Modal penutupan tiket akan terbuka:
   - **Kategori Masalah Otomatis Tercentang:** Sistem otomatis mencentang kategori masalah sesuai tim L2 yang ditugaskan awal (diberi tanda `Penugasan L2`).
   - Anda tetap dapat menambah atau menyesuaikan centang kategori jika pada tahap akhir ada kategori tambahan yang perlu dicatat untuk laporan.
   - **Wajib Mengisi Kesimpulan Penanganan:** Minimal 10 karakter (contoh: *"Penggantian router core dan restart server selesai tuntas. Jalur internet normal kembali"*).
4. Klik **"Tutup Tiket"**. Tiket resmi berstatus `CLOSED` dan otomatis dipindahkan ke menu **Rekap Hasil Aduan**.

### Tahap 5: Pengaturan Auto-Reply Bot
1. Klik menu **"Auto-Reply Bot"** (ikon robot 🤖) di sidebar kiri.
2. Gunakan sakelar toggle untuk mengaktifkan (🟢 Hijau) atau menonaktifkan (⚪ Abu-abu) balasan otomatis bot.
3. Ubah teks pesan template sambutan sesuai kebutuhan operasional (gunakan variabel `{nomor_tiket}` untuk menyisipkan ID tiket otomatis).
4. Klik **"Simpan Pengaturan"**.

---

## 🔧 2. Prosedur Operasional Teknisi L2 (Spesialis Lapangan)

Teknisi L2 bertugas menyelesaikan permasalahan teknis sesuai keahlian bidangnya.

### Tahap 1: Menerima Tugas
1. Teknisi menerima notifikasi tugas baru di WhatsApp (baik di nomor pribadi maupun di grup tim WA) dari bot Helpdesk.
2. Buka dashboard web (`http://localhost:5173` atau alamat IP LAN kantor `http://192.168.10.100:5173`).
3. Login menggunakan akun bidang masing-masing (`l2_network`, `l2_server`, atau `l2_me`).
4. Antrean hanya akan menampilkan tiket aduan yang didelegasikan ke tim Anda.

### Tahap 2: Menganalisis Kendala & Koordinasi Internal
1. Klik tiket aduan untuk membaca riwayat keluhan dan gambar lampiran dari pelapor.
2. *Catatan Penting:* Teknisi L2 berada dalam mode **View-Only** (tidak bisa membalas langsung ke nomor WhatsApp pelapor guna mencegah simpang siur informasi).
3. **Catatan Internal Berlabel Tim:**
   - Gunakan kolom kuning bertuliskan *"Catatan Internal Tim [Nama Tim]"* di bawah layar.
   - Ketik progres lapangan (misal: *"Sedang penarikan kabel FO lantai 2"*).
   - Catatan yang dikirim otomatis berlabel identitas tim dan nama teknisi: `🏷️ Catatan Internal - Tim Network (Teknisi Network L2)`. Catatan ini dijamin privat dan hanya dibaca oleh tim internal helpdesk.

### Tahap 3: Menandai Selesai atau Melepas Penugasan
- **Jika Kendala Tim Anda Sudah Beres:**  
  Klik tombol hijau **"Tandai Selesai"**. Status tim Anda akan berubah menjadi `✓ Bagian Anda Selesai`. Jika ada tim lain yang masih bekerja, biarkan tiket tetap berjalan hingga tim lain menyelesaikan bagiannya.
- **Jika Kendala Bukan di Ranah Tim Anda (Salah Kamar):**  
  Klik tombol **"Kembalikan / Lepas"**. Masukkan alasan singkat (misal: *"Diperiksa tidak ada kendala di sisi server, murni gangguan jalur link network"*). Tim Anda akan langsung dilepas dari tiket tersebut tanpa mengganggu proses kerja tim lain.

---

## 👑 3. Prosedur Administrator

Administrator memegang kendali penuh atas tata kelola sistem, manajemen pengguna, pengaturan kontak blast L2, dan pembersihan data.

### 1. Visibilitas Global
- Admin dapat melihat antrean aduan L1 dan seluruh kategori L2 secara bersamaan.

### 2. Manajemen Pengguna (User Management)
- Masuk ke menu **"Users"** di sidebar kiri.
- Tambah akun baru: Masukkan Nama, Email, Password, Role (`L1`, `L2`, `SPV`, atau `ADMIN`), dan pilih Kategori tim jika rolenya `L2`.
- Menghapus akun staf yang sudah tidak aktif (sistem memproteksi agar akun admin yang sedang login tidak dapat menghapus dirinya sendiri).

### 3. Pengaturan Kontak & Target WhatsApp Blast Tim L2
- Masuk ke menu **"Kontak Tim L2"** (ikon pemancar 📡) di sidebar kiri.
- Menampilkan 3 kartu tim utama: **Tim Network**, **Tim Server**, dan **Tim Mechanical & Electrical**.
- **Menambah Kontak:**
  - Masukkan Nama/Keterangan personil atau grup.
  - Masukkan Nomor WhatsApp (`08xxx` / `628xxx`) atau ID Grup WhatsApp (`xxx@g.us`).
  - Klik **"+ Tambah ke Tim"**.
- **Mengedit Kontak (Inline Edit):**
  - Klik ikon pensil ✏️ di sebelah kontak.
  - Ubah nama atau nomor langsung di baris tersebut.
  - Klik ikon centang hijau ✔️ untuk menyimpan atau silang ✖️ untuk membatalkan.
- **Menghapus Kontak:**
  - Klik ikon sampah 🗑️ dan konfirmasi penghapusan.

### 4. Pembersihan Data Rekap Aduan (Testing Cleanup)
- Masuk ke menu **"Rekap Hasil Aduan"**.
- **Hapus Terpilih:** Centang satu atau beberapa kotak tiket, lalu klik tombol merah **"Hapus Terpilih (X)"**.
- **Hapus Semua Data & Reset Nomor ID:**
  - Klik tombol merah mencolok ⚠️ **"Hapus Semua Data"**.
  - Masukkan kata konfirmasi `HAPUS`.
  - Sistem akan menghapus bersih seluruh pesan, tiket, lampiran, dan pelanggan testing, serta **mereset urutan nomor ID tiket kembali ke angka 1** (*fresh state*).

---

## 📊 4. Prosedur Supervisor (SPV)

1. **Monitoring Antrean:** Memantau distribusi tiket aktif dan memastikan SLA penanganan berjalan baik.
2. **Rekap Hasil Aduan & Export CSV:**
   - Masuk ke tab **"Rekap Hasil Aduan"** (ikon dokumen di sidebar).
   - Melihat tabel laporan historis tiket: Pelapor, Status, Jenis Layanan, Tim Terkait, Waktu Masuk, Durasi Penanganan, dan Kesimpulan Solusi.
   - Klik tombol hijau **"Export CSV"** untuk mengunduh berkas laporan berkala siap olah di Excel/Spreadsheet.
