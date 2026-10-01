# 🚀 Roadmap & Spesifikasi Arsitektur V4.0 (Rombak Besar)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Dokumen:** Cetak Biru Pengembangan, Arsitektur Database, dan Redesign UI/UX  
**Status:** Draf Perencanaan Matang (Tahap Brainstorming)  
**Tanggal:** 30 September 2026  

---

## 📌 1. Latar Belakang & Tujuan Perombakan V4

Sistem saat ini (V3.0) telah berhasil menghubungkan alur kerja WhatsApp Helpdesk dengan Portal HTS Diskomdigi Jawa Tengah. Namun, seiring dengan operasional harian yang dinamis, ditemukan kebutuhan tingkat lanjut:
1. **Multi-Kendala dalam 1 Aduan:** Pelapor menyampaikan lebih dari satu kendala teknis (misal: Jaringan + Server) dalam 1 obrolan WhatsApp, sedangkan portal HTS mewajibkan 1 sub-kategori spesifik per nomor tiket HTS.
2. **Konteks Riwayat Lampau yang Terputus:** Saat tiket lama berstatus `CLOSED` dan pelanggan mengirim pesan baru, L1 kehilangan riwayat percakapan sebelumnya. Di sisi lain, histori chat sebelum sistem terintegrasi ke Evolution API belum dapat dibaca.
3. **Catatan Internal Multimedia:** Teknisi lapangan L2 membutuhkan kemampuan mengirimkan foto kendala/bukti penanganan langsung ke catatan internal tanpa bocor ke WhatsApp pelapor.
4. **UI/UX yang Terlalu Banyak Modal Pop-up:** Tampilan dasbor saat ini terlalu padat dengan modal pop-up yang saling tumpang tindih sehingga membutuhkan antarmuka modern yang lebih bersih (*clean desk layout*).
5. **Percakapan Biasa / Non-Aduan Mengotori Pipeline Tiket:** Pesan masuk seperti sapaan (*"Pagi"*, *"Tes"*), pertanyaan umum kantor (jam kerja, info kontak), atau salah sambung saat ini otomatis membuat tiket aduan teknis resmi, memicu kewajiban form penutupan teknis yang rumit bagi L1, serta merusak akurasi metrik SLA (MTTR).

---

## 🏛️ 2. Pilar 1: Multi-HTS Ticket Hub (1 Chat $\rightarrow$ Multi-Tiket HTS)

### A. Konsep Relasi
Mengubah keterikatan 1-ke-1 antara tiket Helpdesk dan HTS menjadi relasi **1-ke-Banyak (One-to-Many)**.
Satu ruang obrolan pelanggan dapat memiliki daftar tiket HTS yang diterbitkan secara fleksibel:
- **Diterbitkan Bersamaan di Awal:** L1 menugaskan tim Network + Server, dan langsung membuatkan 2 tiket HTS sekaligus.
- **Diterbitkan Menyusul di Tengah Jalan:** Di tengah penanganan, pelapor mengabarkan kendala kedua, L1 cukup menekan tombol `[+ Terbitkan Tiket HTS Baru]`.

### B. Rancangan Model Basis Data (`TicketHts`)
```prisma
model TicketHts {
  id                Int          @id @default(autoincrement())
  ticket_id         Int
  ticket            Ticket       @relation(fields: [ticket_id], references: [id], onDelete: Cascade)
  category_id       Int?         // Terhubung ke tim L2 terkait (Network / Server / M&E)
  category          Category?    @relation(fields: [category_id], references: [id])
  hts_ticket_id     String       // ID numerik asli trouble di HTS (misal: "2025")
  hts_ticket_no     String       // Nomor aduan resmi HTS (misal: "2025-TShoot-2026-jateng-09")
  hts_ticket_status String       // "PENDING" | "SOLVED"
  hts_kategori      String       // "troubleshoot" | "request" | "monitoring"
  hts_sub_kategori  String?      // "DISTRIBUTION NETWORK" | "SERVER" | dll
  hts_detil         String       // Uraian kendala spesifik tiket HTS ini
  hts_pic_ids       String?      // JSON array ID PIC penerima & penanganan
  solution          String?      @db.Text // Solusi penanganan tiket HTS ini
  created_at        DateTime     @default(now())
  solved_at         DateTime?
}
```

### C. Alur Penutupan (Closing Workflow)
- Masing-masing tiket HTS dapat diselesaikan mandiri saat tim terkait tuntas (`SOLVED`).
- Tiket obrolan lokal baru resmi `CLOSED` jika seluruh tiket HTS terkait telah selesai, atau L1 dapat menyelesaikan seluruh tiket HTS yang tersisa secara serentak pada form penutupan tiket (*smart closure wizard*).

