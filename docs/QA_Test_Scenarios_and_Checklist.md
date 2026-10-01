# 🧪 Panduan & Lembar Uji Sistem (QA Test Scenarios & Checklist)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V4.0 Produksi  
**Metode Pengujian:** Kolaborasi Interaktif (Tester/Operator di Browser & HP + AI Verifier di Backend/Database)  
**Tanggal:** 01 Oktober 2026  

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
[ Tester / Kamu ]                       [ AI / Antigravity ]
  • Mengoperasikan browser              • Memverifikasi query database PostgreSQL
  • Mengetik di HP WhatsApp penguji     • Memeriksa payload WebSocket & API backend
  • Mengamati perubahan visual UI       • Mengonfirmasi data tersimpan sesuai aturan bisnis
  • Mengonfirmasi eksekusi selesai  --> • Menyatakan status PASS / FAIL
```

---

## 📋 3. Skenario Pengujian Lengkap (7 Modul Bertahap)

---

### 🔹 MODUL 1: Inbound WhatsApp & Resolusi Identitas
**Tujuan:** Memastikan pesan WhatsApp dari nomor baru otomatis membuat profil pelanggan dan tiket awal berstatus `GENERAL_CHAT` tanpa campur tangan manual.

#### Langkah Eksekusi (Tester):
1. Login ke dashboard sebagai **Dispatcher L1** (`l1@helpdesk.go.id` / `password123`).
2. Dari **HP Penguji (PIC)**, kirim satu pesan teks ke nomor resmi Helpdesk:
   ```text
   Halo, selamat siang
   ```
3. Amati layar HP Penguji dan layar Web L1:
   - [ ] HP Penguji menerima balasan otomatis (Auto-Reply Bot).
   - [ ] Percakapan baru muncul secara real-time di Kolom 1 (Daftar Percakapan) tanpa perlu refresh browser.
   - [ ] Header chat menampilkan badge ungu: `💬 Percakapan Biasa`.
   - [ ] Gelembung chat pertama bertuliskan *"Halo, selamat siang"* dan gelembung pesan bot muncul di riwayat.

#### Parameter Verifikasi (AI / Database):
- Query tabel `Customer`: nomor WhatsApp terdaftar, `name` terisi (prioritas pushName WA), `is_custom_name = false`.
- Query tabel `Ticket`: status = `'OPEN'`, `is_aduan = false`, `service_type = 'GENERAL_CHAT'`.
- Query tabel `Message`: pesan `CUSTOMER` dan pesan `BOT` tercatat dengan `ticket_id` yang sama.

---

### 🔹 MODUL 2: Percakapan Biasa & Dual-Direction Chat
**Tujuan:** Menguji komunikasi dua arah melalui web dashboard maupun langsung dari HP fisik helpdesk, serta penutupan cepat percakapan umum tanpa formulir HTS.

#### Langkah Eksekusi (Tester):
1. Di web dasbor L1, balas pesan pelanggan:
   ```text
   Halo, ada yang bisa kami bantu?
   ```
   - [ ] Balasan terkirim dan diterima di WhatsApp HP Penguji.
2. Di HP Penguji, kirim balasan susulan:
   ```text
   Mau tanya jam operasional kantor dinas hari ini
   ```
   - [ ] Pesan susulan langsung muncul di ruang chat web L1.
3. Di **HP fisik WhatsApp Helpdesk** (bukan melalui web), ketik balasan langsung ke pelanggan:
   ```text
   Kantor kami buka jam 08.00 - 16.00 WIB ya
   ```
   - [ ] Di web dashboard L1, balasan dari HP Helpdesk otomatis muncul sebagai gelembung hijau berlabel `AGENT`.
   - [ ] Tidak terjadi duplikasi pesan di layar web.
4. Di web dasbor L1, klik tombol hijau di header chat: **`[ ✅ Selesaikan Percakapan ]`**.
   - [ ] Muncul dialog konfirmasi penutupan percakapan biasa.
   - [ ] Klik OK $\rightarrow$ tiket langsung tertutup, ruang chat aktif berganti menjadi kosong/bersih.

#### Parameter Verifikasi (AI / Database):
- Query tabel `Message`: pesan balasan dari HP helpdesk tersimpan dengan `sender_type = 'AGENT'` dan memiliki `wa_message_id`.
- Query tabel `Ticket`: status berubah menjadi `'CLOSED'`, kolom `summary` terisi otomatis, dan `closed_at` tercatat.
- Query metrik SLA: tiket ini dikecualikan 100% dari perhitungan durasi penyelesaian teknis MTTR.

---

### 🔹 MODUL 3: Promosi Aduan Teknis & Pendelegasian Multi-Assign L2
**Tujuan:** Memvalidasi auto-promotion dari percakapan biasa menjadi aduan teknis resmi, serta pendelegasian tugas ke beberapa tim teknisi sekaligus disertai WhatsApp Blast.

#### Langkah Eksekusi (Tester):
1. Dari HP Penguji, kirim laporan kendala baru:
   ```text
   Lapor internet di ruang rapat mati total dan server lokal tidak bisa diakses
   ```
2. Di dasbor L1, buka percakapan baru tersebut.
3. Klik tombol **`[ Assign ke L2 ]`** di header chat.
4. Pada slide-over drawer yang terbuka:
   - Centang 2 tim sekaligus: **`Tim Network`** dan **`Tim Server`**.
   - Biarkan jenis layanan default: `Troubleshooting (Gangguan)`.
   - Klik tombol **`[ Tugaskan Tiket ]`**.
5. Amati perubahan di layar L1:
   - [ ] Badge di header chat otomatis berubah dari `💬 Percakapan Biasa` menjadi `🚨 Aduan Teknis`.
   - [ ] Muncul catatan sistem di chat: `[SISTEM] Tiket di-assign ke L2: Tim Network, Tim Server`.
   - [ ] Kontak/grup WhatsApp masing-masing tim menerima pesan WhatsApp Blast rincian tugas.

#### Parameter Verifikasi (AI / Database):
- Query tabel `Ticket`: `is_aduan` bernilai `true`, `service_type = 'TROUBLESHOOTING'`.
- Query tabel `TicketCategory`: terdapat 2 baris relasi (`Network` dan `Server`) dengan `is_resolved = false`.
- Log Evolution API: broadcast pesan notifikasi tugas terkirim ke target nomor teknisi.

---

### 🔹 MODUL 4: Antarmuka & Siklus Hidup Teknisi L2
**Tujuan:** Memvalidasi pembatasan hak akses (RBAC) teknisi, kerahasiaan catatan internal multimedia, dan penyelesaian mandiri per-tim (*per-team resolution*).

#### Langkah Eksekusi (Tester):
1. Logout dari L1, lalu login sebagai teknisi Network:
   - Email: `l2_network@helpdesk.go.id` / `password123`
2. Buka tiket aduan tadi di antrean L2:
   - [ ] Mode chat obrolan pelanggan berstatus *View-Only* (L2 tidak bisa membalas langsung ke WhatsApp pelanggan).
   - [ ] Tersedia kolom khusus **Catatan Internal** di bagian bawah.
3. Di tab Catatan Internal, klik ikon klip lampiran (📎), pilih 1 foto teknis dari komputer, lalu ketik pesan:
   ```text
   Kabel FO switch ruang rapat putus fisik, sedang proses perbaikan
   ```
   Lalu klik kirim.
   - [ ] Pesan berbadge kuning internal muncul di layar bersama thumbnail gambar.
   - [ ] **Cek HP Penguji (Pelanggan):** Pastikan foto dan pesan tersebut **TIDAK MASUK** ke WhatsApp pelanggan (100% rahasia).
4. Klik tombol **`[ Tandai Selesai ]`** untuk Tim Network:
   - Masukkan solusi: `"Kabel FO sudah disambung dan dites normal"`.
   - Klik konfirmasi selesai.
   - [ ] Status tim Network berubah menjadi centang hijau Selesai.
   - [ ] Status tiket utama di bar atas **MASIH BERSTATUS OPEN** (karena tim Server belum selesai).
5. Logout dari Network, login sebagai teknisi Server:
   - Email: `l2_server@helpdesk.go.id` / `password123`
6. Buka tiket yang sama:
   - [ ] Terlihat catatan internal dari tim Network sebelumnya lengkap beserta fotonya.
7. Klik tombol **`[ Tandai Selesai ]`** untuk Tim Server:
   - Masukkan solusi: `"Service server lokal telah direstart normal"`.
   - Klik konfirmasi selesai.
   - [ ] Seluruh tim kini telah selesai bertugas.
   - [ ] Status tiket utama otomatis berubah menjadi **`RESOLVED`** (Siap ditutup L1).

#### Parameter Verifikasi (AI / Database):
- Query tabel `Message`: foto dan catatan internal tersimpan dengan `is_internal = true` dan `attachment_url` valid.
- Query tabel `TicketCategory`: baris Network `is_resolved = true`, baris Server `is_resolved = true`.
- Query tabel `Ticket`: status utama tiket berubah dari `'OPEN'` menjadi `'RESOLVED'`.

---

### 🔹 MODUL 5: Integrasi & Disaster Recovery Portal HTS
**Tujuan:** Menguji koneksi akun ke portal resmi HTS Diskomdigi Jawa Tengah, penautan nomor tiket yang sudah ada (manual link), dan pemulihan tiket gantung.

#### Langkah Eksekusi (Tester):
1. Login kembali sebagai **Dispatcher L1** (`l1@helpdesk.go.id`).
2. Buka tiket yang telah berstatus `RESOLVED` tadi.
3. Di panel kanan (Pusat Kendali Adaptif):
   - Amati widget status akun HTS Diskomdigi. Jika belum terhubung, lakukan login HTS melalui formulir captcha interaktif.
4. Klik tombol **`[ 🔗 Hubungkan ke Portal HTS ]`** atau **`[ 🔗 Tautkan yang Sudah Ada ]`**:
   - Pilih tab **`[ 🔗 Tautkan yang Sudah Ada ]`**.
   - Masukkan nomor aduan riil portal HTS yang telah terbit sebelumnya (contoh: `2038-TShoot-2026-jateng-10`).
   - Pilih divisi tujuan (misal `Network`).
   - Klik **`[ Verifikasi & Tautkan Tiket ]`**.
5. Amati perubahan di antarmuka:
   - [ ] Muncul kartu integrasi HTS resmi berwarna biru di panel kanan menampilkan nomor aduan dan status.
   - [ ] Muncul pesan sistem di chat lokal: `[SISTEM] Nomor tiket HTS #... berhasil ditautkan secara manual`.
