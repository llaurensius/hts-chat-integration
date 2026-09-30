# 📘 Panduan Operasional Harian & SOP (Operational Guide)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi:** Workflow V3.0 (Full HTS Diskomdigi Integration)  
**Status:** Produksi  

Dokumen ini adalah pedoman operasional standar (*Standard Operating Procedure* - SOP) bagi seluruh petugas Helpdesk, Dispatcher L1, Teknisi L2, Supervisor, dan Administrator dalam menjalankan tugas harian.

---

## 🎧 1. Prosedur Operasional Dispatcher L1 (Garda Depan)

Dispatcher L1 bertindak sebagai pengelola utama alur komunikasi aduan pelanggan, penanggung jawab siklus tiket, dan operator sinkronisasi ke portal resmi HTS Diskomdigi Jawa Tengah.

### Tahap 1: Menghubungkan Akun Portal HTS (Koneksi Sesi Petugas)
1. Periksa panel kanan **"Portal HTS Diskomdigi"**.
2. Jika berstatus **`Belum Terhubung`**:
   - Klik tombol **"Hubungkan Akun HTS"**.
   - Sistem akan memuat gambar CAPTCHA numerik live dari server portal HTS.
   - Masukkan **Email HTS Petugas** dan **Password HTS**.
   - Ketikkan **Kode CAPTCHA** yang tampil di layar (jika gambar kurang jelas, klik ikon putar 🔄 untuk merefresh gambar captcha).
   - Klik **"Login ke Portal HTS"**.
3. Status pada panel kanan akan berubah menjadi **`Terhubung sebagai: nama_email`** berbadge hijau. Sesi ini tersimpan di sistem sehingga Anda tidak perlu login berulang kali selama sesi masih aktif.

---

### Tahap 2: Menerima Aduan Baru & Verifikasi Identitas
1. Saat pelanggan mengirim pesan WhatsApp, sistem otomatis membuat tiket berstatus **`OPEN`** dan Bot membalas pesan sambutan (jika bot aktif).
2. Tiket baru akan muncul di kolom kiri **"Antrean Aduan"** berlabel abu-abu **`[Belum Ditugaskan]`**.
3. Klik tiket tersebut untuk membuka ruang percakapan.
4. **Verifikasi Identitas Pelapor:**
   - Periksa nama pelapor dan instansi pada header chat atau panel detail tiket.
   - Jika perlu diedit, klik tombol pensil (✏️) untuk memperbarui nama atau nama dinas/SKPD pelapor secara permanen.

---

### Tahap 3: Menerbitkan Tiket Resmi ke Portal HTS (Sinkronisasi HTS)
Terdapat dua cara menerbitkan tiket lokal ke portal HTS:

#### Cara A: Melalui Tombol "Kirim ke Portal HTS" di Panel Kanan
1. Klik tombol **"Kirim ke Portal HTS"** di panel informasi tiket sebelah kanan.
2. Form Sinkronisasi Aduan akan terbuka:
   - **Nama & Instansi Pelapor:** Otomatis terisi dari profil pelanggan (dapat disesuaikan jika perlu).
   - **OPD Induk (Klasifikasi HTS):** Bersifat *opsional*. Gunakan kolom pencarian untuk memilih OPD Induk jika aduan berasal dari instansi resmi Pemprov Jateng, atau biarkan kosong jika umum/personal.
   - **Kategori HTS:** Pilih *Troubleshoot*, *Request Layanan*, atau *Monitoring*.
     - *Perhatian:* Kolom **Sub-Kategori** hanya wajib dan aktif jika memilih kategori *Troubleshoot*. Jika memilih *Request Layanan* atau *Monitoring*, sub-kategori akan dinonaktifkan secara otomatis.
   - **Detil Permasalahan:** **Wajib minimal 10 karakter** (sistem dilengkapi *live counter* karakter). Tuliskan ringkasan kendala dengan jelas.
   - **PIC Penerima/Penanganan Awal:** Centang petugas PIC penerima aduan (misal: *Helpdesk - Ori*).
   - **Lampiran Bukti:** Anda dapat memilih gambar dari chat pelapor atau mengunggah file baru (`.jpg`, `.jpeg`, `.png`, `.pdf` maksimal 1MB).
3. Klik **"Kirim & Sinkronkan ke HTS"**.
4. Sistem mengeksekusi pipeline 3 tahap HTS (`submit_aduan` $\rightarrow$ `submit_aduan_status` $\rightarrow$ `submit_pic`) dan menerbitkan nomor tiket resmi (contoh: `#2025-TShoot-2026-jateng-09`).

#### Cara B: Otomatis saat Penugasan Tim L2 (Smart Multi-Assign)
1. Klik tombol **"Assign ke L2"**.
2. Centang opsi **"Sinkronkan ke Portal HTS sekaligus"** di bagian bawah modal.
3. Form data HTS akan muncul di modal penugasan dan nomor tiket HTS otomatis terbit saat penugasan disimpan.

