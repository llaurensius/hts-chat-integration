# 🧪 Pengujian QA, Potensi Bug & Audit Kualitas
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V4.1 Produksi  
**Metode Pengujian:** Kolaborasi (Tester di Browser/HP + Verifikasi database/backend)  
**Terakhir Diperbarui:** 02 Oktober 2026  

---

## 1. Ringkasan Status Pengujian (JUJUR / APA ADANYA)

| Kelompok | Status | Keterangan |
|---|:---:|---|
| **Modul 1–7 (QA Bersama Sesi 01 Okt)** | ✅ **LULUS 100%** | Terverifikasi bersama, semua parameter database terpenuhi |
| **Modul 8 (Fitur Lanjutan: Manual Link, Multi-Foto, Edit Quick Reply)** | 🟡 **SEBAGIAN** | Manual Link & Edit Quick Reply teruji; **Multi-Foto HTS belum diuji end-to-end** |
| **Modul 9 (Fitur V4.1: Master Data Import, Start New Chat, Re-Open, Unlink, Direktori Kontak, Hapus Kontak, Clear Contacts)** | 🔴 **BELUM DIUJI** | Kode terpasang & lolos kompilasi, **belum ada uji manual end-to-end** |

> Dokumen ini adalah acuan uji. Status di atas ditulis sesuai fakta — jangan diasumsikan semua fitur sudah lolos.

---

## 2. Skenario Pengujian Modul 1–7 (STATUS: ✅ LULUS 100%)

### Modul 1 — Inbound WhatsApp & Resolusi Identitas
- Kirim WA dari nomor penguji → auto-create `Customer` + tiket `OPEN` / `GENERAL_CHAT`.
- **Verifikasi DB:** kolom `wa_number`, `is_custom_name=false`, nama teresolusi dari kontak HP/pushName.
- Catatan: sakelar bot awalnya `is_active=false` → bot tidak membalas (perilaku benar).

### Modul 2 — Percakapan Biasa & Dual-Direction Chat
- Balasan via web dashboard = `AGENT` (punya `wa_message_id`).
- Balasan via **HP fisik helpdesk** = `AGENT` juga (fitur fix `fromMe`).
- `[ ✅ Selesaikan Percakapan ]` → `CLOSED` + summary + `closed_at`, **dieksklusi dari MTTR** (terverifikasi `durationMins: null` di laporan).

### Modul 3 — Promosi Aduan & Multi-Assign
- Auto-promosi: `is_aduan=true`, `service_type='TROUBLESHOOTING'`.
- Multi-assign 2 tim: 2 baris `TicketCategory` (`is_resolved=false`).
- Pesan audit sistem tercatat.

### Modul 4 — Antarmuka & Siklus Hidup L2
- Foto catatan internal tersimpan `is_internal=true` (**tidak bocor ke WA pelanggan**).
- Tiket tetap `OPEN` setelah 1 tim selesai; otomatis `RESOLVED` saat **seluruh** tim selesai.

### Modul 5 — Integrasi Portal HTS (RIIL)
- Terbitkan nomor resmi **`#2041-TShoot-2026-jateng-10`**, status `PENDING`, PIC tercatat, relasi `TicketHts` terisi.

### Modul 6 — Penutupan Resmi & Laporan SPV
- Dual-close sukses: lokal `CLOSED`, portal HTS `SOLVED`.
- Laporan SPV akurat: durasi **30 Menit**, SKPD, kategori tim terekam, CSV terunduh.

### Modul 7 — Fitur Produktivitas
- Quick Reply `/` + popup; nada chime D5→A5 + desktop notification terverifikasi.

---

## 3. Skenario Pengujian Modul 8 (STATUS: 🟡 SEBAGIAN)

| Skenario | Status |
|---|:---:|
| 8.1 Tab **"Tautkan yang Sudah Ada"** — verifikasi manual link nomor HTS | ✅ Teruji (berhasil ditautkan) |
| 8.2 **Multi-Foto Upload** (2–3 file) ke portal HTS (form terbitkan & modal tutup) | ⚠️ Belum diuji end-to-end |
| 8.3 **Edit Template Balasan Cepat** (inline edit → `PUT /quick-replies/:id`) | ✅ Teruji (data teresimpan) |

---

## 4. Skenario Pengujian Modul 9 — Fitur V4.1 (STATUS: 🔴 BELUM DIUJI)

Semua di bawah **wajib diuji sebelum produksi**:

