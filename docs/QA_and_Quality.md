# 🧪 Pengujian QA, Potensi Bug & Audit Kualitas
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V4.2 Produksi  
**Metode Pengujian:** Pengujian Fungsional Web/HP + Verifikasi Integritas Database & Peladen  
**Terakhir Diperbarui:** 03 Oktober 2026  

---

## 1. Ringkasan Status Pengujian & Remediasi Sistem

| Kelompok Modul / Fase | Status Verifikasi | Keterangan Hasil Pengujian |
|---|:---:|---|
| **Modul 1–7 (Alur Operasional Inti)** | ✅ **LULUS 100%** | Seluruh alur chat inbound/outbound, auto-reply, triase L1, antrean L2, sinkronisasi portal HTS, dan laporan SPV terverifikasi penuh. |
| **Modul 8 (Fitur Lanjutan HTS & Quick Reply)** | ✅ **TERVERIFIKASI** | Penautan manual nomor HTS dan inline edit template balasan cepat telah teruji. |
| **Modul 9 (Fitur V4.1: Master Kontak, Chat Baru, Re-Open)** | 🟡 **SIAP UJI UAT** | Seluruh modul backend/frontend telah terpasang, terkompilasi bersih, dan siap untuk skenario uji penerimaan akhir (*User Acceptance Test*). |
| **Audit Keamanan & Kestabilan (Sprint 1–3)** | ✅ **REMEDIASI 100%** | Seluruh kerentanan kritis (SEC-01 s.d. SEC-05, DATA-01 s.d. DATA-04, RES-01 s.d. RES-03) berhasil diperbaiki dan lolos uji regresi peladen. |

---

## 2. Skenario Pengujian Alur Inti (Modul 1–7: LULUS 100%)

### Modul 1 — Inbound WhatsApp & Resolusi Identitas
- **Skenario:** Pengiriman pesan pertama kali dari nomor WhatsApp penguji.
- **Hasil:** Otomatis membuat entri `Customer` dan tiket baru berstatus `OPEN` / `GENERAL_CHAT`. Nama pelapor berhasil diresolusi dari kontak buku telepon atau push name WhatsApp. Kolom `is_custom_name = false`.
- **Verifikasi Basis Data:** Baris data tersimpan di tabel `Customer` dan `Ticket`.

### Modul 2 — Percakapan Biasa & Dual-Direction Chat
- **Skenario:** Dispatcher L1 membalas pesan dari web dashboard, dan penguji membalas dari HP fisik helpdesk.
- **Hasil:** Pesan web tersimpan sebagai `AGENT` dengan `wa_message_id`. Pesan dari ponsel helpdesk (`fromMe=true`) tertangkap webhook dan tersinkronisasi sebagai `AGENT`. Tombol `[ ✅ Selesaikan Percakapan ]` menutup tiket dengan status `CLOSED`, durasi MTTR otomatis dieksklusi (`durationMins: null`).

### Modul 3 — Promosi Aduan & Smart Multi-Assign
- **Skenario:** L1 menugaskan tiket ke tim Network dan Server sekaligus.
- **Hasil:** Tiket otomatis dipromosikan menjadi `is_aduan=true` (`TROUBLESHOOTING`). Terbentuk 2 baris relasi `TicketCategory` (`is_resolved=false`). Notifikasi WhatsApp blast terkirim hanya ke nomor personil tim terkait.

### Modul 4 — Antarmuka Kerja & Siklus Hidup L2
- **Skenario:** Teknisi L2 mengunggah gambar kendala kabel pada kolom Catatan Internal.
- **Hasil:** Gambar tersimpan dengan penanda `is_internal=true`, tampil di ruang chat dengan latar amber, dan **100% terisolasi** (tidak terkirim ke WhatsApp pelanggan). Tiket utama tetap `OPEN` ketika 1 tim selesai, dan otomatis berubah menjadi `RESOLVED` ketika seluruh tim menyelesaikan tugasnya.

### Modul 5 — Integrasi Portal Resmi HTS Diskominfo
- **Skenario:** Dispatcher L1 menerbitkan tiket aduan resmi ke portal HTS Diskominfo Jawa Tengah.
- **Hasil:** Pipeline 3 tahap berhasil menerbitkan nomor aduan resmi (misal: `#2041-TShoot-2026-jateng-10`), status tercatat `PENDING`, ID PIC terhubung, dan entri tersimpan di tabel `TicketHts`.

