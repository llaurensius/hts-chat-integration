# 🚀 Fitur & Kemampuan Sistem (Features & Capabilities)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V4.0 Produksi  
**Terakhir Diperbarui:** 01 Oktober 2026  

Dokumen ini mendefinisikan seluruh fitur fungsional, kapabilitas bisnis, dan alur kerja operasional yang aktif di sistem saat ini.

---

## 📌 Daftar Isi
1. [Integrasi WhatsApp Gateway & Sinkronisasi Dua Arah](#1-integrasi-whatsapp-gateway--sinkronisasi-dua-arah)
2. [Klasifikasi Obrolan: Percakapan Biasa vs Aduan Teknis](#2-klasifikasi-obrolan-percakapan-biasa-vs-aduan-teknis)
3. [Arsitektur Multi-HTS (1 Chat ke Banyak Tiket HTS Resmi)](#3-arsitektur-multi-hts-1-chat-ke-banyak-tiket-hts-resmi)
4. [Penautan Manual & Pemulihan Tiket HTS (Disaster Recovery)](#4-penautan-manual--pemulihan-tiket-hts-disaster-recovery)
5. [Pendelegasian Tugas Multi-Assign & WhatsApp Blast L2](#5-pendelegasian-tugas-multi-assign--whatsapp-blast-l2)
6. [Catatan Internal Multimedia Dua Arah (L1 ↔ L2)](#6-catatan-internal-multimedia-dua-arah-l1--l2)
7. [Riwayat Lampau, Timeline Divider & Tarik Arsip WhatsApp](#7-riwayat-lampau-timeline-divider--tarik-arsip-whatsapp)
8. [Efisiensi Dispatcher: Balasan Cepat (Quick Replies) & Audio Chime](#8-efisiensi-dispatcher-balasan-cepat-quick-replies--audio-chime)
9. [Resolusi Identitas Pelapor Hybrid](#9-resolusi-identitas-pelapor-hybrid)
10. [Laporan Rekapitulasi, Metrik SLA (MTTR/FRT) & Ekspor CSV](#10-laporan-rekapitulasi-metrik-sla-mttrfrt--ekspor-csv)
11. [Manajemen Pengguna & Pengaturan Sistem (Admin Only)](#11-manajemen-pengguna--pengaturan-sistem-admin-only)

---

## 1. Integrasi WhatsApp Gateway & Sinkronisasi Dua Arah

- **Mesin Gateway:** Didukung oleh **Evolution API v2 (Baileys Engine)** berjalan di dalam kontainer Docker lokal.
- **Pesan Masuk (Inbound):**
  - Webhook otomatis mendeteksi event `messages.upsert`.
  - Pesan dari pelanggan langsung memunculkan tiket baru berstatus `OPEN` (default: Percakapan Biasa) atau menyambung ke tiket aktif yang belum ditutup.
  - Mendukung pesan teks, gambar, video, dan dokumen.
- **Balasan Dua Arah Riil (Web Dashboard & HP WhatsApp):**
  - **Via Dashboard:** Petugas L1 dapat mengetik balasan langsung dari layar web.
  - **Via HP WhatsApp Fisik:** Petugas helpdesk yang membalas langsung dari ponsel WhatsApp resmi tersinkronisasi otomatis ke aplikasi web sebagai balasan agen (`AGENT`).
  - **Dukungan WhatsApp LID Addressing:** Sistem mampu memetakan pesan yang menggunakan enkripsi privasi akun WhatsApp (`@lid`) kembali ke nomor telepon asli pelanggan (`@s.whatsapp.net`).
  - **Deduplikasi Cerdas:** Sistem mencegah penggandaan gelembung chat saat pesan dikirim via dashboard menggunakan pencatatan `wa_message_id`.
- **Bot Auto-Reply:**
  - Balasan otomatis dapat diaktifkan/dinonaktifkan (*toggle switch*) oleh L1.
  - Template pesan bot dapat dikustomisasi langsung melalui antarmuka web.
  - Bot hanya membalas pesan masuk pertama dari pelanggan, dan tidak akan terpicu jika helpdesk yang memulai chat duluan.

---

## 2. Klasifikasi Obrolan: Percakapan Biasa vs Aduan Teknis

Untuk menjaga akurasi laporan performa SLA, sistem memisahkan jenis pesan masuk menjadi dua kategori:

1. **Percakapan Biasa (`GENERAL_CHAT`):**
   - Ditujukan untuk konsultasi umum, salam sapa, pertanyaan informasi, atau pesan salah sambung.
   - **Tombol Penyelesaian Cepat:** L1 dapat menyelesaikan percakapan secara instan dengan tombol `[ ✅ Selesaikan Percakapan ]` tanpa perlu mengisi formulir HTS atau solusi teknisi.
   - **Isolasi Antrean L2:** Percakapan biasa tidak muncul di layar teknisi L2 (`where.is_aduan = true`).
   - **Bebas Metrik SLA:** Dikecualikan 100% dari perhitungan durasi penyelesaian MTTR agar tidak merusak metrik kinerja.
2. **Aduan Teknis Resmi (`is_aduan = true`):**
   - Ditujukan untuk gangguan jaringan, server, aplikasi, atau infrastruktur M&E.
   - **Auto-Promotion:** Percakapan biasa otomatis naik status menjadi aduan teknis saat:
     - L1 menugaskan tiket ke tim teknisi L2 (`assignTicket`).
     - L1 menerbitkan atau menautkan tiket ke portal resmi HTS Diskomdigi.
   - **Toggle Manual:** L1 dapat mengklik badge `💬 Percakapan Biasa` untuk beralih secara fleksibel ke `🚨 Aduan Teknis` kapan saja.

---

## 3. Arsitektur Multi-HTS (1 Chat ke Banyak Tiket HTS Resmi)

Satu obrolan WhatsApp dari pelanggan seringkali melibatkan lebih dari satu masalah teknis (misalnya kendala koneksi internet sekaligus permohonan restart server). Sistem V4 mengadopsi model relasi **One-to-Many (`Ticket` $\rightarrow$ `TicketHts[]`)**:

- **Banyak Nomor HTS per Percakapan:** L1 dapat menerbitkan beberapa nomor aduan resmi HTS secara mandiri pada percakapan yang sama ke divisi yang berbeda.
- **Penyelesaian Parsial (*Partial Resolution*):** Setiap tiket HTS memiliki status mandiri (`PENDING` atau `SOLVED`). Penyelesaian tiket HTS divisi Network tidak akan membatalkan tiket HTS divisi Server.
- **Sinkronisasi Sesi Otomatis (*Keep-Alive Heartbeat*):** Servis latar belakang memvalidasi sesi cookie PHP `ci_session` ke server HTS setiap 15 menit agar petugas tidak logout mendadak saat bertugas.

---

## 4. Penautan Manual & Pemulihan Tiket HTS (Disaster Recovery)

Jika terjadi kendala koneksi internet saat submit tiket ke portal HTS, sistem menyediakan fitur pemulihan:

- **Tab Form Penautan Manual:** Drawer HTS menyediakan dua tab:
  - `[ ➕ Terbitkan Tiket Baru ]` — Pipeline registrasi standar ke HTS.
  - `[ 🔗 Tautkan yang Sudah Ada ]` — Menginput nomor tiket HTS yang sudah terlanjur terbit di portal resmi.
- **Verifikasi Nomor Tiket:** Sistem mengecek ke server portal HTS untuk memastikan keabsahan nomor aduan sebelum ditautkan.
- **Deteksi Tiket Duplikat:** Mencegah satu nomor HTS ditautkan ke dua percakapan berbeda (peringatan dialog konfirmasi *force link*).
- **Pemulihan Tiket Gantung (`INPUT_PIC`):** Menyediakan tombol **`[ ⚡ Lengkapi Penugasan PIC di HTS ]`** jika tiket terhenti pada tahap pemilihan teknisi.

---

## 5. Pendelegasian Tugas Multi-Assign & WhatsApp Blast L2

- **3 Pilar Tim Teknisi L2:** `Network`, `Server`, dan `Mechanical & Electrical (M&E)`.
- **Multi-Assign Cerdas:** L1 dapat mencentang lebih dari satu tim sekaligus. Menambahkan tim baru tidak akan mereset tim yang sedang bertugas atau yang telah selesai.
- **WhatsApp Multi-Contact Blast:** Saat didelegasikan, sistem secara otomatis membroadcast pesan notifikasi WA berformat rapi ke seluruh personil dan grup WA teknisi yang terdaftar pada tim tersebut.
- **Penyelesaian Per-Tim (*Per-Team Resolution*):** Setiap tim menandai selesai tugas bagiannya secara mandiri (`is_resolved = true`) beserta catatan solusi. Tiket utama otomatis `RESOLVED` hanya saat seluruh tim telah menyatakan selesai.
- **Pelepasan Tugas Mandiri (*Self-Unassign Return*):** Teknisi dapat melepas tugas jika salah sasaran penugasan disertai alasan pengembalian.

---

## 6. Catatan Internal Multimedia Dua Arah (L1 ↔ L2)

- **Pemisahan Mode Chat:** Petugas L1 memiliki sakelar dua tab:
  - Tab 💬 **Balas Pelanggan:** Pesan dikirimkan ke WhatsApp pelanggan.
  - Tab 🔒 **Catatan Internal (Kuning):** Pesan hanya dibaca oleh tim internal (L1, L2, Admin) dan tidak pernah dikirim ke pelanggan.
- **Dukungan Media Gambar Internal:** Teknisi L2 dan L1 dapat saling mengirim foto kendala kabel, topologi, atau layar server di tab internal.
- **Pemanfaatan Foto L2 untuk Bukti HTS:** Foto catatan internal L2 dapat dipilih langsung oleh L1 sebagai berkas lampiran penutupan tiket di portal resmi HTS tanpa perlu download-upload ulang.

---

## 7. Riwayat Lampau, Timeline Divider & Tarik Arsip WhatsApp

- **Accordion Riwayat Lampau:** Di bagian atas jendela chat, terdapat tombol collapsible untuk melihat seluruh tiket lama dari pelanggan yang sama yang sudah berstatus `CLOSED`.
- **Timeline Divider:** Chat lama ditampilkan secara redup (*dimmed*) dengan pembatas visual yang jelas, memisahkan riwayat lampau dengan percakapan aktif saat ini.
- **Tarik Arsip WhatsApp (*On-Demand Lazy Load*):**
  - Tombol **`[ 📥 Tarik Arsip WA ]`** mengambil 20 pesan historis langsung dari memori WhatsApp via Evolution API.
  - Bekerja baik untuk pesan era lama maupun pesan baru berbasis WhatsApp LID.

---

## 8. Efisiensi Dispatcher: Balasan Cepat (Quick Replies) & Audio Chime

- **Penyaran Balasan Cepat (*Slash Commands*):**
  - Ketik tanda garis miring (`/`) pada kotak input untuk memunculkan popup daftar template balasan cepat (contoh: `/salam`, `/aduan`, `/progres`, `/selesai`).
  - Navigasi keyboard responsif (panah atas/bawah dan tombol Enter untuk memilih).
- **Manajemen Template:** Dispatcher dan Admin dapat menambah, mengedit, dan menghapus template balasan cepat di pengaturan.
- **Notifikasi Suara (*Web Audio API*):**
  - Chime nada sintesis native dua nada (D5 $\rightarrow$ A5) yang berbunyi seketika saat ada pesan pelanggan baru atau penugasan tiket masuk.
  - Dilengkapi tombol toggle Mute/Unmute audio di bar navigasi atas.
- **HTML5 Desktop Notification:** Notifikasi desktop browser yang tetap muncul meskipun tab aplikasi sedang diminimize.

---

## 9. Resolusi Identitas Pelapor Hybrid

Sistem menggunakan hierarki cerdas untuk menentukan nama pelapor yang ditampilkan:
1. **Nama Kustom Dasbor:** Nama yang telah disunting secara manual oleh L1/Admin (prioritas tertinggi).
2. **Buku Kontak HP Helpdesk:** Nama kontak resmi yang tersimpan di buku telepon ponsel WhatsApp gateway.
3. **WhatsApp Push Name:** Nama profil akun WhatsApp yang disetel oleh pengguna.
4. **Nomor Telepon:** Fallback jika nama tidak tersedia.

Dispatcher L1 dan Admin dapat memperbarui nama pelapor dan nama instansi/SKPD secara langsung melalui tombol edit pensil di header chat.

---

## 10. Laporan Rekapitulasi, Metrik SLA (MTTR/FRT) & Ekspor CSV

- **Metrik KPI Dasbor SPV & Admin:**
  - Total Percakapan Masuk.
  - Total Aduan Teknis Murni.
  - Total Percakapan Biasa.
  - Rata-rata Waktu Respons Awal (*First Response Time - FRT*).
  - Rata-rata Durasi Penyelesaian Aduan Murni (*Mean Time to Resolve - MTTR*).
- **Tabel Rekapitulasi Lengkap:** Menampilkan ID tiket, nama pelapor, instansi SKPD, tim teknisi, jenis layanan, tanggal masuk, durasi penanganan, status, dan kesimpulan akhir (*mandatory summary*).
- **Filter Berdasarkan Tanggal & Kategori:** Memfilter data rekapitulasi berdasarkan rentang waktu atau tim teknisi.
- **Ekspor Data ke CSV:** Mengunduh seluruh rekapitulasi dalam format spreadsheet Excel/CSV yang kompatibel dengan format pelaporan kedinasan.

---

## 11. Manajemen Pengguna & Pengaturan Sistem (Admin Only)

- **Manajemen Akun Pengguna (CRUD Penuh):** Admin dapat membuat akun baru, memperbarui peran (`ADMIN`, `L1`, `L2`, `SPV`), menetapkan divisi tim teknisi L2, serta melakukan reset kata sandi staf.
- **Buku Kontak Notifikasi Tim L2:** Admin dapat mengelola nomor telepon WhatsApp personil maupun ID Grup WA (`@g.us`) yang menjadi target blast penugasan per divisi.
- **Pembersihan Data Testing & Reset Penomoran ID:** Admin dapat menghapus data aduan testing dan mereset penomoran urut tiket database PostgreSQL kembali ke ID #1.