### 9.1 Import Master Data Kontak
- Login **ADMIN** → modal Chat Baru → *Import Master Data Kontak*.
- Unggah `docs/contacts.csv` → harapkan **1300 nama+nomor terbaca, 0 gagal**.
- Unggah `docs/contacts.vcf` → harapkan **1335 dari 1342 kartu** (7 kartu tanpa TEL dilewati = wajar).
- **Verifikasi:** kolom `is_imported_contact=true`; badge `Official`/`Master Data` muncul; nama **tidak tertimpa** pushName WA saat ada pesan masuk.

### 9.2 Hierarki Nama & Data Pembanding
- Pelapor hasil import dikirim pesan WA masuk → nama resmi tetap utuh.
- Panel kanan menampilkan **`Nama Profil WhatsApp`** sebagai pembanding jika berbeda.

### 9.3 Start New Chat (Outbound)
- Klik `[ ➕ Chat Baru ]` → pilih kontak dari direkontori.
- **Toggle ON:** pesan pembuka terkirim, bubble `AGENT` muncul, chat terbuka.
- **Toggle OFF (Mode Tiket Kosong):** tiket terbuka **tanpa** pesan terkirim ke nomor WA.

### 9.4 Direktori Kontak — Pagination
- Halaman pertama tampil **30** entri; klik **`↓ Muat lebih banyak (N tersisa)`** → halaman berikutnya.
- Saat habis: **`✓ Semua kontak dimuat (1300 total)`**.
- Pencarian live (nama/nomor/OPD) tetap responsif.

### 9.5 Re-Open Tiket
- Buka tiket `CLOSED` di tab `✓ Selesai` → `[ 🔄 Aktifkan Kembali Tiket ]` → alasan opsional.
- **Verifikasi:** `status='OPEN'`, `closed_at=null`, catatan internal sistem tercatat, chat bisa dibalas lagi.

### 9.6 Unlink Tiket HTS
- Klik ikon hapus pada kartu HTS di panel kanan → dialog konfirmasi.
- **Verifikasi:** baris `TicketHts` terhapus; field legacy `Ticket.hts_*` direset (atau dialihkan ke tiket HTS lain bila masih ada); catatan internal sistem tercatat.

### 9.7 Anti-Duplikat Link + Auto-Assign Saat Link
- Tautkan nomor HTS yang **sudah tertaut di percakapan sama** → harus **DITOLAK** (pesan "sudah tertaut").
- Saat menautkan dengan divisi tim dipilih → `TicketCategory` dibuat otomatis, tiket masuk antrean L2, event `ticket_assigned` ter-broadcast.

### 9.8 Hapus Semua Kontak (Admin)
- Modal import → `[ 🗑 Hapus Semua Kontak ]` → ketik `HAPUS KONTAK`.
- **Verifikasi:** `Customer` kosong, sequence `Customer_id_seq` reset ke 1; tiket/pesan TIDAK ikut hilang (kecuali mode force).

### 9.9 Multi-Foto ke Portal HTS (dari Modul 8 yang tertunda)
- Pilih 2–3 foto di form sinkron / modal tutup → submit → tidak ada `MulterError: Unexpected field`, seluruh `pic[]` diterima HTS.

---

## 5. Potensi Bug, Limitasi & Kasus Tepi (Mitigasi Aktif)

### ✅ Sudah Dimitigasi (terpasang di kode)
| # | Risiko | Mitigasi |
|:--:|---|---|
| 1 | Sesi HTS kedaluwarsa | Ping berkala + tiket lokal tidak tertutup saat submit HTS gagal |
| 2 | Detil aduan > 250 karakter | `substring(0,250)` di `htsClientService`; chat lokal utuh |
| 3 | Lampiran ditolak HTS | Filter MIME `jpg/jpeg/png/pdf`, tiket lokal tidak tertutup saat gagal |
| 4 | Race condition 2 L1 submit HTS bersamaan | Cek `hts_ticket_id` di DB + event `ticket_closed` nonaktifkan tombol |
| 5 | Downtime portal HTS | Timeout 15–20 detik, operasi penutupan lokal dibatalkan |
| 6 | Lonjakan aduan `unsubmitted` di HTS | Fallback parsing nomor prefix trouble |
| 7 | Nomor WA non-standar / grup | Sanitasi regex + filter `@g.us` |
| 8 | **WhatsApp LID Addressing (`@lid`)** | Resolve `remoteJidAlt` → nomor asli (webhook) + query ganda `findMessages` (arsip) |
| 9 | **Balasan dari HP helpdesk (`fromMe`)** | Filter dibuka, disimpan `AGENT`, dedupe `wa_message_id` + time-window 60 detik |
| 10 | Merge PIC penerima & penanganan | JSON `hts_pic_ids` + badge PIC, format koma `"14,8"` |
| 11 | **Race condition webhook buat customer/ticket** | `customer.upsert` atomik + fallback `ticket.create` |
| 12 | **Orphan record saat hapus tiket** | `onDelete: Cascade` pada `TicketCategory` & `Message` |
| 13 | **Performa chat besar** | Index `Message(ticket_id)`, `(ticket_id, created_at)`, `(wa_message_id)` |
| 14 | **Memory leak Socket.io frontend** | Cleanup listener absolut di `useEffect` return |
| 15 | **Dual-close HTS false-success & gate legacy terkunci** | `htsCloseSuccess` hanya saat seluruh target selesai; kegagalan → `400` berisi daftar `#HTS` + alasan, penutupan lokal dibatalkan; gate & self-healing baca SSOT `TicketHts`; `solveTicketHts` melempar error bila lookup ID gagal (fallback tebakan dihapus); `attachmentUrls` kini dideklarasikan |

