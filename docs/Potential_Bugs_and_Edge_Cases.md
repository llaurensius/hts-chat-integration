# ⚠️ Analisis Potensi Bug, Limitasi Teknis & Kasus Tepi (Edge Cases)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V3.0  
**Tanggal Rilis:** 30 September 2026  

Dokumen ini memetakan seluruh potensi celah kendala (*potential bugs*), batasan integrasi (*technical limitations*), skenario kasus tepi (*edge cases*), mitigasi yang sudah diterapkan di sistem saat ini, serta rekomendasi pengembangan ke depan.

---

## 📌 Ringkasan Matriks Potensi Kendala

| No | Potensi Kendala / Kasus Tepi | Tingkat Risiko | Area Terdampak | Status Mitigasi Saat Ini |
|:--:|---|:---:|:---:|---|
| 1 | Sesi Login HTS Kedaluwarsa (*Session Expiry*) | **Sedang** | Sinkronisasi HTS & Dual-Close | ✅ Ditangkap error & tiket lokal diproteksi tidak tertutup |
| 2 | Pemotongan Karakter Detil Aduan (> 250 Karakter) | **Rendah** | Form Penerbitan Tiket HTS | ✅ Dipotong aman di karakter ke-250; chat lokal tetap utuh |
| 3 | Tipe File atau Ukuran Lampiran Melebihi Kuota HTS | **Sedang** | Upload Lampiran Bukti | ✅ Filter MIME (`jpg, png, pdf`), tiket lokal tidak tertutup jika gagal |
| 4 | Duplikasi Submit Tiket oleh Dua Petugas L1 (*Race Condition*) | **Rendah** | Sinkronisasi HTS | ✅ Pengecekan `ticket.hts_ticket_id` di database backend |
| 5 | Downtime / Timeout Server Portal HTS Eksternal | **Sedang** | Seluruh API HTS | ✅ Timeout 15-20 detik & pembatalan operasi penutupan lokal |
| 6 | Lonjakan Aduan *Unsubmitted* di Portal HTS | **Rendah** | Pipeline Tahap 2 HTS | ✅ Fallback otomatis ke parsing nomor prefix trouble |
| 7 | Nomor WhatsApp Pelapor Non-Standar / ID Grup | **Rendah** | Inbound Webhook | ✅ Sanitasi regex nomor telepon & pemfilteran ID grup |

---

## 🔍 Pembahasan Detail & Skenario Kasus Tepi

### 1. Sesi Login Portal HTS Kedaluwarsa (*Session Inactivity Timeout*)
* **Skenario:**  
  Petugas L1 login ke portal HTS pada pukul 08:00 pagi. Pada pukul 14:00 (setelah beberapa jam tidak ada transaksi aduan HTS), sesi cookie PHP `ci_session` di server portal HTS kedaluwarsa oleh mekanisme garbage collection server HTS. Petugas kemudian mencoba mengklik *"Kirim ke Portal HTS"* atau menutup tiket.
* **Gejala / Dampak:**  
  Request HTTP ke portal HTS menerima respon redirect `302/303` kembali ke halaman login HTS, atau gagal dengan pesan session invalid.
* **Mitigasi Saat Ini:**  
  1. Backend secara berkala melakukan verifikasi sesi via `checkSession` (ping ringan `/api/notif`).
  2. Jika request ke endpoint HTS gagal, error ditangkap secara elegan dan ditampilkan di UI: *"Gagal menyelesaikan tiket di portal HTS: ... Silakan hubungkan kembali akun HTS Anda."*
  3. **Kebijakan Integritas:** Tiket lokal dan percakapan **TIDAK AKAN TERTUTUP** sepihak sehingga tidak ada percakapan yang hilang.
* **Rekomendasi Peningkatan Ke Depan:**  
  Menambahkan interceptor di frontend yang otomatis memunculkan modal login CAPTCHA jika server backend mengembalikan kode error sesi HTS expired.

---