### Modul 6 — Penutupan Resmi & Dual-Close
- **Skenario:** L1 menutup tiket di dasbor helpdesk dengan mengaktifkan penyelesaian ke portal HTS.
- **Hasil:** Validasi dual-close sukses: tiket lokal berstatus `CLOSED`, tiket portal HTS berubah status menjadi `SOLVED`.

### Modul 7 — Efisiensi Dispatcher (Quick Replies & Audio)
- **Skenario:** Mengetik simbol `/` pada kotak input obrolan dan menerima pesan baru saat tab diminimize.
- **Hasil:** Popup template balasan cepat muncul dan menyisipkan teks template seketika. Nada dering chime audio Web Audio API berbunyi dan notifikasi desktop browser muncul.

---

## 3. Skenario Pengujian Fitur Lanjutan (Modul 8 & 9)

### 3.1 Manual Link & Disaster Recovery HTS (Modul 8)
- **Skenario:** Menautkan nomor tiket HTS yang telah ada sebelumnya via tab *Tautkan yang Sudah Ada*.
- **Hasil Uji:** Fungsi `lookupTicketByNumber` memvalidasi keberadaan tiket langsung ke peladen HTS. Sistem menolak penautan duplikat pada percakapan yang sama (HTTP 400) dan meminta konfirmasi force link bila nomor telah terhubung di tiket lain (HTTP 409).

### 3.2 Impor Master Data Kontak Pelanggan (Modul 9.1)
- **Prosedur:** Login sebagai `ADMIN` $\rightarrow$ Buka modal Chat Baru $\rightarrow$ Pilih *Import Master Data Kontak*.
- **Berkas Uji:**
  - `docs/contacts.csv` (Format Google Contacts / CSV Kustom) $\rightarrow$ Ekspektasi: 1300 kontak terbaca bersih, 0 gagal.
  - `docs/contacts.vcf` (Format vCard) $\rightarrow$ Ekspektasi: 1335 kartu kontak terbaca (kartu tanpa nomor telepon dilewati).
- **Kriteria Keberhasilan:** Kolom `is_imported_contact=true`, badge `Master Data` muncul di panel detail, dan nama resmi tidak tertimpa nama profil WhatsApp saat ada pesan masuk.

### 3.3 Start New Chat Outbound & Paginasi (Modul 9.2 & 9.3)
- **Prosedur:** Klik `[ ➕ Chat Baru ]` $\rightarrow$ Telusuri direktori kontak.
- **Kriteria Keberhasilan:** 
  - Direktori menampilkan 30 kontak pertama dan tombol `Muat lebih banyak` mengambil data halaman berikutnya secara dinamis.
  - Mode Toggle Pesan Pembuka **ON:** Membuka tiket baru dan mengirimkan pesan pembuka ke nomor tujuan via WhatsApp.
  - Mode Toggle Pesan Pembuka **OFF:** Membuka tiket kosong di dasbor web tanpa mengirim pesan WhatsApp keluar.

### 3.4 Re-Open Tiket (Modul 9.4)
- **Prosedur:** Buka tiket `CLOSED` pada tab filter *Selesai* $\rightarrow$ Klik **`[ 🔄 Aktifkan Kembali Tiket ]`**.
- **Kriteria Keberhasilan:** Status tiket kembali `OPEN`, kolom `closed_at` menjadi `null`, catatan internal alasan re-open tercatat, dan status pilar tim `TicketCategory` dibersihkan secara atomik.

### 3.5 Pembersihan Master Data Kontak (Modul 9.5)
- **Prosedur:** Klik tombol `[ 🗑 Hapus Semua Kontak ]` pada modal impor $\rightarrow$ Ketik teks konfirmasi `HAPUS KONTAK`.
- **Kriteria Keberhasilan:** Seluruh baris di tabel `Customer` terhapus bersih dan sequence auto-increment `Customer_id_seq` di-reset kembali ke angka 1.

---

## 4. Matriks Mitigasi Risiko & Kasus Tepi (Edge Cases)

