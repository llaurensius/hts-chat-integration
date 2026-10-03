# 🚀 Fitur & Kemampuan Sistem (Features & Capabilities)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V4.2 Produksi  
**Status:** Seluruh fitur tercantum aktif dan terintegrasi di kode sumber  
**Terakhir Diperbarui:** 03 Oktober 2026  

---

## 📌 Daftar Isi
1. [Integrasi WhatsApp Gateway & Sinkronisasi Dua Arah](#1)
2. [Klasifikasi Obrolan: Percakapan Biasa vs Aduan Teknis](#2)
3. [Arsitektur Multi-HTS (One-to-Many Tiket Resmi)](#3)
4. [Penautan Manual & Pemulihan Tiket HTS (Disaster Recovery)](#4)
5. [Pendelegasian Smart Multi-Assign & WhatsApp Blast L2](#5)
6. [Catatan Internal Multimedia Dua Arah (L1 ↔ L2)](#6)
7. [Riwayat Lampau & Tarik Arsip WhatsApp](#7)
8. [Efisiensi Dispatcher (Quick Replies, Audio, SLA)](#8)
9. [Master Data Kontak & Hierarki Nama Pelapor](#9)
10. [Start New Chat (Outbound) & Direktori Kontak Paginasi](#10)
11. [Re-Open Tiket (Aktifkan Kembali Percakapan Selesai)](#11)
12. [Resolusi Identitas Pelapor Hybrid](#12)
13. [Laporan SLA (MTTR/FRT) & Ekspor CSV](#13)
14. [Manajemen Pengguna & Pengaturan Sistem (Admin)](#14)
15. [Background Workers & Siklus Hidup Penyimpanan File](#15)
16. [Hardening Keamanan & Integritas Transaksi](#16)

---

## 1. Integrasi WhatsApp Gateway & Sinkronisasi Dua Arah

- **Mesin Gateway:** Evolution API v2 (Baileys) berjalan di dalam kontainer Docker lokal.
- **Pesan Masuk (Inbound):**
  - Webhook `POST /api/webhook/whatsapp` menangani event `messages.upsert` dengan validasi token `WEBHOOK_SECRET`.
  - Pesan pelanggan baru otomatis membuat tiket `OPEN` (default: Percakapan Biasa); pesan susulan menyambung ke tiket aktif (`OPEN`/`RESOLVED`).
  - Mendukung pengiriman teks, gambar, video, dan dokumen.
- **Sinkronisasi Dua Arah Penuh (Dasbor Web & Ponsel WhatsApp Fisik):**
  - **Via Web Dashboard:** Petugas L1 membalas pesan langsung dari antarmuka web.
  - **Via HP WhatsApp Fisik Helpdesk:** Balasan langsung dari ponsel helpdesk (`fromMe=true`) secara otomatis tertangkap webhook dan tersinkronisasi ke dasbor web sebagai `AGENT`.
  - **Dukungan WhatsApp LID Addressing:** Resolusi otomatis dari alamat `@lid` ke nomor telepon asli via atribut `key.remoteJidAlt`.
  - **Deduplikasi Cerdas:** Kolom `Message.wa_message_id` berstatus `@unique` mencegah balon duplikat saat terjadi burst pesan, dilengkapi time-window 60 detik untuk balasan agen.
  - **Anti-Race Condition Mutex:** Eksekusi serial per-nomor WhatsApp menggunakan `perNumberLock` berbasis key `wa:${waNumber}`.
- **Bot Auto-Reply:**
  - Sakelar ON/OFF dan editor template kustom via antarmuka web (khusus L1).
  - Hanya merespons pesan masuk dari pelanggan (`fromMe=false`) — tidak membalas obrolan yang diinisiasi petugas terlebih dahulu.

---

## 2. Klasifikasi Obrolan: Percakapan Biasa vs Aduan Teknis

1. **Percakapan Biasa (`GENERAL_CHAT`, `is_aduan=false`):**
   - Untuk sapaan, konsultasi umum, informasi non-gangguan, atau salah sambung.
   - **Tombol `[ ✅ Selesaikan Percakapan ]`:** Penyelesaian instan tanpa kewajiban mengisi formulir HTS.
   - **Isolasi Antrean L2:** Tidak muncul di antrean kerja teknisi L2.
   - **Bebas SLA:** Dikecualikan 100% dari kalkulasi durasi MTTR laporan agar metrik teknis tetap murni.
2. **Aduan Teknis Resmi (`is_aduan=true`):**
   - Gangguan teknis jaringan, server, atau fasilitas mekanikal/elektrikal.
   - **Promosi Otomatis (Auto-Promotion):** Tiket biasa otomatis naik status menjadi aduan teknis resmi saat L1 menugaskan tim L2, menerbitkan tiket HTS, atau menautkan nomor HTS.
   - **Toggle Manual:** Badge `💬 Percakapan Biasa` dapat diklik langsung untuk berpindah kelas kapan saja (selama belum terikat tiket HTS).

---

## 3. Arsitektur Multi-HTS (One-to-Many Tiket Resmi)

Mengadopsi model relasi **One-to-Many** `Ticket` $\rightarrow$ `TicketHts[]`:
- **Banyak Nomor Aduan per Obrolan:** 1 sesi WhatsApp pelapor dapat menerbitkan nomor aduan ke divisi Network dan Server sekaligus.
- **Penyelesaian Parsial:** Setiap tiket HTS memiliki status penanganan mandiri (`PENDING` / `SOLVED`); menyelesaikan tiket Network tidak membatalkan tiket Server.
- **Multi-Kartu di Panel Kanan:** Seluruh tiket HTS ditampilkan sebagai kartu terpisah (nomor aduan, divisi, status) dengan kontrol aksi mandiri.
- **Single Source of Truth (SSOT):** Seluruh status dibaca langsung dari tabel `TicketHts`.
- **Background Keep-Alive Heartbeat:** Pembaruan cookie `ci_session` otomatis setiap 15 menit via `htsKeepAliveService` mencegah sesi petugas logout di tengah jalan.

---

## 4. Penautan Manual & Pemulihan Tiket HTS (Disaster Recovery)

Untuk memulihkan aduan jika terjadi kegagalan jaringan saat pengiriman ke portal HTS:
- **Drawer Panel 2 Tab:**
  - `[ ➕ Terbitkan Tiket Baru ]` — Pipeline standar 3 tahap (submit aduan $\rightarrow$ input PIC $\rightarrow$ submit PIC).
  - `[ 🔗 Tautkan yang Sudah Ada ]` — Memasukkan nomor aduan resmi yang telah dibuat manual di portal HTS.
- **Verifikasi Live Portal:** Fungsi `lookupTicketByNumber` memvalidasi keberadaan nomor langsung ke peladen HTS sebelum menyimpan relasi.
- **Proteksi Anti-Duplikat Universal:**
  - Nomor yang sama dalam 1 percakapan otomatis **ditolak** (HTTP 400).
  - Nomor yang telah terpakai di tiket lain memunculkan dialog konfirmasi **Force Link** (HTTP 409).
- **Auto-Promotion & Auto-Assign:** Penautan nomor otomatis mengubah `is_aduan=true`; jika divisi tim dipilih, relasi `TicketCategory` otomatis dibuat dan tiket langsung muncul di antrean teknisi L2.
- **Pemulihan Status `INPUT_PIC`:** Tombol **`[ ⚡ Lengkapi Penugasan PIC di HTS ]`** menaikkan tiket gantung ke status aktif `PENDING`.
- **Pelepasan Tautan (Unlink):** Tombol hapus pada kartu HTS memutus relasi nomor tanpa merusak riwayat percakapan WhatsApp.
- **Integritas Dual-Close:** Penutupan tiket lokal hanya terjadi jika **seluruh** tiket HTS terkait berstatus `SOLVED`. Jika terjadi kegagalan, penutupan lokal dibatalkan dan sistem mengembalikan daftar kegagalan spesifik.

---

## 5. Pendelegasian Smart Multi-Assign & WhatsApp Blast L2

- **3 Pilar Tim Spesialis:** `Network`, `Server`, `Mechanical & Electrical (M&E)`.
- **Smart Multi-Assign:** L1 dapat mencentang banyak tim sekaligus; tim yang sedang bertugas atau sudah selesai tidak akan ter-reset (logika diff & merge).
- **WhatsApp Blast Notifikasi:** Notifikasi dikirimkan rapi ke seluruh nomor teknisi dan grup WhatsApp tim (`CategoryContact`) **hanya untuk tim yang baru ditambahkan** (mencegah spam berulang).
- **Resolusi Mandiri Per-Tim (Per-Team Resolution):** Setiap tim menandai selesai tugasnya sendiri (`is_resolved=true`) disertai solusi teknis. Tiket utama otomatis berstatus `RESOLVED` hanya saat **seluruh tim selesai**.
- **Pelepasan Penugasan Mandiri (Self-Unassign Return):** Teknisi dapat melepas tugas dengan alasan resmi tanpa mengganggu jalannya tim lain.

---

## 6. Catatan Internal Multimedia Dua Arah (L1 ↔ L2)

- **Dual-Tab Antarmuka L1:** Tab `💬 Balas Pelanggan` (terkirim ke WhatsApp) vs tab `🔒 Catatan Internal` (latar kuning/amber, 100% rahasia).
- **Foto Bukti Lapangan:** L1 dan L2 dapat saling mengirimkan gambar bukti penanganan internal yang dijamin tidak bocor ke WhatsApp pelanggan (`is_internal=true`).
- **Penyertaan Bukti ke HTS:** Gambar internal L2 dapat langsung dipilih sebagai berkas bukti penyelesaian saat L1 menutup tiket di portal HTS.
- **Label Identitas Otomatis:** Setiap catatan diberi badge penanda tim: `🏷️ Catatan Internal - Tim [Network] ([Nama Teknisi])`.

---

## 7. Riwayat Lampau & Tarik Arsip WhatsApp

- **Accordion Timeline Divider:** Riwayat percakapan dari tiket `CLOSED` milik pelanggan yang sama ditampilkan redup (*dimmed*) lengkap dengan pembatas waktu penutupan sebelumnya.
- **Tarik Arsip WhatsApp On-Demand (`[ 📥 Tarik Arsip WA ]`):** Mengambil hingga 20 pesan historis langsung dari memori WhatsApp via Evolution API dengan query ganda (`remoteJid` dan `remoteJidAlt`), kompatibel penuh dengan mode WhatsApp LID.

---

## 8. Efisiensi Dispatcher (Quick Replies, Audio, SLA)

- **Balasan Cepat (Quick Replies):** Ketik simbol `/` pada kotak chat untuk memunculkan suggester popup template pesan instan (navigasi tombol panah keyboard + Enter).
- **Manajemen Template:** Admin dan L1 dapat menambah, mengedit teks/shortcut secara inline, dan menghapus template balasan cepat.
- **Sintesis Audio Chime:** Nada dering notifikasi Web Audio API native (D5 $\rightarrow$ A5) dan notifikasi desktop browser saat pesan baru tiba.
- **Metrik SLA Supervisor:** Monitoring instan total aduan teknis, percakapan biasa, rata-rata FRT, rata-rata MTTR murni, dan tombol unduh **Export to CSV**.

---

## 9. Master Data Kontak & Hierarki Nama Pelapor

Sistem menetapkan hierarki resolusi identitas pelapor yang konsisten:
1. 🥇 **Master Data Hasil Impor Admin (`is_imported_contact=true`)** $\rightarrow$ Prioritas absolut, tidak pernah tertimpa.
2. 🥈 **Edit Manual Staf via Dasbor (`is_custom_name=true`)**.
3. 🥉 **Kontak Buku Telepon Ponsel Gateway (`pushName`)**.
4. 🏅 **WhatsApp Push Name** $\rightarrow$ Disimpan ke kolom `wa_push_name` sebagai data pembanding.
5. 📱 **Nomor Telepon** (fallback terakhir).

- **Impor Kontak Fleksibel (Admin):**
  - Mendukung format file **Excel (`.xlsx/.xls`)**, **CSV**, dan **vCard (`.vcf`)**.
  - Parser CSV mendukung format resmi **Google Contacts** (`First Name`, `Middle Name`, `Last Name`, `Phone 1 - Value`, `Organization Name`).
  - Parser vCard VCF mengekstrak properti `FN`/`N`, `TEL`, dan `ORG` tanpa dependensi eksternal.
  - Normalisasi otomatis nomor telepon internasional (`08xxx` $\rightarrow$ `628xxx`).
- **Pembersihan Master Data:** Tombol `[ 🗑 Hapus Semua Kontak ]` dengan dialog konfirmasi ketik `HAPUS KONTAK`, proteksi tiket aktif, dan reset sequence auto-increment `Customer_id_seq` ke 1.

---

## 10. Start New Chat (Outbound) & Direktori Kontak Paginasi

- **Tombol `[ ➕ Chat Baru ]`** di atas kolom antrean percakapan (L1/Admin).
- **Direktori Kontak Berpaginasi:**
  - Menggabungkan Master Data database dan kontak buku telepon HP dari Evolution API.
  - Paginasi dinamis 30 entri per halaman dengan tombol *Muat lebih banyak* dan indikator total kontak.
  - Pencarian live instan berdasarkan nama, nomor telepon, atau OPD.
- **Opsi Pesan Pembuka:**
  - **Toggle ON (Default):** Mengirim pesan pembuka WhatsApp via Evolution API, tersimpan sebagai `AGENT`, dan membuka antrean.
  - **Toggle OFF (Mode Tiket Kosong):** Membuka sesi tiket baru di web tanpa mengirimkan pesan WhatsApp ke nomor tujuan.

---

## 11. Re-Open Tiket (Aktifkan Kembali Percakapan Selesai)

- Membuka kembali tiket berstatus `CLOSED` melalui tab filter `✓ Selesai`.
- Tombol **`[ 🔄 Aktifkan Kembali Tiket ]`** di header percakapan.
- Menyertakan dialog alasan pengaktifan kembali yang otomatis tercatat ke catatan internal sistem.
- Status tiket kembali menjadi `OPEN`, kolom `closed_at` di-reset ke `null`, dan status teknisi `TicketCategory` dibersihkan secara atomik.

---

## 12. Resolusi Identitas Pelapor Hybrid

Nama resmi pelapor dari Master Data dijamin tidak tertimpa oleh profil WhatsApp. Jika nama profil WhatsApp pengguna berbeda dengan nama resmi instansi, panel samping kanan menampilkan badge `Master Data` dan menyajikan nama asli profil WhatsApp dalam format pembanding.

---

## 13. Laporan SLA (MTTR/FRT) & Ekspor CSV

- **First Response Time (FRT):** Selisih waktu antara pesan pertama pelanggan dengan balasan pertama petugas helpdesk.
- **Mean Time to Resolve (MTTR):** Durasi penanganan dari tiket dibuat hingga ditutup resmi. Percakapan biasa berstatus `GENERAL_CHAT` **100% dikecualikan** dari perhitungan MTTR agar indikator performa teknis tidak bias.
- **Ekspor CSV:** Mengunduh berkas laporan komprehensif mencakup nomor tiket, nama pelapor, SKPD, nomor tiket HTS, tim penanganan, durasi, dan kesimpulan solusi.

---

## 14. Manajemen Pengguna & Pengaturan Sistem (Admin)

- **Manajemen Akun Pengguna:** Pembuatan akun, pengubahan peran/tim, dan reset password (hash bcrypt salt 10).
- **Pengelolaan Kontak Blast L2:** Penambahan dan pembaruan nomor personil atau grup WhatsApp tujuan notifikasi penugasan per bidang.
- **Pembersihan Data Testing:** Opsi penghapusan tiket terpilih atau pembersihan seluruh data transaksi testing dengan reset auto-increment ID kembali ke angka 1.

---

## 15. Background Workers & Siklus Hidup Penyimpanan File

- **Worker Retensi Berkas Media (`fileCleanupService`):**
  - Dijalankan saat server menyala dan berulang setiap **24 jam**.
  - Menghapus berkas fisik pada folder `/uploads/` yang terikat pada tiket berstatus `CLOSED` lebih dari **90 hari**, menjaga kapasitas penyimpanan server VPS tetap sehat.
- **Worker Heartbeat Portal HTS (`htsKeepAliveService`):**
  - Berjalan setiap **15 menit**.
  - Mengirimkan ping ringan otomatis ke portal HTS (`/api/notif`) untuk seluruh petugas yang memiliki sesi aktif, mencegah terputusnya sesi otentikasi.

---

## 16. Hardening Keamanan & Integritas Transaksi

- **Fail-Fast Environment (`config/env.js`):** Memastikan seluruh variabel rahasia disetel sebelum aplikasi menyala.
- **Webhook Secret Authentication (`webhookAuth.js`):** Melindungi endpoint webhook dengan token secret waktu-konstan.
- **Socket.io Handshake Auth & Room Partitions:** Koneksi WebSocket wajib menyertakan token JWT dan siaran dibatasi per-ruang wewenang.
- **Path Traversal Protection (`safePath.js`):** Memvalidasi jalur kanonikal berkas unggahan dan menolak manipulasi direktori (`../`).
- **Anti-Race Condition Mutex (`perNumberLock.js`):** Menjamin proses serial untuk pesan WhatsApp masuk yang simultan.
- **Constraint Unik Database:** `Message.wa_message_id` berstatus `@unique` untuk mencegah tabrakan pesan ganda.
- **Indeks Komposit Database:** Indeks gabungan filter antrean tiket dan pencarian nama kontak untuk performa kueri optimal.