### 2. Keterbatasan Panjang Karakter Detil Aduan di Portal HTS (Maks. 250 Karakter)
* **Skenario:**  
  Pelanggan mengirimkan uraian keluhan yang sangat panjang di WhatsApp (misal 500 karakter). Saat L1 menyinkronkan aduan ke portal HTS, teks detil tersebut dikirimkan ke kolom `detil` form `/submit_aduan`.
* **Gejala / Dampak:**  
  Script backend HTS membatasi panjang teks `detil` maksimal 250 karakter. Jika dikirim > 250 karakter, teks akan terpotong pada karakter ke-250 di portal HTS.
* **Mitigasi Saat Ini:**  
  1. Di `htsClientService.js`, teks dibersihkan dan dipotong aman dengan `cleanDetil.substring(0, 250)`.
  2. Seluruh riwayat pesan asli tetap tersimpan 100% utuh tanpa potongan di database Helpdesk lokal.
* **Rekomendasi Peningkatan Ke Depan:**  
  Menambahkan counter karakter di modal sinkronisasi HTS: *"Maksimal 250 karakter untuk ringkasan portal HTS"* agar L1 dapat merangkum keluhan pelanggan dengan kalimat yang padat.

---

### 3. File Lampiran Ditolak oleh Server Portal HTS
* **Skenario:**  
  Pelanggan melampirkan berkas dokumen non-gambar (misal file `.docx`, `.xlsx`, `.zip`) atau file gambar beresolusi tinggi di atas 2 MB. Petugas L1 mencentang opsi menggunakan gambar chat sebagai bukti lampiran teknis HTS.
* **Gejala / Dampak:**  
  Server portal HTS memvalidasi upload menggunakan ekstensi ketat (`jpg|jpeg|png|pdf`) dan kuota ukuran file maksimal 1-2 MB. Request `/submit_teknis` akan mengembalikan respon error: *"Tipe file tidak valid"* atau upload gagal.
* **Mitigasi Saat Ini:**  
  1. `htsClientService.js` memeriksa ekstensi dan menyetel MIME type yang valid (`image/jpeg`, `image/png`, `application/pdf`).
  2. Jika tidak ada lampiran valid, sistem **tidak melampirkan form blob kosong** (mencegah error boundary multipart).
  3. Jika penutupan tiket di portal HTS gagal karena file ditolak, **tiket lokal tetap dibuka (tidak diclose)** dan sistem memberitahukan penyebab kegagalan kepada L1 agar dapat mengganti file bukti.
* **Rekomendasi Peningkatan Ke Depan:**  
  Menambahkan fungsi *image auto-compressor* (menggunakan library `sharp`) di backend sebelum file diteruskan ke portal HTS jika ukuran file melebihi 1 MB.

---

### 4. Eksekusi Sinkronisasi Bersamaan oleh Dua Petugas L1 (*Race Condition*)
* **Skenario:**  
  Dua petugas Dispatcher L1 membuka obrolan tiket yang sama secara bersamaan di dua komputer berbeda. Kedua petugas mengklik tombol *"Kirim ke Portal HTS"* dalam selang waktu 1-2 detik.
* **Gejala / Dampak:**  
  Tanpa proteksi, sistem berpotensi mengirim dua kali request ke `/submit_aduan` dan menerbitkan dua nomor tiket HTS untuk satu pelanggan.
* **Mitigasi Saat Ini:**  
  1. Di `chatController.js` (`syncTicketToHts`), backend melakukan pengecekan `if (ticket.hts_ticket_id)` sebelum memulai pipeline.
  2. Begitu petugas pertama berhasil menyinkronkan, event Socket.io `ticket_closed` langsung disiarkan ke seluruh klien browser untuk mengupdate antrean dan menonaktifkan tombol sinkronisasi.
* **Rekomendasi Peningkatan Ke Depan:**  
  Menerapkan *mutex lock* singkat berbasis Redis atau database transaksi (`SELECT FOR UPDATE`) pada `Ticket.id` saat pipeline HTS sedang dieksekusi.