### 🔴 Belum Diperbaiki (Diketahui)
| # | Risiko | Dampak | Rekomendasi |
|:--:|---|---|---|
| 1 | **CSRF token HTS invalid saat submit bersamaan** | `403 Forbidden` bila 2 petugas submit di detik sama | Mutex lock per userId (`async-mutex`) di `htsClientService` |
| 2 | **Disk `/uploads/` tanpa retensi** | Kapasitas penuh dalam 3–6 bulan | Cron pembersihan berkas tiket `CLOSED` > 90 hari |
| 3 | **Retensi berkas download** | Tidak ada auto-backup terjadwal | Diskusi kebijakan backup terjadwal |

---

## 6. Log Progres Harian (Rekap Sesi)

| Tanggal | Pekerjaan | Status |
|---|---|:---:|
| 01 Okt 2026 | Fix bug Babel `App.jsx` (replaceAll) | ✅ |
| 01 Okt 2026 | Fix balasan HP helpdesk (`fromMe` sync) + kolom `wa_message_id` | ✅ |
| 01 Okt 2026 | Fix Tarik Arsip WA (query LID ganda) | ✅ |
| 01 Okt 2026 | Fix modal penutupan (validasi `sender_id` + error detail frontend) | ✅ |
| 01 Okt 2026 | Konsolidasi dokumentasi `/docs` (14 → 6 file tematik V4.1) | ✅ |
| 02 Okt 2026 | Fix dual-close HTS: `attachmentUrls` tak dideklarasikan (ReferenceError tiap submit), `htsCloseSuccess` tanpa syarat, gate legacy terkunci, fallback diam-diam ID trouble | ✅ |
| 02 Okt 2026 | Fitur V4.1: Master Data Kontak, Start New Chat, Direktori Kontak, Re-Open, Unlink, auto-assign saat link | ✅ Kode selesai |
| 02 Okt 2026 | Audit arsitektur (7 temuan P0/P1/P2) + perbaikan | ✅ 6/7 fixed, 1 (CSRF mutex) tertunda |
| 02 Okt 2026 | Uji QA Modul 9 | ⬜ **Belum dikerjakan** |

---

## 7. Audit Arsitektur (Rencana Perbaikan — Detail di commit & kode)

| Temuan | Prioritas | Status |
|---|:---:|:---:|
| Race condition webhook customer/ticket | P0 | ✅ Fixed |
| Missing index `Message.ticket_id` | P0 | ✅ Fixed |
| Missing `onDelete: Cascade` | P1 | ✅ Fixed |
| Memory leak Socket.io listener | P1 | ✅ Fixed |
| Collision nama file upload | P2 | ✅ Fixed |
| Dualisme SSOT `Ticket` vs `TicketHts` (baca array `hts_tickets`) | P2 | ✅ Fixed |
| CSRF concurrent HTS submit | P2 | 🔴 Belum |

---

## 8. Checklist Persiapan Rilis (Release Gate)

- [ ] Uji Modul 9.1–9.9 (poin 4 di atas) — **wajib**
- [ ] Uji Modul 8.2 Multi-Foto ke HTS riil — **wajib**
- [ ] Nonaktifkan/konfirmasi ulang seed `password123` di produksi
- [ ] Backup `pgdata` sebelum rilis
- [ ] Verifikasi sakelar bot & kontak blast L2 sesuai data asli
- [ ] Pantau `/uploads/` — siapkan cron retensi
- [ ] (Opsional) Implementasi mutex CSRF HTS