6. *(Opsional - Uji Disaster Recovery Status INPUT_PIC):*
   - Jika terdapat tiket yang terhenti pada status `INPUT_PIC`, amati munculnya tombol kuning: **`[ ⚡ Lengkapi Penugasan PIC di HTS ]`**.
   - Klik tombol tersebut $\rightarrow$ status tiket di portal resmi naik menjadi `PENDING`.

#### Parameter Verifikasi (AI / Database):
- Query tabel `TicketHts`: record tersimpan dengan `ticket_id`, nomor aduan resmi, status, dan array `hts_pic_ids`.
- Query tabel `Ticket`: field legacy `hts_ticket_no` dan `hts_ticket_status` terisi sinkron.

---

### 🔹 MODUL 6: Penutupan Resmi Tiket & Laporan Eksekutif SPV
**Tujuan:** Memvalidasi penutupan tiket aduan resmi dengan mandatory summary dan pengujian keakuratan metrik SLA di dasbor eksekutif.

#### Langkah Eksekusi (Tester):
1. Di dasbor L1, pada tiket yang telah `RESOLVED`, klik tombol merah: **`[ Selesaikan ]`** (atau `[ Tutup Tiket Resmi ]`).
2. Pada modal penutupan tiket:
   - Kategori masalah otomatis tercentang sesuai tim yang bertugas (Network & Server).
   - Wajib isi kolom **Kesimpulan Akhir Penanganan (Mandatory Summary)**:
     ```text
     Kendala kabel FO putus dan freeze service telah selesai ditangani oleh tim gabungan Network dan Server.
     ```
   - Klik tombol **`[ Tutup Tiket Resmi ]`**.
   - [ ] Tiket resmi tertutup dan berpindah ke tab *Selesai*.
