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

## 🗺️ 7. Panduan Pelaksanaan Bertahap
*Lihat dokumen panduan detail di: **[`docs/Implementation_Plan_V4.md`](./Implementation_Plan_V4.md)***.
Pengerjaan dibagi ke dalam 6 fase terukur:
1. **Fase 1:** Basis Data `TicketHts`, Migrasi Data Aman & Keep-Alive Sesi HTS.
2. **Fase 2:** Catatan Internal Multimedia L1 $\leftrightarrow$ L2 & Integrasi Bukti Foto HTS.
3. **Fase 3:** Timeline Divider Riwayat Chat Lampau & Penarikan WA Lama (Anti-Banned).
4. **Fase 4:** Redesign UI/UX 3 Kolom, Slide-over Drawer & Responsivitas Layar.
5. **Fase 5:** Quick Replies, Audio Alerts & SLA Analytics.
6. **Fase 6:** Pengujian Menyeluruh (UAT) & Stabilisasi Akhir.
