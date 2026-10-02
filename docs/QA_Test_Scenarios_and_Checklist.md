# 🧪 Panduan & Lembar Uji Sistem (QA Test Scenarios & Checklist)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V4.0 Produksi  
**Metode Pengujian:** Kolaborasi Interaktif (Tester/Operator di Browser & HP + AI Verifier di Backend/Database)  
**Tanggal Pelaksanaan:** 01 Oktober 2026  
**Hasil Akhir:** ✅ **LULUS 100% (ALL 7 MODULES PASSED)**

---

## 📌 1. Informasi Lingkungan & Kredensial Pengujian

### A. Alamat Akses Layanan
- **Web Dashboard:** `http://localhost:5200`
- **Backend API:** `http://localhost:3000`
- **Evolution API (WhatsApp Gateway):** `http://localhost:8080`
- **Database PostgreSQL:** `localhost:5433` (DB: `wa_helpdesk`)

### B. Daftar Akun Pengujian (Semua Password: `password123`)
| Peran (Role) | Email | Kategori | Tugas dalam Skenario |
|---|---|:---:|---|
| **L1 (Dispatcher)** | `l1@helpdesk.go.id` | - | Respon chat, delegasi L2, integrasi HTS, tutup tiket |
| **L2 Network** | `l2_network@helpdesk.go.id` | Network | Catatan internal, foto bukti, selesaikan tugas Network |
| **L2 Server** | `l2_server@helpdesk.go.id` | Server | Catatan internal, foto bukti, selesaikan tugas Server |
| **L2 M&E** | `l2_me@helpdesk.go.id` | M&E | Catatan internal, foto bukti, selesaikan tugas M&E |
| **Supervisor (SPV)** | `spv@helpdesk.go.id` | - | Monitoring antrean, validasi metrik SLA, ekspor CSV |
| **Administrator** | `admin@helpdesk.go.id` | - | Kelola user, kelola kontak L2, reset penomoran ID |

---

## 🧭 2. Matriks Pembagian Peran Kerja Kolaborasi

```
[ Tester / Operator ]                   [ AI / System Verifier ]
  • Mengoperasikan browser              • Memverifikasi query database PostgreSQL
  • Mengetik di HP WhatsApp penguji     • Memeriksa payload WebSocket & API backend
  • Mengamati perubahan visual UI       • Mengonfirmasi data tersimpan sesuai aturan bisnis
  • Mengonfirmasi eksekusi selesai  --> • Menyatakan status PASS / FAIL
```

---

## 📋 3. Skenario Pengujian Lengkap & Hasil Uji

---

### 🔹 MODUL 1: Inbound WhatsApp & Resolusi Identitas
**Tujuan:** Memastikan pesan WhatsApp dari nomor baru otomatis membuat profil pelanggan dan tiket awal berstatus `GENERAL_CHAT` tanpa campur tangan manual.
- **Hasil Pengujian:** **`PASS`**
- **Verifikasi Sistem:**
  - Profil pelanggan terdaftar dengan nomor WA asli dan nama kontak WhatsApp (`Laurensius Liquori`).
  - Tiket #5 terbuat otomatis dengan status `OPEN`, `is_aduan = false`, dan `service_type = 'GENERAL_CHAT'`.
  - Pesan masuk tersimpan rapi dengan sender type `CUSTOMER`.

---

### 🔹 MODUL 2: Percakapan Biasa & Dual-Direction Chat
**Tujuan:** Menguji komunikasi dua arah melalui web dashboard maupun langsung dari HP fisik helpdesk, serta penutupan cepat percakapan umum tanpa formulir HTS.
- **Hasil Pengujian:** **`PASS`**
- **Verifikasi Sistem:**
  - Balasan keluar dari web dashboard tercatat sebagai `AGENT`.
  - Balasan langsung dari HP WhatsApp fisik tersinkronisasi otomatis ke aplikasi sebagai `AGENT` dengan `wa_message_id` unik tanpa duplikasi.
  - Tombol `[ ✅ Selesaikan Percakapan ]` mengubah tiket menjadi `CLOSED` dan otomatis dikecualikan dari durasi MTTR pada laporan SLA.

---