| # | Skenario Risiko / Ancaman | Dampak Sistem | Mitigasi yang Terpasang di Kode | Status |
|:--:|---|---|---|:---:|
| 1 | **Spoofing Webhook WhatsApp** | Injeksi pesan/tiket tiruan dari pihak luar | Middleware [`webhookAuth.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/middlewares/webhookAuth.js) dengan validasi token rahasia `WEBHOOK_SECRET` (*timingSafeEqual*) | ✅ Selesai |
| 2 | **Race Condition Pesan Burst** | Lonjakan pesan membuat 2 tiket aktif & auto-reply dobel | Antrean janji in-memory [`perNumberLock.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/utils/perNumberLock.js) memproses serial per-nomor (`wa:${waNumber}`) | ✅ Selesai |
| 3 | **Duplikasi Pesan di Database** | Balon chat ganda saat webhook di-retry | Kolom `Message.wa_message_id` berstatus `@unique` dengan penanganan Prisma `P2002` | ✅ Selesai |
| 4 | **Bypass Otorisasi Chat / Laporan** | L2/SPV mengakses fungsi yang bukan wewenangnya | Middleware `requireRole` di seluruh rute operasional Express + isolasi baris data L2 | ✅ Selesai |
| 5 | **Kredensial Default Kosong / Lemah** | Akses ilegal jika variabel env lupa disetel | Validasi fail-fast [`config/env.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/config/env.js) yang menghentikan server saat startup jika env kosong | ✅ Selesai |
| 6 | **Path Traversal Lampiran HTS** | Pembacaan berkas sembarang (`../../.env`) via payload | Sanitasi jalur kanonikal berbasis `path.resolve` pada [`safePath.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/utils/safePath.js) | ✅ Selesai |
| 7 | **Kebocoran Siaran WebSocket** | Klien anonim membaca obrolan & data pelapor | Handshake otentikasi JWT pada `io.use` + partisi siaran ke ruang khusus (*rooms*) | ✅ Selesai |
| 8 | **Timeout Jaringan Gateway WA** | Eksekusi server hang saat Evolution lambat | Instance Axios memiliki batas timeout eksplisit (10s/15s) + blast L2 dijalankan paralel `Promise.allSettled` | ✅ Selesai |
| 9 | **Penumpukan File Media Lama** | Penyimpanan server penuh dalam 3–6 bulan | Background service [`fileCleanupService.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/services/fileCleanupService.js) menghapus file tiket `CLOSED` > 90 hari setiap 24 jam | ✅ Selesai |
| 10 | **Sesi Portal HTS Logout Otomatis** | Submit aduan gagal karena sesi kedaluwarsa | Background service [`htsKeepAliveService.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/services/htsKeepAliveService.js) melakukan ping berkala setiap 15 menit | ✅ Selesai |
| 11 | **Kegagalan Dual-Close Parsial** | Tiket lokal tertutup padahal di HTS masih pending | Verifikasi atomik seluruh tiket HTS; jika ada satu saja yang gagal, penutupan lokal dibatalkan | ✅ Selesai |
| 12 | **Kueri Antrean Lambat pada DB Besar** | Latensi pembacaan antrean meningkat | Indeks komposit `[status, is_aduan, created_at(sort: Desc)]` dan `[customer_id, status]` | ✅ Selesai |

---

## 5. Checklist Verifikasi Rilis Produksi (Release Gate)

Sebelum aplikasi diserahkan secara resmi untuk penggunaan harian staf Diskominfo Provinsi Jawa Tengah, pastikan daftar periksa berikut telah terpenuhi:

- [x] Seluruh skema database PostgreSQL telah termigrasi bersih dengan indeks komposit.
- [x] Validasi fail-fast lingkungan aktif (`DATABASE_URL`, `JWT_SECRET`, `EVOLUTION_API_TOKEN`).
- [x] Endpoint webhook terlindungi dengan token rahasia `WEBHOOK_SECRET`.
- [x] Socket.io handshake auth aktif dan menolak koneksi anonim tanpa token JWT.
- [x] Background worker `htsKeepAliveService` (15 menit) dan `fileCleanupService` (24 jam) terinisialisasi.
- [ ] Ganti seluruh kata sandi akun benih (`password123`) dengan kata sandi kuat di lingkungan produksi.
- [ ] Lakukan eksekusi simulasi impor master data 1300 kontak OPD (`docs/contacts.csv`).
- [ ] Lakukan uji coba pengiriman pesan keluar (*Start New Chat*) dan penutupan dual-close tiket resmi ke portal HTS.
- [ ] Pastikan reverse proxy Nginx telah mengaktifkan SSL/HTTPS dan pembatasan firewall server (UFW).