3. Logout dari L1, lalu login sebagai **Supervisor (SPV)**:
   - Email: `spv@helpdesk.go.id` / `password123`
4. Buka tab menu **Laporan Rekapitulasi**:
   - [ ] Kotak KPI menampilkan angka yang akurat: Total Percakapan, Total Aduan Teknis Murni, dan Percakapan Biasa.
   - [ ] Metrik SLA (Rata-rata FRT dan MTTR) hanya menghitung tiket aduan teknis.
   - [ ] Baris tiket yang baru saja ditutup muncul di tabel rekapitulasi lengkap dengan durasi penanganan dan ringkasan kesimpulan.
5. Klik tombol hijau **`[ 📥 Export to CSV ]`**:
   - [ ] Berkas spreadsheet `.csv` berhasil diunduh ke komputer dan dapat dibuka di Microsoft Excel dengan kolom yang rapi.

#### Parameter Verifikasi (AI / Database):
- Query tabel `Ticket`: status = `'CLOSED'`, kolom `summary` terisi teks kesimpulan, `closed_at` tercatat.
- Query endpoint backend `/api/reports/sla-stats`: verifikasi matematis bahwa formula MTTR tidak menyertakan tiket `GENERAL_CHAT`.

---

### 🔹 MODUL 7: Fitur Produktivitas & Efisiensi Kerja
**Tujuan:** Menguji fitur kenyamanan harian dispatcher (Quick Replies, Audio Chime, Lazy-load Arsip WA) dan pemeliharaan database oleh Admin.