---

### Tahap 4: Menugaskan Tim L2 (Smart Multi-Assign)
1. Klik tombol **"Assign ke L2"** (atau **"Ubah / Tambah Tim L2"**).
2. Centang tim teknisi tujuan: `Network`, `Server`, dan/atau `Mechanical & Electrical (M&E)`.
3. Pilih jenis layanan (*Troubleshooting*, *Request Layanan*, atau *Monitoring*).
4. Klik **"Simpan Penugasan"**.
5. WhatsApp Blast otomatis melooping seluruh kontak WhatsApp personil dan grup teknisi yang baru ditugaskan.

---

### Tahap 5: Berkomunikasi Dua Mode (Balas WhatsApp vs Catatan Internal)
Di bagian bawah obrolan aktif, Dispatcher L1 memiliki dua tab mode:
1. **Tab 💬 Balas Pelanggan (WhatsApp) [Default]:** Pesan langsung dikirim ke WhatsApp pelapor (gelembung biru).
2. **Tab 🔒 Catatan Internal (Tim L1 & L2):** Kotak ketik berganti warna amber/kuning. Pesan hanya beredar di dasbor internal dan **100% RAHASIA (TIDAK terkirim ke WhatsApp pelapor)**.

---

### Tahap 6: Memantau Progres Penanganan & Solusi Teknis L2
- Pada header obrolan, status masing-masing tim tampil secara real-time (`✓ Network: Selesai`, `⏳ Server: Dikerjakan`).
- Catatan solusi teknis dari teknisi L2 otomatis tersimpan dan dirangkum.
- Begitu seluruh tim L2 selesai, tiket utama otomatis berubah status menjadi **`RESOLVED`** (label biru di antrean).

---

### Tahap 7: Menutup Tiket Resmi & Dual-Close ke Portal HTS
1. Konfirmasikan kepada pelanggan via chat WhatsApp bahwa kendala telah tuntas.
2. Klik tombol **"Selesaikan"** di header atas.
3. Modal penutupan tiket akan terbuka:
   - **Kategori Masalah:** Otomatis tercentang sesuai tim L2 yang bertugas.
   - **Kesimpulan Penanganan:** Otomatis mengambil rangkuman solusi teknis dari catatan tim L2 (minimal 10 karakter).
   - **Opsi Dual-Close HTS:** Jika tiket terhubung ke HTS, opsi **"Selesaikan tiket di portal HTS Diskomdigi sekaligus"** otomatis aktif.
   - **Penyambungan PIC Penerima & PIC Penanganan:**
     - PIC awal yang menerima tiket otomatis tercentang dan berlabel hijau **`PIC Penerima`**.
     - Anda dapat mencentang teknisi L2 yang menangani kendala (berlabel biru **`PIC Penanganan`**).
     - Sistem menjamin kedua PIC akan digabungkan dan tercatat bersamaan di portal HTS.
   - **Bukti Lampiran Selesai:** Pilih foto tindakan dari chat atau unggah berkas bukti penyelesaian (`jpg`, `jpeg`, `png`, `pdf`).
4. Klik **"Tutup Tiket"**.
5. **Kebijakan Keamanan:** Jika submit penyelesaian ke portal HTS gagal (misal file tidak sesuai atau sesi HTS habis), tiket lokal **batal ditutup** dan percakapan tetap terbuka agar dapat diperiksa kembali.

---

### Tahap 8: Menyelesaikan Tiket HTS yang Berstatus PENDING
Jika ada tiket yang berstatus lokal `CLOSED` (atau ditutup manual) namun status di portal HTS masih `PENDING`:
1. Buka tiket tersebut dari antrean atau menu Rekap.
2. Pada panel kanan di bawah informasi nomor tiket HTS, akan muncul notifikasi amber dan tombol **"Selesaikan ke Portal HTS"**.
3. Klik tombol tersebut untuk mengirimkan solusi teknis dan mengubah status tiket di portal HTS menjadi **`SOLVED`** tanpa merusak histori percakapan lokal.

---

## 🔧 2. Prosedur Operasional Teknisi L2 (Spesialis Lapangan)

Teknisi L2 bertugas menyelesaikan permasalahan teknis di lapangan sesuai keahlian bidangnya.

### Tahap 1: Menerima Tugas
1. Teknisi menerima notifikasi aduan baru di WhatsApp (nomor pribadi atau grup tim WA) dari bot Helpdesk.
2. Buka dashboard web (`http://localhost:5173` atau alamat IP LAN kantor).
3. Login menggunakan akun bidang masing-masing (`l2_network`, `l2_server`, atau `l2_me`).
4. Antrean hanya menampilkan tiket aduan yang didelegasikan ke tim Anda.