---

## 📜 3. Pilar 2: Riwayat Percakapan Lampau & Sinkronisasi WA Lama

### A. Visual Timeline Divider (Riwayat Tiket Lokal Masa Lalu)
Menampilkan percakapan dari tiket-tiket lampau yang sudah `CLOSED` di dalam ruang obrolan tiket aktif dengan gaya visual terlipat (*accordion*):
- Gelembung chat masa lalu menggunakan gaya *dimmed / semi-transparan*.
- Dipisahkan oleh garis batas penanda waktu penutupan tiket:  
  `── 🔒 TIKET LALU #12 (Closed: 15 Sep 2026 - Kendala Jaringan) ──`
- Mencegah kebingungan agen antara kendala aktif saat ini dan kendala lampau.

### B. Penarikan Riwayat WhatsApp Lama (Sebelum Sistem Terpasang)
- **Analisis Keamanan (Anti-Banned):**
  - **TIDAK MENGGUNAKAN** *Full History Sync Massal* saat scan QR (berisiko tinggi memicu freeze/banned Meta).
  - **MENGGUNAKAN Metode On-Demand (Lazy-Load):** Hanya menarik 10–20 pesan terakhir untuk kontak spesifik yang sedang dibuka tiketnya via endpoint Evolution API `/chat/findMessages`. Pola ini 100% identik dengan cara kerja WhatsApp Web resmi sehingga aman dari risiko pemblokiran.
- **Pembeda Visual:**
  Gelembung chat dari histori WhatsApp lama diberi badge penanda:  
  `📥 Riwayat Pesan WhatsApp (Sebelum Helpdesk Terintegrasi)` (bersifat arsip *read-only*).

---

## 📷 4. Pilar 3: Catatan Internal Multimedia Dua Arah (L1 $\leftrightarrow$ L2)

### A. Kebutuhan Lapangan
- Teknisi L2 dapat memfoto kondisi perangkat, kabel fiber optik, atau topologi jaringan di lapangan dan mengirimkannya langsung ke Catatan Internal.
- Dispatcher L1 dapat melampirkan denah ruangan atau dokumen teknis ke Catatan Internal.
- **Jaminan Kerahasiaan:** File gambar yang dikirimkan pada Catatan Internal **100% RAHASIA** (`is_internal = true`) dan **TIDAK AKAN PERNAH** terkirim ke WhatsApp pelapor.

### B. Integrasi Bukti Penyelesaian HTS
- Foto yang dikirimkan teknisi L2 di catatan internal otomatis muncul sebagai opsi pilihan gambar saat L1 menutup tiket HTS (*"Pilih dari Foto Lapangan L2"*), menghemat waktu tanpa perlu unduh-unggah ulang berkas.

---

## 🎨 5. Pilar 4: Redesign UI/UX (Modern Clean-Desk Layout)

### A. Evaluasi Masalah Antarmuka Saat Ini
1. Terlalu banyak modal pop-up yang menumpuk di tengah layar.
2. Tumpang tindih input HTS di berbagai tempat.
3. Panel samping kanan terlalu sempit untuk memuat informasi multi-tiket.

### B. Konsep Layout 3 Kolom Modern (Zendesk / Freshdesk Style)
```
┌──────────────┬───────────────────────────────┬──────────────────────────────┐
│  KOLOM KIRI  │         KOLOM TENGAH          │         KOLOM KANAN          │
│ (Nav & List) │     (Chat & Riwayat)          │    (Pusat Kendali / Panel)   │
├──────────────┼───────────────────────────────┼──────────────────────────────┤
│ • Tab Filter:│ • Header Chat:                │ TAB 1: 🏛️ HUB TIKET HTS      │
│   - Semua    │   Nama Pelapor, OPD,          │ ---------------------------- │
│   - L1/L2    │   Badge Tim L2 Aktif          │ Daftar Tiket HTS Terhubung:  │
│   - Pending  │                               │ 1. #2025-TShoot (Network)    │
│     HTS      │ • Ruang Obrolan:              │    [Status: PENDING]         │
│   - Resolved │   - Accordion Chat Lampau     │    [Selesaikan]              │
│              │   - Chat Aktif Saat Ini       │                              │
│ • List Tiket │                               │ 2. #2026-TShoot (Server)     │
│   (Avatar,   │ • Input Bar Bawah:            │    [Status: SOLVED]          │
│    Snippet,  │   [Balas WA] | [Catatan L2]   │                              │
│    Tag Tim)  │   Ketik pesan + tombol 📎     │ [+ Terbitkan Tiket HTS Baru] │
│              │   (bisa kirim gambar internal)│ ---------------------------- │
│              │                               │ TAB 2: 👥 TIM L2 & STATUS    │
│              │                               │ Penugasan & Solusi Lapangan  │
│              │                               │ ---------------------------- │
│              │                               │ TAB 3: 👤 PROFIL & RIWAYAT   │
│              │                               │ No HP, Instansi, Histori     │
└──────────────┴───────────────────────────────┴──────────────────────────────┘
```