#### Langkah Eksekusi (Tester):
1. Login sebagai **L1**, buka ruang chat apapun.
2. **Uji Suggester Balasan Cepat (Quick Replies):**
   - Di kotak ketik chat, ketik tanda garis miring: `/`
   - [ ] Muncul popup menu pilihan template balasan (contoh: `/salam`, `/aduan`, `/progres`, `/selesai`).
   - Tekan tombol panah bawah di keyboard, lalu tekan **Enter** pada pilihan `/salam`.
   - [ ] Template teks salam pembuka langsung terisi otomatis ke dalam kotak chat.
3. **Uji Notifikasi Suara (Audio Chime) & Desktop Alert:**
   - Pastikan toggle ikon speaker di pojok kanan atas berstatus aktif (berwarna biru/bersuara).
   - Buka tab browser lain atau minimize browser.
   - Dari HP Penguji, kirim satu pesan chat baru.
   - [ ] Terdengar bunyi notifikasi nada chime dua nada (D5 $\rightarrow$ A5) dari speaker komputer.
   - [ ] Muncul notifikasi pop-up desktop di sudut layar monitor.
4. **Uji Tarik Arsip WhatsApp Lama:**
   - Di header chat pelanggan yang memiliki riwayat obrolan panjang, klik tombol: **`[ 📥 Tarik Arsip WA ]`**.
   - [ ] Muncul kotak riwayat pesan lampau WhatsApp dari Evolution API tanpa menyebabkan sistem hang/banned.
5. **Uji Pembersihan Data Testing & Reset ID (Admin Only):**
   - Logout, login sebagai **Admin** (`admin@helpdesk.go.id` / `password123`).
   - Masuk ke tab **Manajemen Laporan** $\rightarrow$ klik tombol merah **`[ Bersihkan Seluruh Rekap Aduan ]`**.
   - [ ] Muncul konfirmasi ganda demi keamanan data.
   - [ ] Seluruh data aduan terhapus bersih dan nomor urut tiket baru berikutnya dijamin kembali dimulai dari ID #1.

#### Parameter Verifikasi (AI / Database):
- Verifikasi tabel `QuickReply`: template balasan tersimpan dan dapat ditambah/diedit melalui pengaturan.
- Query PostgreSQL sequence: `SELECT last_value FROM tickets_id_seq;` bernilai 1 setelah reset.

---

## 📊 4. Lembar Hasil Rekapitulasi Pengujian (Checklist QA)

Beri tanda centang `[x]` saat modul pengujian telah diverifikasi bersama:

- [ ] **Modul 1: Inbound WhatsApp & Resolusi Identitas**
- [ ] **Modul 2: Percakapan Biasa & Dual-Direction Chat**
- [ ] **Modul 3: Promosi Aduan Teknis & Pendelegasian Multi-Assign L2**
- [ ] **Modul 4: Antarmuka & Siklus Hidup Teknisi L2**
- [ ] **Modul 5: Integrasi & Disaster Recovery Portal HTS**
- [ ] **Modul 6: Penutupan Resmi Tiket & Laporan Eksekutif SPV**
- [ ] **Modul 7: Fitur Produktivitas & Efisiensi Kerja**

---
*Dokumen ini merupakan panduan resmi pengujian sistem HTS Chat Integration V4.0.*
