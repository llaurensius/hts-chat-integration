# 🚀 Fitur & Kemampuan Sistem (Features & Capabilities)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V4.2.1 Produksi (Full-Stack SPA Integration & Consolidated Architecture)  
**Status:** Seluruh fitur tercantum aktif dan terintegrasi di kode sumber  
**Terakhir Diperbarui:** 03 Oktober 2026  

---

## 📌 Daftar Isi
1. [Workspace 5-Tab & Antarmuka Responsif 3-Kolom](#1)
2. [Integrasi WhatsApp Gateway & Sinkronisasi Dua Arah](#2)
3. [Klasifikasi Obrolan: Percakapan Biasa vs Aduan Teknis](#3)
4. [Arsitektur Multi-HTS (One-to-Many Tiket Resmi Portal)](#4)
5. [Penautan Manual & Pemulihan Tiket HTS (Disaster Recovery)](#5)
6. [Pendelegasian Smart Multi-Assign & Resilient Auto-Open HTS](#6)
7. [Catatan Internal Multimedia Dua Arah (L1 ↔ L2) & Media Lightbox](#7)
8. [Riwayat Lampau & Tarik Arsip WhatsApp On-Demand](#8)
9. [Efisiensi Dispatcher: Slash Commands (/), Audio Chime & Desktop Push](#9)
10. [Master Data Kontak OPD & Hierarki Resolusi Nama Pelapor](#10)
11. [Start New Chat (Outbound) & Direktori Kontak Paginasi](#11)
12. [Re-Open Tiket (Reaktivasi Transaksional Tiket Selesai)](#12)
13. [Laporan SLA (MTTR & FRT) serta Ekspor CSV (Supervisor)](#13)
14. [Manajemen Pengguna & Kontak Blast Tim Lapangan (Admin)](#14)
15. [Pengaturan Bot Sambutan Otomatis (L1)](#15)
16. [Background Workers: Sesi Keep-Alive & Retensi Berkas](#16)
17. [Hardening Keamanan & Integritas Transaksi Sistem](#17)

---

## 1. Workspace 5-Tab & Antarmuka Responsif 3-Kolom

Aplikasi frontend menyediakan ruang kerja terpadu berbasis React 18 yang beradaptasi secara dinamis sesuai peran pengguna:

### A. Navigasi 5-Tab Workspace
1. **Tab `chat` (Percakapan & Tiket):** Workspace operasional utama bagi L1, L2, Admin, dan Supervisor.
2. **Tab `report` (Laporan SLA & Ekspor CSV):** Khusus diakses oleh `SPV`, `L1`, dan `ADMIN` untuk memantau performa layanan dan durasi penanganan.
3. **Tab `users` (Manajemen Pengguna):** Khusus `ADMIN` untuk mengelola akun staf (buat, edit, ubah kata sandi, hapus, penetapan peran & kategori tim).
4. **Tab `teams` (Manajemen Tim & Kontak Blast):** Khusus `ADMIN` untuk mengelola nomor WhatsApp pribadi atau grup WhatsApp teknisi L2 untuk notifikasi pendelegasian.
5. **Tab `bot` (Pengaturan Bot Sambutan):** Khusus `L1` dan `ADMIN` untuk mengaktifkan/menonaktifkan auto-reply serta menyesuaikan teks sapaan resmi.

### B. Tata Letak 3-Kolom Responsif (Tab Chat)
- **Kolom Kiri (Antrean & Filter Tiket):**
  - Tab pemfilteran instan: `Semua`, `Aduan`, `Biasa`, `Pending HTS`, dan `Selesai`.
  - Bilah pencarian instan berdasarkan nama pelapor, instansi OPD, atau nomor WhatsApp.
  - Kartu tiket interaktif dilengkapi badge tipe layanan, timer SLA real-time, badge jumlah pesan belum dibaca, dan nama teknisi/tim yang ditugaskan.
- **Kolom Tengah (Ruang Obrolan Interaktif):**
  - Header informasi tiket aktif: foto profil/avatar, nama pelapor, asal OPD, status, dan tombol toggle kelas aduan.
  - Viewport percakapan dinamis dengan pembatas tanggal (*date dividers*) dan pembatas riwayat lampau (*dimmed past history*).
  - Mode ganda pengetikan: tab **💬 Balas Pelanggan** (warna biru/netral, dikirimkan ke WhatsApp) vs tab **🔒 Catatan Internal** (warna amber/kuning, hanya terbaca oleh internal helpdesk).
  - Kolom input pesan dilengkapi lampiran file/gambar, pratinjau sebelum kirim, dan popup pemanggil template balasan cepat (*slash command* `/`).
- **Kolom Kanan (Pusat Kendali / Inspector Panel):**
  - Panel dapat diciutkan (*collapsible*) untuk memperluas ruang baca obrolan.
  - Kartu Profil Pelanggan: edit nama dan OPD langsung di tempat (*inline edit*), penanda sumber kontak (*Master Data*, *Custom Name*, atau *WhatsApp Profile*).
  - Kartu Penugasan Tim L2: daftar tim yang sedang bertugas (`Network`, `Server`, `M&E`), indikator progres per-tim, tombol *Assign ke L2*, dan opsi *Return Task* bagi teknisi.
  - Kartu Integrasi Multi-HTS: daftar nomor tiket resmi portal HTS terkait, status `PENDING` atau `SOLVED`, tombol terbitkan tiket baru, tautkan tiket manual, dan selesaikan parsial.
  - Tombol aksi cepat: *[ ✅ Selesaikan Percakapan ]* (untuk pesan biasa), *[ Selesaikan Tiket ]* (untuk aduan resmi), atau *[ 🔄 Aktifkan Kembali Tiket ]* (untuk tiket yang sudah `CLOSED`).

---

## 2. Integrasi WhatsApp Gateway & Sinkronisasi Dua Arah

- **Mesin Gateway:** Evolution API v2 (Baileys) berjalan terisolasi di dalam jaringan Docker.
- **Pesan Masuk (Inbound):**
  - Webhook `POST /api/webhook/whatsapp` menangani event `messages.upsert` dengan validasi token rahasia `WEBHOOK_SECRET`.
  - Pelanggan baru otomatis dibuatkan profil pelanggan dan tiket `OPEN` (default: *Percakapan Biasa*). Pesan susulan dari pelanggan yang sama otomatis menyambung ke tiket aktif (`OPEN` atau `RESOLVED`).
  - Mendukung pesan teks, gambar, video, dan dokumen lampiran.
- **Sinkronisasi Dua Arah Penuh (Dasbor Web & Ponsel WhatsApp Fisik):**
  - **Via Web Dashboard:** Petugas L1 membalas pesan dari antarmuka web, pesan dikirimkan ke pelanggan via Evolution API.
  - **Via HP WhatsApp Fisik Helpdesk:** Jika petugas membalas langsung menggunakan ponsel operasional helpdesk (`fromMe=true`), webhook menangkap pesan tersebut dan menyinkronkannya ke antarmuka web sebagai pesan `AGENT` secara instan.
  - **Dukungan WhatsApp LID Addressing:** Resolusi otomatis alamat akun baru WhatsApp (`@lid`) ke nomor telepon resmi via atribut `remoteJidAlt`.
  - **Deduplikasi Pesan Atomik:** Batasan `@unique wa_message_id` pada basis data mencegah gelembung chat ganda akibat *burst* pengiriman atau *network retry*.
  - **Anti-Race Condition Mutex:** Pemrosesan serial per-nomor menggunakan modul `perNumberLock` berbasis key `wa:${waNumber}`.
- **Bot Auto-Reply Sambutan:**
  - Hanya merespons pesan masuk dari pelanggan (`fromMe=false`). Pesan yang diinisiasi oleh petugas (*outbound*) tidak akan memicu balasan otomatis bot.

---

## 3. Klasifikasi Obrolan: Percakapan Biasa vs Aduan Teknis

Sistem membedakan secara tegas antara obrolan non-gangguan dan aduan teknis resmi:

1. **Percakapan Biasa (`GENERAL_CHAT`, `is_aduan=false`):**
   - Diperuntukkan bagi sapaan, konsultasi umum, informasi non-gangguan, atau salah sambung.
   - **Tombol `[ ✅ Selesaikan Percakapan ]`:** Penyelesaian instan tanpa mewajibkan pengisian formulir tiket portal HTS.
   - **Isolasi Beban Kerja L2:** Percakapan biasa tidak muncul pada antrean teknisi lapangan L2.
   - **Bebas Beban SLA:** Dikecualikan 100% dari metrik durasi MTTR laporan agar tidak merusak data performa penanganan teknis.
2. **Aduan Teknis Resmi (`is_aduan=true`):**
   - Untuk kendala jaringan, server, aplikasi SPBE, atau fasilitas mekanikal/elektrikal.
   - **Promosi Otomatis (Auto-Promotion):** Tiket biasa otomatis dipromosikan menjadi aduan teknis resmi saat L1 menugaskan tim L2, menerbitkan tiket ke portal HTS, atau menautkan nomor HTS manual.
   - **Toggle Manual:** Label badge `💬 Percakapan Biasa` pada header chat dapat diklik langsung oleh L1 untuk menaikkan kelas menjadi aduan teknis kapan saja.

---

## 4. Arsitektur Multi-HTS (One-to-Many Tiket Resmi Portal)

Sistem mengimplementasikan relasi **One-to-Many** antara satu percakapan WhatsApp (`Ticket`) dengan banyak nomor aduan resmi HTS (`TicketHts[]`):

- **Banyak Nomor Aduan per Percakapan:** Satu sesi laporan WhatsApp dapat menerbitkan nomor aduan resmi ke divisi Network dan Server sekaligus pada portal HTS.
- **Penyelesaian Parsial Mandiri:** Setiap tiket HTS memiliki siklus hidup status sendiri (`PENDING` $\rightarrow$ `SOLVED`). Menyelesaikan aduan divisi Network tidak membatalkan proses aduan divisi Server.
- **Single Source of Truth (SSOT):** Status dibaca langsung dari tabel `TicketHts` di basis data lokal yang tersinkronisasi dengan portal HTS.
- **Background Keep-Alive Heartbeat:** Worker berkala setiap 15 menit memelihara keaktifan cookie sesi PHP `ci_session` agar petugas tidak ter-logout saat jam sibuk.

---

## 5. Penautan Manual & Pemulihan Tiket HTS (Disaster Recovery)

Untuk memitigasi kegagalan transmisi jaringan saat proses penerbitan otomatis ke portal HTS:
- **Drawer Penanganan 2 Tab:**
  - `[ ➕ Terbitkan Tiket Baru ]` — Menjalankan pipeline 3 tahap otomatis (Submit Aduan $\rightarrow$ Update Status $\rightarrow$ Submit PIC).
  - `[ 🔗 Tautkan yang Sudah Ada ]` — Memasukkan nomor aduan resmi yang telah dibuat manual di portal HTS.
- **Validasi Live Portal:** Sistem melakukan *lookup* langsung ke peladen HTS (`lookupTicketByNumber`) sebelum mengizinkan penautan nomor.
- **Proteksi Anti-Duplikasi Universal:**
  - Penautan nomor yang sama pada tiket yang sama ditolak (HTTP 400).
  - Penautan nomor yang sudah terikat di tiket percakapan lain memunculkan dialog konfirmasi **Force Link** (HTTP 409).
- **Auto-Promotion & Auto-Assign:** Penautan nomor HTS otomatis mengubah tiket menjadi aduan resmi (`is_aduan=true`) dan langsung mendistribusikan tugas ke antrean teknisi L2 terkait.
- **Pemulihan Status Gantung (`INPUT_PIC`):** Tombol `[ ⚡ Lengkapi Penugasan PIC di HTS ]` pada kartu HTS menaikkan status tiket yang belum memiliki teknisi penanganan menjadi `PENDING`.
- **Pelepasan Tautan (Unlink HTS):** L1 dapat melepas tautan tiket HTS yang salah tanpa merusak jalannya percakapan WhatsApp.
- **Dual-Close Berintegritas:** Penutupan tiket lokal memvalidasi bahwa seluruh tiket HTS terkait telah `SOLVED`. Jika terjadi kegagalan transmisi ke portal, penutupan lokal dibatalkan secara transaksional untuk menjaga integritas data.

---

## 6. Pendelegasian Smart Multi-Assign & Resilient Auto-Open HTS

- **3 Pilar Tim Spesialis L2:** `Network`, `Server`, `Mechanical & Electrical (M&E)`.
- **Smart Multi-Assign Diffing:** L1 dapat mencentang banyak tim sekaligus. Tim yang sedang bertugas atau sudah menyelesaikan pekerjaannya tidak akan ter-reset saat L1 menambahkan tim baru.
- **WhatsApp Multi-Contact Blast:** Notifikasi penugasan terkirim rapi via WhatsApp ke nomor personil atau grup tim L2 (`CategoryContact`) **hanya untuk tim yang baru ditambahkan**.
- **Resilient Auto-Open HTS Workflow:**
  - Pada modal penugasan L2, terdapat opsi: `[✓] Langsung buka formulir Portal HTS setelah menyimpan penugasan`.
  - Pasca penugasan disimpan, backend memancarkan event `ticket_updated` (menghindari emisi keliru `ticket_closed`), sehingga referensi tiket aktif di frontend tetap utuh dan formulir penerbitan HTS terbuka otomatis serta dapat dikirimkan seketika tanpa hambatan.
- **Resolusi Mandiri Per-Tim (Per-Team Resolution):** Setiap tim menandai selesai tugasnya sendiri (`is_resolved=true`) disertai catatan solusi teknis. Tiket utama otomatis berstatus `RESOLVED` ketika seluruh tim telah menyelesaikan bagian tugasnya.
- **Pelepasan Tugas Mandiri (Return Task):** Teknisi L2 dapat mengembalikan tugas penanganan disertai alasan resmi jika kendala berada di luar kewenangan tim mereka.

---

## 7. Catatan Internal Multimedia Dua Arah (L1 ↔ L2) & Media Lightbox

- **Isolasi Catatan Internal:** Tab pengetikan warna amber khusus untuk koordinasi rahasia internal L1 dan L2. Pesan dan foto pada mode ini bertanda `is_internal=true` dan **100% dijamin tidak pernah terkirim ke WhatsApp pelanggan**.
- **Foto Bukti Lapangan:** Teknisi L2 dapat melampirkan foto bukti perbaikan lapangan.
- **Penyertaan Bukti ke Portal HTS:** Foto bukti internal L2 dapat langsung dipilih oleh L1 sebagai berkas bukti penyelesaian saat menutup tiket di portal HTS.
- **Media Lightbox Modal:** Mengklik gambar pada riwayat chat membuka tampilan layar penuh (*lightbox*) berlatar gelap, dilengkapi tombol pembesar (*fullscreen*), unduh, dan opsi buka berkas di tab browser baru.

---

## 8. Riwayat Lampau & Tarik Arsip WhatsApp On-Demand

- **Accordion Timeline Divider:** Obrolan dari tiket pelanggan yang telah `CLOSED` di masa lampau ditampilkan dengan gaya redup (*dimmed*) lengkap dengan pembatas waktu penutupan, menjaga konteks riwayat penanganan sebelumnya.
- **Tarik Arsip WhatsApp On-Demand (`[ 📥 Tarik Arsip WA ]`):** Mengambil hingga 20 pesan historis langsung dari memori WhatsApp via Evolution API dengan kueri ganda (`remoteJid` dan `remoteJidAlt`), kompatibel penuh dengan mode WhatsApp LID.

---

## 9. Efisiensi Dispatcher: Slash Commands (/), Audio Chime & Desktop Push

- **Slash Commands Balasan Cepat (`/`):**
  - Mengetik karakter `/` pada kotak pesan memunculkan popover autocomplete berisi template pesan resmi (misal: `/salam`, `/aduan`, `/selesai`).
  - Navigasi penuh via keyboard: tombol `ArrowDown` & `ArrowUp` untuk memilih, `Enter` atau `Tab` untuk menyisipkan teks, dan `Escape` untuk menutup popup.
  - Manajemen Template: Tombol modal untuk menambah, mengedit teks/shortcut, dan menghapus template balasan cepat.
- **Sintesis Audio Chime (Web Audio API):**
  - Setiap pesan baru masuk membunyikan nada dering merdu sintetis dua nada (D5 $587.33\text{ Hz} \rightarrow$ A5 $880\text{ Hz}$).
  - Menghilangkan ketergantungan pada berkas audio eksternal dan kebal dari kebijakan pemblokiran aset audio browser (*audio policy*).
  - Dilengkapi tombol toggle bisukan suara (*mute/unmute*) di navbar.
- **Notifikasi Desktop Browser (HTML5 Notification API):**
  - Menampilkan kartu notifikasi sistem operasi saat jendela browser diminimize atau pengguna berada di tab lain.
  - Mengklik kartu notifikasi otomatis memfokuskan jendela browser dan langsung membuka percakapan tiket terkait.

---

## 10. Master Data Kontak OPD & Hierarki Resolusi Nama Pelapor

Sistem menetapkan hierarki resolusi identitas pelapor yang konsisten:
1. 🥇 **Master Data Hasil Impor Admin (`is_imported_contact=true`)** $\rightarrow$ Prioritas absolut, tidak pernah tertimpa oleh profil WhatsApp.
2. 🥈 **Edit Manual Staf via Dasbor (`is_custom_name=true`)**.
3. 🥉 **Kontak Buku Telepon Ponsel Gateway (`pushName`)**.
4. 🏅 **WhatsApp Push Name** $\rightarrow$ Disimpan ke kolom `wa_push_name` sebagai data pembanding.
5. 📱 **Nomor Telepon** (fallback terakhir).

- **Impor Kontak Multi-Format (Admin):**
  - Mendukung file **Excel (`.xlsx/.xls`)**, **CSV** (termasuk format ekspor resmi Google Contacts), dan **vCard (`.vcf`)**.
  - Normalisasi otomatis nomor telepon internasional (`08xxx` $\rightarrow$ `628xxx`).
- **Pembersihan Master Data:** Tombol `[ 🗑 Hapus Semua Kontak ]` dengan dialog konfirmasi wajib mengetik kata `HAPUS KONTAK`, proteksi data tiket aktif, dan reset sequence auto-increment `Customer_id_seq` ke angka 1.

---

## 11. Start New Chat (Outbound) & Direktori Kontak Paginasi

- **Panggilan Keluar (Outbound Initiation):** Tombol `[ ➕ Chat Baru ]` memungkinkan L1 atau Admin memulai obrolan ke nomor WhatsApp baru tanpa menunggu pelanggan menghubungi helpdesk terlebih dahulu.
- **Direktori Kontak Berpaginasi:** Modal menampilkan buku telepon master data kontak dengan pencarian instan dan tombol *Muat lebih banyak* berbasis paginasi server (`limit` dan `offset`).
- **Opsi Pesan Pembuka Otomatis:** Sakelar opsi untuk langsung mengirimkan pesan sapaan resmi pembuka ke nomor WhatsApp tujuan saat tiket dibuat.

---

## 12. Re-Open Tiket (Reaktivasi Transaksional Tiket Selesai)

- Untuk percakapan yang telah berstatus `CLOSED` namun pelanggan kembali melaporkan kendala terkait:
- L1 atau Admin dapat membuka tiket lampau pada tab filter *Selesai* dan mengklik tombol **`[ 🔄 Aktifkan Kembali Tiket ]`**.
- Sistem mengembalikan status menjadi `OPEN`, mengosongkan `closed_at`, mencatat alasan pembukaan kembali pada catatan internal, dan mereset status tim teknisi `TicketCategory` dalam satu transaksi atomik database (`prisma.$transaction`).

---

## 13. Laporan SLA (MTTR & FRT) serta Ekspor CSV (Supervisor)

- **Kalkulasi Metrik Layanan Otomatis:**
  - **First Response Time (FRT):** Rata-rata durasi dalam menit sejak pesan pertama pelanggan diterima hingga balasan pertama dari agen dikirimkan.
  - **Mean Time to Resolve (MTTR):** Rata-rata durasi penyelesaian kendala teknis murni sejak tiket dibuat hingga ditutup resmi. Percakapan biasa (`GENERAL_CHAT`) secara otomatis dikecualikan agar data SLA tidak bias.
- **Filter Fleksibel:** Filter rekapitulasi berdasarkan rentang tanggal dan klasifikasi jenis obrolan (`Semua`, `Aduan Teknis`, `Percakapan Biasa`).
- **Ekspor Laporan CSV:** Tombol *Export to CSV* menghasilkan berkas lembar kerja spreadsheet terformat rapi untuk pelaporan berkala pimpinan dinas.

---

## 14. Manajemen Pengguna & Kontak Blast Tim Lapangan (Admin)

- **Manajemen Akun Staf (Tab Users):**
  - Formulir pendaftaran akun petugas baru dengan pemilihan peran (`ADMIN`, `L1`, `L2`, `SPV`) dan penugasan kategori tim teknisi L2 (`Network`, `Server`, `M&E`).
  - Fitur ubah kata sandi staf dan penghapusan akun.
- **Manajemen Kontak Blast L2 (Tab Teams):**
  - Pengelolaan nomor WhatsApp personal atau ID grup WhatsApp (`xxx@g.us`) per divisi tim.
  - Mengatur target pengiriman blast notifikasi pendelegasian tiket secara dinamis tanpa perlu mengubah kode sumber atau konfigurasi server.

---

## 15. Pengaturan Bot Sambutan Otomatis (L1)

- **Tab Bot Settings:**
  - Sakelar ON/OFF status keaktifan pesan balasan otomatis sambutan (*welcome message*).
  - Editor area teks untuk menyesuaikan narasi pembuka helpdesk sesuai kebutuhan dinas.
  - Konfigurasi disimpan secara dinamis ke tabel `Setting` pada basis data PostgreSQL.

---

## 16. Background Workers: Sesi Keep-Alive & Retensi Berkas

1. **Worker HTS Keep-Alive (`htsKeepAliveService.js`):**
   - Berjalan terjadwal setiap **15 menit**.
   - Melakukan *heartbeat ping* ke portal HTS guna memperbarui masa berlaku sesi cookie PHP `ci_session` agar L1 tidak ter-logout saat jam operasional.
2. **Worker Retensi Berkas (`fileCleanupService.js`):**
   - Berjalan terjadwal setiap **24 jam**.
   - Memindai dan menghapus berkas fisik lampiran pada folder `/uploads/` untuk tiket yang telah berstatus `CLOSED` lebih dari **90 hari**, menjaga kapasitas penyimpanan server VPS tetap sehat dan terkendali.

---

## 17. Hardening Keamanan & Integritas Transaksi Sistem

- **Proteksi Injeksi Webhook:** Validasi `WEBHOOK_SECRET` dengan perbandingan string waktu-konstan (`crypto.timingSafeEqual`).
- **Penegakan Hak Akses Server-Side:** Middleware `verifyToken` dan `requireRole` di setiap rute operasional Express.
- **Koneksi WebSocket Terotentikasi:** Middleware `io.use` memeriksa JWT token pada handshake awal dan mengisolasi soket ke ruang *rooms* terpartisi.
- **Sanitasi Jalur Berkas:** Fungsi `safePath.js` mengeliminasi celah *Directory Traversal* (`../`).
- **Proteksi Variabel Lingkungan:** Modul `config/env.js` memastikan peladen berhenti seketika (*fail-fast*) jika kredensial rahasia belum dikonfigurasi.
- **Integritas Konkurensi Database:** Mutex per-nomor `perNumberLock`, indeks unik `Message.wa_message_id`, dan penanganan error Prisma `P2002` yang elegan.