### 🔹 MODUL 3: Promosi Aduan Teknis & Pendelegasian Multi-Assign L2
**Tujuan:** Memvalidasi auto-promotion dari percakapan biasa menjadi aduan teknis resmi, serta pendelegasian tugas ke beberapa tim teknisi sekaligus disertai WhatsApp Blast.
- **Hasil Pengujian:** **`PASS`**
- **Verifikasi Sistem:**
  - Tiket #6 otomatis naik kelas dari percakapan biasa ke aduan teknis (`is_aduan: true`, `service_type: 'TROUBLESHOOTING'`).
  - Dua tim teknisi terdaftar aktif bertugas sekaligus: `Network` (`is_resolved = false`) dan `Server` (`is_resolved = false`).
  - Pesan audit pendelegasian tercatat di ruang chat.

---

### 🔹 MODUL 4: Antarmuka & Siklus Hidup Teknisi L2
**Tujuan:** Memvalidasi pembatasan hak akses (RBAC) teknisi, kerahasiaan catatan internal multimedia, dan penyelesaian mandiri per-tim (*per-team resolution*).
- **Hasil Pengujian:** **`PASS`**
- **Verifikasi Sistem:**
  - Foto teknis internal L2 (`/uploads/img_xxx.png`) dan catatan tersimpan dengan `is_internal = true` (100% rahasia, tidak terkirim ke WhatsApp pelanggan).
  - Saat Tim Server selesai (`is_resolved = true`), tiket utama tetap `OPEN`.
  - Saat Tim Network selesai (`is_resolved = true`), tiket utama otomatis beralih menjadi `RESOLVED`.

---

### 🔹 MODUL 5: Integrasi & Penerbitan Tiket Portal HTS
**Tujuan:** Menguji integrasi end-to-end ke portal resmi HTS Diskomdigi Jawa Tengah secara riil.
- **Hasil Pengujian:** **`PASS`**
- **Verifikasi Sistem:**
  - Berhasil menerbitkan nomor aduan resmi HTS Diskomdigi: **`#2041-TShoot-2026-jateng-10`** (ID Trouble: `2041`).
  - Pipeline 3 tahap sukses berpindah dari `unsubmitted` $\rightarrow$ `input-pic` $\rightarrow$ `PENDING`.
  - Record tersimpan di tabel `TicketHts` dan kartu status biru muncul di panel kanan dashboard.

---

### 🔹 MODUL 6: Penutupan Resmi Tiket & Laporan Eksekutif SPV
**Tujuan:** Memvalidasi penutupan tiket aduan resmi dengan mandatory summary dan pengujian keakuratan metrik SLA di dasbor eksekutif.
- **Hasil Pengujian:** **`PASS`**
- **Verifikasi Sistem:**
  - Tiket #6 berstatus `CLOSED` secara lokal dan berstatus `SOLVED` di portal resmi HTS Diskomdigi.
  - Kesimpulan penanganan (*mandatory summary*) menggabungkan solusi teknis dari seluruh tim L2 terkait.
  - Dasbor SPV menampilkan durasi penanganan bersih (30 Menit), instansi SKPD, dan berkas CSV terunduh secara rapi.

---

### 🔹 MODUL 7: Fitur Produktivitas & Efisiensi Kerja
**Tujuan:** Menguji fitur kenyamanan harian dispatcher (Quick Replies, Audio Chime, Lazy-load Arsip WA) dan pemeliharaan database.
- **Hasil Pengujian:** **`PASS`**
- **Verifikasi Sistem:**
  - Suggester balasan cepat `/` memunculkan popup template dan mengisi teks otomatis ke kotak ketik.
  - Web Audio Chime (nada D5 $\rightarrow$ A5) dan notifikasi desktop browser terpicu saat pesan pelanggan masuk.

---

### 🔹 MODUL 8: Fitur Lanjutan (Tautkan Tiket HTS, Multi-Foto HTS & Edit Quick Replies)
**Tujuan:** Menguji 3 penyempurnaan fitur: penautan manual nomor HTS yang sudah ada, pengunggahan lebih dari 1 file foto lampiran (2-3 foto) ke portal resmi HTS, serta kemampuan menyunting (*edit*) template balasan cepat yang sudah aktif.

#### Skenario 8.1: Penautan Manual Nomor Aduan HTS (Tab "Tautkan yang Sudah Ada")
1. Buka tiket aktif apa saja di antrean L1 (yang belum terhubung ke HTS).
2. Di panel kanan (Status Portal HTS), klik tombol **`[ 🌐 Sinkronkan ke Portal HTS ]`**.
3. Di header slide-over drawer yang terbuka, amati tab switcher di atas:
   - [ ] Terdapat 2 tab: **`[ ➕ Terbitkan Baru ]`** dan **`[ 🔗 Tautkan yang Sudah Ada ]`**.