---

### 5. Downtime atau Pemeliharaan Server Portal HTS Eksternal
* **Skenario:**  
  Server portal HTS Diskomdigi (`https://hts.diskomdigi.jatengprov.go.id`) mengalami kendala jaringan, mati listrik, atau sedang dalam mode pemeliharaan (*maintenance*).
* **Gejala / Dampak:**  
  Request HTTP dari Helpdesk ke HTS akan mengalami *Connection Refused* atau *Gateway Timeout*.
* **Mitigasi Saat Ini:**  
  1. Seluruh pemanggilan HTTP Axios ke HTS dilengkapi batas waktu (*timeout*) 15 - 20 detik untuk mencegah proses backend *hanging*.
  2. Layanan percakapan WhatsApp lokal tetap berjalan normal 100% independen tanpa terganggu oleh status server HTS.
  3. Tombol *"Selesaikan ke Portal HTS"* tersedia di panel resume sehingga petugas dapat menyinkronkan penyelesaian tiket nanti saat server HTS sudah kembali online.

---

### 6. Lonjakan Antrean Aduan *Unsubmitted* di Portal HTS
* **Skenario:**  
  Pada saat bersamaan, terdapat lebih dari 10 aduan baru yang masuk ke portal HTS dari berbagai dinas/OPD lain di Jawa Tengah, sehingga nomor aduan yang baru saja dibuat bergeser ke halaman 2 daftar *unsubmitted*.
* **Gejala / Dampak:**  
  Endpoint `POST /get_aduan_data` (dengan limit default 10) mungkin tidak menemukan item aduan di halaman pertama.
* **Mitigasi Saat Ini:**  
  Di `htsClientService.js`, jika query `get_aduan_data` tidak menemukan ID numerik di halaman 1, sistem memiliki mekanisme *fallback* otomatis dengan mengekstrak ID prefix numerik dari nomor aduan resmi (misal `2025` dari `2025-TShoot-2026-jateng-09`).

---

### 7. Penggabungan PIC Penerima & PIC Penanganan
* **Skenario:**  
  Tiket ditangani di awal oleh *Helpdesk - Ori* (PIC Penerima aduan). Saat kendala selesai di lapangan, teknisi yang menangani adalah *Achmad Julianto* (L2 Network).
* **Gejala / Dampak:**  
  Jika form penutupan HTS hanya mengirim PIC akhir, di riwayat portal HTS PIC penerima awal akan terhapus dan hanya menyisakan teknisi akhir.
* **Mitigasi Saat Ini (Telah Selesai & Teruji):**  
  1. Basis data `Ticket` menyimpan `hts_pic_ids` awal (JSON array).
  2. Modal penutupan tiket otomatis mencentang PIC penerima awal dan melabelinya dengan badge **`PIC Penerima`**.
  3. Petugas dapat mencentang teknisi tambahan (**`PIC Penanganan`**).
  4. Backend menggabungkan (*merge*) seluruh ID tanpa duplikasi dan mengirimkannya dalam format string koma (`pic_id = "14,8"`), memastikan kedua pihak tercatat secara resmi di portal HTS.

---

## 💡 Rekomendasi Pemeliharaan Rutin

1. **Pembersihan Folder `/uploads/` Secara Berkala:**  
   Buat cron job sederhana setiap 3-6 bulan untuk mengarsipkan gambar dan dokumen lampiran lama yang tiketnya telah berstatus `CLOSED` lebih dari 90 hari.
2. **Monitoring Kesehatan Koneksi Evolution API:**  
   Pastikan instance WhatsApp di Evolution API (`http://localhost:8080`) memiliki koneksi yang stabil dan baterai/koneksi internet ponsel gateway tetap aktif.
3. **Pembaruan Password HTS:**  
   Jika petugas L1 mengganti password akun resminya di portal HTS Diskomdigi, lakukan Logout dan Login kembali melalui widget CAPTCHA di dasbor web Helpdesk.