### Tahap 2: Menganalisis Kendala & Koordinasi Internal
1. Klik tiket aduan untuk membaca riwayat keluhan dan gambar lampiran dari pelapor.
2. *Catatan Penting:* Teknisi L2 berada dalam mode **View-Only** (tidak bisa membalas langsung ke nomor WhatsApp pelapor guna mencegah miskomunikasi).
3. **Catatan Internal Berlabel Tim:**
   - Gunakan kolom kuning bertuliskan *"Catatan Internal Tim [Nama Tim]"* di bawah layar.
   - Ketik progres lapangan (misal: *"Sedang perbaikan kabel FO di OTB Rack 2"*).
   - Catatan yang dikirim otomatis berlabel identitas tim dan nama teknisi: `🏷️ Catatan Internal - Tim Network (Teknisi Network L2)`. Catatan ini dijamin privat dan hanya dibaca oleh tim internal helpdesk.

### Tahap 3: Menandai Selesai dengan Catatan Solusi
- **Jika Kendala Tim Anda Sudah Beres:**  
  1. Klik tombol hijau **"Tandai Selesai"**.
  2. Masukkan **Catatan Solusi Teknis** (misal: *"Splicing core 4 selesai, redaman stabil di -19 dBm"*). Catatan solusi ini akan otomatis diteruskan ke draf penutupan L1 dan respon teknis portal HTS.
  3. Status tim Anda akan berubah menjadi `✓ Bagian Anda Selesai`.
- **Jika Kendala Bukan di Ranah Tim Anda (Salah Kamar):**  
  Klik tombol **"Kembalikan / Lepas"**. Masukkan alasan singkat. Tim Anda akan langsung dilepas dari tiket tersebut tanpa mengganggu proses kerja tim lain.

---

## 👑 3. Prosedur Administrator

Administrator memegang kendali penuh atas tata kelola sistem, manajemen pengguna, pengaturan kontak blast L2, dan pembersihan data.

### 1. Manajemen Pengguna (User Management)
- Masuk ke menu **"Users"** di sidebar kiri.
- **Tambah Akun Baru:** Masukkan Nama, Email, Password, Role (`L1`, `L2`, `SPV`, atau `ADMIN`), dan pilih Kategori tim jika rolenya `L2`.
- **Edit Akun Pengguna:** Klik tombol **"Edit"** untuk memperbarui data staf. Kolom Password cukup dikosongkan jika tidak ingin mengubah password.
- **Hapus Akun Pengguna:** Menghapus akun staf yang sudah tidak aktif (akun admin yang sedang login diproteksi dari penghapusan).

### 2. Pengaturan Kontak & Target WhatsApp Blast Tim L2
- Masuk ke menu **"Kontak Tim L2"** (ikon pemancar 📡) di sidebar kiri.
- Menampilkan 3 kartu tim utama: **Tim Network**, **Tim Server**, dan **Tim Mechanical & Electrical**.
- **Menambah Kontak:** Masukkan Nama dan Nomor WhatsApp (`08xxx` / `628xxx`) atau ID Grup (`xxx@g.us`), lalu klik **"+ Tambah ke Tim"**.
- **Mengedit Kontak (Inline Edit):** Klik ikon pensil ✏️ di sebelah kontak untuk mengubah nama atau nomor langsung.
- **Menghapus Kontak:** Klik ikon sampah 🗑️ dan konfirmasi penghapusan.

### 3. Pembersihan Data Rekap Aduan (Testing Cleanup)
- Masuk ke menu **"Rekap Hasil Aduan"**.
- **Hapus Terpilih:** Centang kotak tiket tertentu, lalu klik tombol merah **"Hapus Terpilih (X)"**.
- **Hapus Semua Data & Reset Nomor ID:**
  - Klik tombol merah mencolok ⚠️ **"Hapus Semua Data"**.
  - Masukkan kata konfirmasi `HAPUS`.
  - Sistem akan menghapus seluruh pesan, tiket, lampiran, dan pelanggan testing, serta **mereset urutan nomor ID tiket kembali ke angka 1** (*fresh state*).

---

## 📊 4. Prosedur Supervisor (SPV)

1. **Monitoring Antrean:** Memantau distribusi tiket aktif dan memastikan SLA penanganan berjalan baik.
2. **Rekap Hasil Aduan & Export CSV:**
   - Masuk ke tab **"Rekap Hasil Aduan"** (ikon dokumen di sidebar).
   - Melihat tabel laporan historis tiket: Nomor Tiket Lokal, Nomor Tiket Resmi HTS, Pelapor, Status, Jenis Layanan, Tim Terkait, Waktu Masuk, Durasi Penanganan, dan Kesimpulan Solusi.
   - Klik tombol hijau **"Export CSV"** untuk mengunduh berkas laporan berkala siap olah di Excel/Spreadsheet.