4. Klik tab **`[ 🔗 Tautkan yang Sudah Ada ]`**:
   - Masukkan nomor aduan resmi HTS yang valid (contoh: `2038-TShoot-2026-jateng-10`).
   - Pilih divisi tujuan (contoh: `Network`).
   - Klik tombol **`[ Verifikasi & Tautkan Tiket ]`**.
5. Amati hasilnya:
   - [ ] Kartu status resmi HTS berwarna biru muncul di panel kanan dengan nomor aduan tersebut.
   - [ ] Muncul catatan sistem di chat: `[SISTEM] Nomor tiket HTS #... berhasil ditautkan secara manual`.
   - [ ] Jika nomor tersebut sudah pernah ditautkan ke tiket lain, muncul dialog konfirmasi proteksi duplikasi (*force confirmation*).

#### Skenario 8.2: Multi-Upload Foto Lampiran (2-3 File) ke Portal HTS
1. **Pada Form Pembuatan / Sinkron Tiket HTS:**
   - Di tab **`[ ➕ Terbitkan Baru ]`**, bagian upload file komputer:
   - [ ] Input file mendukung pemilihan banyak file sekaligus (`multiple`). Pilih 2–3 file gambar dari komputer (gunakan `Ctrl + Klik` atau `Shift + Klik`).
   - [ ] Muncul badge nama-nama file terpilih yang dapat dihapus per satuan sebelum submit.
   - [ ] Seluruh foto terkirim ke portal HTS tanpa error `MulterError: Unexpected field`.
2. **Pada Modal Penutupan Tiket Resmi (Dual-Close):**
   - Buka modal merah **`[ Selesaikan ]`** di header chat.
   - Di bagian foto catatan internal teknisi L2:
     - [ ] Klik 2 atau lebih thumbnail foto internal $ightarrow$ muncul indikator badge *"N Foto Terpilih"*.
   - Di bagian upload file dari komputer:
     - [ ] Dapat mengunggah 2-3 file foto baru sekaligus.
   - Submit penutupan tiket $ightarrow$ seluruh foto terkirim sebagai bukti tindakan teknis (`pic[]`) ke portal resmi HTS.

#### Skenario 8.3: Edit Template Balasan Cepat (Quick Replies)
1. Di samping kotak ketik chat, klik ikon petir **⚡** untuk membuka modal Balasan Cepat.
2. Di daftar template aktif, cari template (misal `/salam`):
   - [ ] Terdapat tombol **Edit (✏️)** di samping tombol Hapus (🗑️).
3. Klik tombol **Edit (✏️)**:
   - [ ] Card template berubah menjadi formulir edit inline berisi shortcut, judul, dan isi pesan yang terisi otomatis.
4. Ubah salah satu data (contoh: tambahkan kalimat baru di isi pesan), lalu klik **`[ Simpan Perubahan ]`**:
   - [ ] Muncul notifikasi sukses dan template langsung ter-update di daftar.
5. Tutup modal, lalu di kotak ketik chat coba ketik `/` dan pilih template tersebut:
   - [ ] Teks yang masuk ke kotak ketik adalah teks hasil suntingan terbaru.

---

## 📊 4. Lembar Hasil Rekapitulasi Pengujian (Checklist QA)

Seluruh modul pengujian telah diverifikasi bersama dan dinyatakan **LULUS**:

- [x] **Modul 1: Inbound WhatsApp & Resolusi Identitas** — `PASS`
- [x] **Modul 2: Percakapan Biasa & Dual-Direction Chat** — `PASS`
- [x] **Modul 3: Promosi Aduan Teknis & Pendelegasian Multi-Assign L2** — `PASS`
- [x] **Modul 4: Antarmuka & Siklus Hidup Teknisi L2** — `PASS`
- [x] **Modul 5: Integrasi & Disaster Recovery Portal HTS** — `PASS`
- [x] **Modul 6: Penutupan Resmi Tiket & Laporan Eksekutif SPV** — `PASS`
- [x] **Modul 7: Fitur Produktivitas & Efisiensi Kerja** — `PASS`
- [ ] **Modul 8: Fitur Lanjutan (Tautkan Tiket HTS, Multi-Foto HTS & Edit Quick Replies)**

---
*Dokumen ini merupakan bukti pengujian resmi penerimaan sistem (UAT/QA) untuk HTS Chat Integration V4.0.*