### C. Penggantian Modal Pop-up dengan Slide-Over Drawer
- Formulir penerbitan tiket HTS dan formulir penugasan tim tidak lagi membuka modal pop-up yang memblokir layar, melainkan membuka **Laci Samping Geser (*Slide-Over Drawer*)** di sisi kanan layar. Agen tetap dapat membaca riwayat obrolan di tengah sambil mengisi formulir.

### D. Fleksibilitas Resolusi Layar & Desain Adaptif (Multi-Screen Adaptive)
- **Laptop Standar (1366×768):** Panel kanan dapat disembunyikan/dilipat (*Collapsible Panel*) dengan tombol toggle satu klik, memberikan ruang obrolan yang luas dan tidak berhimpitan.
- **Formulir Anti-Terpotong (*Sticky Viewport Height*):** Header dan tombol submit di bawah selalu menempel (*sticky*), hanya konten isian tengah yang bergulir, menjamin tombol aksi tidak pernah tenggelam di luar layar laptop.
- **Mode Khusus Mobile (Teknisi L2):** Di layar ponsel, antarmuka otomatis berubah menjadi tampilan satu kolom bersih (seperti aplikasi WhatsApp) dengan integrasi kamera instan untuk memudahkan teknisi memfoto kendala di lapangan.

---

## ⚡ 6. Pilar 5: Otomasi, Efisiensi Kerja & Metrik Layanan

### A. Template Balasan Cepat (*Quick Replies / Canned Responses*)
- Petugas L1 dapat mengetik tanda garis miring (`/`) di kotak obrolan untuk memunculkan daftar pintasan kalimat yang sering digunakan (misal: `/modem`, `/progres`, `/teruskan`).
- Menghemat waktu pengetikan dan menjaga keseragaman bahasa layanan publik.

### B. Penjaga Sesi HTS Tetap Aktif (*Keep-Alive Heartbeat*)
- Background cron/timer di backend melakukan ping ringan berkala (`GET /api/notif`) ke portal HTS setiap 15 menit.
- Sesi cookie `ci_session` petugas tidak akan pernah kedaluwarsa selama jam kerja kantor (08:00 – 16:00), menghilangkan kerepotan input CAPTCHA berulang kali.

### C. Notifikasi Suara Web Audio & Desktop Alert untuk L2
- Memainkan nada dering halus (*audio chime*) saat ada penugasan tiket baru ke tim teknisi L2.
- Memunculkan notifikasi browser (*Desktop Notification*) meskipun dasbor sedang di-minimize.

### D. Pengukuran SLA & Kecepatan Respon (Laporan SPV)
- Menghitung otomatis **First Response Time (FRT)**: selisih waktu chat pertama masuk hingga balasan pertama dikirim.
- Menghitung otomatis **Durasi Penanganan (MTTR)**: selisih waktu tiket dibuat hingga closed.
- Tampil di tabel menu Rekap Hasil Aduan dan ekspor CSV.

---

## 💬 7. Pilar 6: Penanganan Percakapan Biasa vs Aduan Teknis (Dual-Nature Interaction)

### A. Konsep & Filosofi
Tidak semua pesan WhatsApp yang masuk merupakan keluhan/gangguan teknis yang harus diterbitkan tiketnya ke tim teknisi L2 atau portal HTS. Banyak interaksi yang berupa pertanyaan umum (jam layanan kantor, alamat instansi), konsultasi santai, sapaan (*"Pagi"*, *"Tes"*), atau konfirmasi biasa.
- Sistem mengadopsi model **Dual-Nature Interaction** di mana satu ruang obrolan dapat bertindak sebagai **Percakapan Biasa (General Chat)** atau **Aduan Teknis Resmi (Technical Ticket)** tanpa perlu membuat tabel percakapan baru.
- Model data `Ticket` diperkaya dengan atribut `is_aduan Boolean @default(false)` dan nilai klasifikasi layanan `ServiceType.GENERAL_CHAT`.

