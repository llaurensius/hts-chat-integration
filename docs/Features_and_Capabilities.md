# 🚀 Fitur & Kemampuan Sistem (Features & Capabilities)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V4.1 Produksi  
**Status:** Semua fitur tercantum aktif di kode riil  
**Terakhir Diperbarui:** 02 Oktober 2026  

---

## 📌 Daftar Isi
1. [Integrasi WhatsApp Gateway & Sinkronisasi Dua Arah](#1)
2. [Klasifikasi Obrolan: Percakapan Biasa vs Aduan Teknis](#2)
3. [Arsitektur Multi-HTS (1 Chat → Banyak Tiket HTS)](#3)
4. [Penautan Manual & Pemulihan Tiket HTS (Disaster Recovery)](#4)
5. [Pendelegasian Multi-Assign & WhatsApp Blast L2](#5)
6. [Catatan Internal Multimedia Dua Arah (L1 ↔ L2)](#6)
7. [Riwayat Lampau & Tarik Arsip WhatsApp](#7)
8. [Efisiensi Dispatcher (Quick Replies, Audio, SLA)](#8)
9. [Master Data Kontak & Hierarki Nama Pelapor](#9)
10. [Start New Chat (Outbound) & Direktori Kontak](#10)
11. [Re-Open Tiket (Aktifkan Kembali Percakapan Selesai)](#11)
12. [Resolusi Identitas Pelapor Hybrid](#12)
13. [Laporan SLA (MTTR/FRT) & Ekspor CSV](#13)
14. [Manajemen Pengguna & Pengaturan Sistem (Admin)](#14)

---

## 1. Integrasi WhatsApp Gateway & Sinkronisasi Dua Arah

- **Mesin Gateway:** Evolution API v2.3.7 (Baileys) berjalan di kontainer Docker lokal.
- **Pesan Masuk (Inbound):**
  - Webhook `POST /api/webhook/whatsapp` menangani event `messages.upsert`.
  - Pesan pelanggan baru otomatis membuat tiket `OPEN` (default: Percakapan Biasa); pesan susulan menyambung ke tiket aktif (`OPEN`/`RESOLVED`).
  - Dukungan teks, gambar, video, dokumen.
- **Balasan Dua Arah Riil (Web Dashboard & HP WhatsApp Fisik):**
  - **Via Dashboard:** Petugas L1 membalas langsung dari web.
  - **Via HP WhatsApp Fisik:** Balasan dari nomor helpdesk tersinkronisasi otomatis ke aplikasi web sebagai `AGENT` (fitur V4.1 — fix filter `fromMe`).
  - **Dukungan WhatsApp LID Addressing:** pemetaan `@lid` → nomor HP asli via `key.remoteJidAlt`.
  - **Deduplikasi Cerdas:** kolom `Message.wa_message_id` mencegah balon ganda; time-window 60 detik untuk balasan agen.
  - **Race-Condition Safety:** `prisma.customer.upsert` atomik + fallback pembuatan tiket jika dua webhook masuk paralel.
- **Anti-Collision Berkas:** nama upload `img_<timestamp>_<randomSuffix>` (mencegah overwrite di milidetik sama).
- **Bot Auto-Reply:**
  - Sakelar ON/OFF + template kustom via antarmuka web (khusus L1).
  - Hanya terpicu saat pesan masuk dari pelanggan (`fromMe=false`) — tidak membalas percakapan yang dibantu helpdesk duluan.

---

## 2. Klasifikasi Obrolan: Percakapan Biasa vs Aduan Teknis

1. **Percakapan Biasa (`GENERAL_CHAT`, `is_aduan=false`):**
   - Konsultasi umum, sapaan, informasi, salah sambung.
   - **Tombol `[ ✅ Selesaikan Percakapan ]`** — penyelesaian instan tanpa formulir HTS.
   - **Isolasi Antrean L2:** tidak muncul di layar teknisi (`is_aduan=true`).
   - **Bebas SLA:** dikecualikan 100% dari kalkulasi MTTR agar metrik tetap murni.
2. **Aduan Teknis Resmi (`is_aduan=true`):**
   - Gangguan jaringan/server/infrastruktur M&E.
   - **Auto-Promotion:** percakapan biasa otomatis naik saat L1 menugaskan tim L2 / menerbitkan / menautkan tiket HTS.
   - **Toggle Manual:** badge `💬 Percakapan Biasa` bisa diklik untuk berpindah kelas kapan saja (kecuali tiket sudah terhubung HTS).

---

## 3. Arsitektur Multi-HTS (1 Chat → Banyak Tiket HTS)

Model relasi **One-to-Many** `Ticket` → `TicketHts[]` (V4):
- **Banyak Nomor HTS per Percakapan:** 1 chat bisa menerbitkan nomor aduan ke divisi Network + Server sekaligus.
- **Penyelesaian Parsial:** tiap tiket HTS punya status mandiri (`PENDING`/`SOLVED`); menyelesaikan tiket Network tidak membatalkan tiket Server.
- **Multi-Kartu di Panel Kanan:** seluruh tiket HTS tampil sebagai kartu tersendiri (nomor, divisi, status) + tombol tambah/lepas tautan per kartu.
- **Sesuai SSOT:** baca dari tabel `TicketHts`, bukan kolom legacy `Ticket.hts_*`.
- **Keep-Alive Heartbeat:** refresh cookie `ci_session` tiap 15 menit (`htsKeepAliveService`) — sesi HTS anti-logout.

---

## 4. Penautan Manual & Pemulihan Tiket HTS (Disaster Recovery)

Ketika submit ke HTS gagal (koneksi/database putus pasca-submit):
- **Tab Drawer 2 Mode:**
  - `[ ➕ Terbitkan Tiket Baru ]` — pipeline standar 3 tahap.
  - `[ 🔗 Tautkan yang Sudah Ada ]` — input nomor aduan manual.
- **Verifikasi Live:** `lookupTicketByNumber()` mengecek ke server HTS sebelum menyimpan.
- **Proteksi Duplikat:**
  - Nomor sama dalam 1 percakapan → **DITOLAK** (400).
  - Nomor sudah terpakai di tiket lain → dialog konfirmasi **Force Link** (409).
- **Auto-Promotion & Auto-Assign:** penautan otomatis mengubah `is_aduan=true`; jika divisi tim dipilih, `TicketCategory` dibuat otomatis (tim langsung muncul di antrean L2).
- **Deteksi Status SOLVED:** status asli dari HTS (termasuk `SOLVED`) dibaca saat lookup — form penutupan HTS otomatis disembunyikan jika seluruh tiket HTS sudah `SOLVED`.
- **Pemulihan `INPUT_PIC`:** tombol **`[ ⚡ Lengkapi Penugasan PIC di HTS ]`** menaikkan tiket gantung ke `PENDING`.
- **Unlink (V4.1):** tombol hapus per kartu HTS → `DELETE /tickets/:id/hts/:htsId/unlink`, catatan internal sistem dicatat.
- **Integritas Dual-Close (V4.1):** status HTS dibaca dari SSOT `TicketHts`. Penutupan lokal hanya terjadi bila **seluruh** tiket HTS terkait benar-benar `SOLVED`; bila tidak, `400` dikembalikan beserta daftar kegagalan (mis. sesi expired, nomor tidak ditemukan). Kolom legacy yang salah di-set `SOLVED` otomatis diluruskan (*self-healing*), sehingga tiket yang terlanjur tersangkut di status `PENDING` dapat diselesaikan kembali tanpa reset data manual.

---

## 5. Pendelegasian Multi-Assign & WhatsApp Blast L2

- **3 Pilar Tim:** `Network`, `Server`, `Mechanical & Electrical (M&E)`.
- **Multi-Assign Cerdas:** centang banyak tim sekaligus; tim berjalan tidak pernah ke-reset (logika diff & merge).
- **WhatsApp Blast:** notifikasi rapi ke seluruh nomor personil + grup WA (`CategoryContact`) **hanya untuk tim yang baru ditambahkan** (anti-spam).
- **Per-Team Resolution:** `TicketCategory.is_resolved` per tim + solusi teknis. Tiket utama `RESOLVED` hanya saat **seluruh** tim selesai.
- **Self-Unassign Return:** L2 bisa melepas tugas dengan alasan tanpa mengganggu tim lain.

---

## 6. Catatan Internal Multimedia Dua Arah (L1 ↔ L2)

- **Dual-Tab L1:** tab `💬 Balas Pelanggan` (kirim ke WA) vs tab `🔒 Catatan Internal` (kuning, rahasia).
- **Foto Internal:** L1 ↔ L2 kirim gambar teknis — dijamin `is_internal=true`, **tidak pernah terkirim** ke WhatsApp pelanggan.
- **Bukti HTS:** foto internal L2 bisa dipilih langsung sebagai lampiran penyelesaian di portal HTS (tanpa re-upload).
- **Badge Identitas:** `🏷️ Catatan Internal - Tim [Network] ([Nama Teknisi])`.

---

## 7. Riwayat Lampau & Tarik Arsip WhatsApp

- **Accordion Timeline Divider:** riwayat tiket `CLOSED` pelanggan sama ditampilkan redup (*dimmed*) dengan pembatas waktu.
- **`[ 📥 Tarik Arsip WA ]`:** lazy-load 20 pesan historis langsung dari memori WhatsApp via Evolution API (query ganda `remoteJid` + `remoteJidAlt` sehingga kompatibel LID).

---

## 8. Efisiensi Dispatcher (Quick Replies, Audio, SLA)

- **Quick Replies (`/canned`):** ketik `/` di kotak chat → popup template (navigasi panah + Enter).
  - **Edit inline (V4.1):** tombol ✏️ per template di modal Quick Reply → form edit shortcut/judul/isi → `PUT /quick-replies/:id`.
- **Audio Chime:** nada sintesis native D5 → A5 (Web Audio API) + toggle mute.
- **Desktop Notification:** alert browser saat tab diminimize.
- **Metrik SLA SPV:** Total Aduan Teknis, Total Percakapan Biasa, Rata-rata FRT, Rata-rata MTTR (aduan murni) + ekspor CSV.

---

## 9. Master Data Kontak & Hierarki Nama Pelapor

**Fitur V4.1 — prioritas utama identitas pelapor:**

```
1. 🥇 Hasil Import Admin (is_imported_contact=true)  ← TIDAK TERTIMPA
2. 🥈 Edit Manual via Dashboard (is_custom_name=true)
3. 🥉 Kontak HP Evolution (pushName)
4. 🏅 WhatsApp Push Name  → disimpan ke wa_push_name (data pembanding)
5. 📱 Nomor telepon (fallback)
```

- **Import (khusus ADMIN):** `POST /api/admin/contacts/import`
  - Format: **Excel `.xlsx/.xls`**, **CSV**, **VCF/vCard**.
  - Parser CSV mendukung header **Google Contacts** (`First Name`+`Middle Name`+`Last Name`, `Given Name`+`Family Name`, `Phone 1 - Value`, `Organization Name`) dan header kustom (`nama`, `nomor_wa`, `instansi`).
  - Parser **VCF** manual (tanpa library): `FN`/`N` → nama, `TEL` → nomor (1 baris per TEL), `ORG` → instansi.
  - Normalisasi nomor `08xxx` → `628xxx`.
  - Status: `contacts.csv` **1300/1300 terbaca**, `contacts.vcf` **1335 dari 1342 kartu** (7 kartu tanpa TEL dilewati).
- **Hapus Semua Kontak (khusus ADMIN):** `DELETE /api/admin/contacts/clear-all` — transaksi aman, reset sequence `Customer_id_seq`, proteksi tiket aktif + opsi `force`.
- **Proteksi:** webhook tidak pernah menimpa nama pelanggan yang berflag import/custom; nama profil WA asli selalu dicatat ke `wa_push_name` sebagai **pembanding** (tampil di panel kanan jika berbeda).

---

## 10. Start New Chat (Outbound) & Direktori Kontak

- **Tombol `[ ➕ Chat Baru ]`** di atas antrean percakapan (khusus L1/ADMIN).
- **Direktori Kontak dengan Pagination (V4.1):**
  - Menggabungkan **Master Data DB (prioritas)** + **990+ kontak HP Evolution**.
  - Halaman pertama 30 entri; tombol **`↓ Muat lebih banyak (N tersisa)`** memuat halaman berikutnya (`limit`+`offset`, `hasMore`); footer **`✓ Semua kontak dimuat (N total)`** saat habis.
  - Pencarian live berdasarkan nama / nomor / OPD.
- **Pilih sekali klik:** nomor, nama, dan instansi terisi otomatis.
- **Toggle Pesan Pembuka:**
  - **ON (default):** kirim teks pembuka via Evolution, simpan sebagai `AGENT`, buka chat.
  - **OFF (Mode Tiket Kosong):** hanya membuat tiket + membuka ruang chat web — **tidak ada pesan terkirim** ke nomor WA; balasan dikirim manual nanti.
- **Klasifikasi Awal:** bisa langsung ditandai `🚨 Aduan Teknis`.

---

## 11. Re-Open Tiket (Aktifkan Kembali Percakapan Selesai)

Untuk kasus aduan `CLOSED` tapi ada pertanyaan lanjutan:
- **Tab `✓ Selesai`** di filter antrean (khusus L1/ADMIN).
- Tombol **`[ 🔄 Aktifkan Kembali Tiket ]`** di header chat saat tiket berstatus `CLOSED`.
- Dialog alasan (opsional) → `POST /tickets/:id/reopen`.
- Efek: `status=OPEN`, `closed_at=null`, catatan internal sistem + event `ticket_updated`.

---

## 12. Resolusi Identitas Pelapor Hybrid

Hierarki lengkap ada di [Bagian 9](#9). Perbedaan nama import vs profil WA ditampilkan di panel kanan (badge `Master Data` + blok italic *Nama Profil WhatsApp*).

---

## 13. Laporan SLA (MTTR/FRT) & Ekspor CSV

- **KPI SPV:** Total aduan teknis, total percakapan biasa, rata-rata FRT, rata-rata MTTR (aduan murni — percakapan biasa dikecualikan).
- **Tabel Rekapitulasi:** ID tiket, pelapor, SKPD, tim, jenis layanan, waktu, durasi, status, kesimpulan, nomor HTS (format multi-HTS).
- **Filter tanggal & kategori.** **Ekspor CSV.**

---

## 14. Manajemen Pengguna & Pengaturan Sistem (Admin)

- **CRUD Pengguna:** buat, edit, hapus staf (role `ADMIN`/`L1`/`L2`/`SPV`), set kategori tim L2, reset password (bcrypt).
- **Buku Kontak Blast Tim L2:** kelola nomor personil (`628xxx`) & ID grup (`xxx@g.us`) per divisi + inline edit.
- **Pembersihan Data Testing:** hapus rekap terpilih / hapus semua + **reset sequence ID ke 1**.
- **Import & Hapus Master Data Kontak** (Bagian 9).

---

## Status Pengujian Fitur
Lihat `QA_and_Quality.md` — **Modul 1–7 lolos**, sebagian Modul 8 teruji, fitur V4.1 (Modul 9) **belum diuji menyeluruh**.