### B. Toggle Manual Fleksibel di Header Obrolan (L1 Control)
- Pada header obrolan di Kolom Tengah, L1 dibekali tombol sakelar/toggle interaktif:  
  `[ 💬 Percakapan Biasa ]` $\longleftrightarrow$ `[ 🚨 Aduan Teknis ]`
- L1 dapat secara leluasa mengubah status obrolan kapan saja sesuai substansi percakapan dengan satu klik.

### C. Promosi Otomatis ke Aduan (*Smart Auto-Promotion*)
- Jika obrolan sedang berada dalam mode *Percakapan Biasa*, tetapi L1 melakukan salah satu aksi berikut:
  1. Menugaskan Tim Teknisi L2 (`[👥 Tugaskan Tim L2]`), atau
  2. Menerbitkan Tiket HTS (`[+ Terbitkan Tiket HTS Baru]`),
- Sistem secara **cerdas dan otomatis** mengubah toggle menjadi **`Aduan Teknis` (`is_aduan = true`)** serta menyesuaikan `service_type` menjadi `TROUBLESHOOTING` atau `REQUEST_LAYANAN`. Hal ini mencegah L1 lupa menggeser sakelar secara manual.

### D. Alur Penutupan Cepat (*One-Click Resolution for General Chat*)
- **Ketika Mode Percakapan Biasa Aktif:**
  - L1 tidak dibebani modal penutupan yang rumit (tidak perlu memilih tim L2, tidak perlu menyelesaikan HTS, tidak wajib mengetik uraian solusi teknis panjang).
  - Cukup mengklik tombol aksi: **`[ ✅ Selesaikan Percakapan ]`**.
  - Status tiket langsung berubah menjadi `CLOSED` dengan ringkasan default.
- **Ketika Mode Aduan Teknis Aktif:**
  - Form penutupan tiket tetap menjalankan *Smart Closure Wizard* lengkap (validasi penyelesaian tim L2, sinkronisasi solusi teknis, dan submit penutupan tiket portal HTS).

### E. Isolasi Antrean Teknisi L2 & Kebersihan Notifikasi
- Tiket yang berstatus *Percakapan Biasa* (`is_aduan = false`) **100% TIDAK DIMUNCULKAN** di layar antrean teknisi L2 (Network, Server, M&E).
- Teknisi L2 hanya menerima dan melihat tiket yang sah menjadi aduan teknis dan telah ditugaskan ke tim mereka, menjaga fokus kerja teknisi di lapangan tetap bersih dari obrolan santai.

### F. Pelaporan Rekapitulasi & Netralitas SLA (SPV)
- **Tampilan 1 Tabel Terpadu:** Menu Rekap Hasil Aduan menampilkan seluruh riwayat dengan badge pembeda yang jelas (`[ 💬 Percakapan Umum ]` vs `[ 🚨 Aduan: Network/Server ]`). Filter dropdown memungkinkan SPV memfilter: *Semua*, *Aduan Teknis*, atau *Percakapan Biasa*.
- **Pengecualian SLA:** Percakapan biasa **secara otomatis dikecualikan** dari perhitungan metrik durasi penanganan teknis (*Mean Time to Resolve - MTTR*), sehingga rata-rata durasi penyelesaian gangguan teknis tetap valid, objektif, dan akurat.

---

## 🗺️ 8. Panduan Pelaksanaan Bertahap
*Lihat dokumen panduan detail di: **[`docs/Implementation_Plan_V4.md`](./Implementation_Plan_V4.md)***.
Pengerjaan dibagi ke dalam 6 fase terukur:
1. **Fase 1:** Basis Data `TicketHts`, Klasifikasi `is_aduan` & `GENERAL_CHAT`, Migrasi Data Aman & Keep-Alive Sesi HTS.
2. **Fase 2:** Catatan Internal Multimedia L1 $\leftrightarrow$ L2 & Integrasi Bukti Foto HTS.
3. **Fase 3:** Timeline Divider Riwayat Chat Lampau & Penarikan WA Lama (Anti-Banned).
4. **Fase 4:** Redesign UI/UX 3 Kolom, Toggle Percakapan/Aduan, Slide-over Drawer & Responsivitas Layar.
5. **Fase 5:** Quick Replies, Selesaikan Percakapan Cepat, Audio Alerts & SLA Analytics Bersih.
6. **Fase 6:** Pengujian Menyeluruh (UAT) & Stabilisasi Akhir.
