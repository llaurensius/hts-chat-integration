# 🧪 Pengujian QA, Potensi Bug & Audit Kualitas
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V4.2.1 Produksi (Full-Stack SPA Integration & Consolidated Architecture)  
**Metode Pengujian:** Pengujian Fungsional Web/HP + Verifikasi Integritas Database & Peladen + Frontend UI/UX QA  
**Terakhir Diperbarui:** 03 Oktober 2026  

---

## 1. Ringkasan Status Pengujian & Remediasi Sistem

| Kelompok Modul / Fase | Status Verifikasi | Keterangan Hasil Pengujian |
|---|:---:|---|
| **Modul 1–7 (Alur Operasional Inti)** | ✅ **LULUS 100%** | Seluruh alur chat inbound/outbound, auto-reply, triase L1, antrean L2, sinkronisasi portal HTS, dan laporan SPV terverifikasi penuh. |
| **Modul 8 (Fitur Lanjutan HTS & Quick Reply)** | ✅ **TERVERIFIKASI** | Penautan manual nomor HTS dan inline edit template balasan cepat telah teruji. |
| **Modul 9 (Fitur V4.1: Master Kontak, Chat Baru, Re-Open)** | ✅ **LULUS UAT 100%** | Seluruh 9 skenario alur pengguna akhir (UAT-01 s.d. UAT-09) terverifikasi lulus dalam pengujian nyata bersama pengguna. |
| **Modul 10 (Frontend UI/UX & Resiliency Testing)** | ✅ **LULUS 100%** | Responsivitas layout 3-kolom, navigasi keyboard slash `/`, chime audio, interceptor 401, error boundary, dan regresi Auto-Open HTS teruji. |
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
  - `docs/contacts.csv` (Format Google Contacts / CSV Kustom) $\rightarrow$ 1300 kontak terbaca bersih, 0 gagal.
  - `docs/contacts.vcf` (Format vCard) $\rightarrow$ 1335 kartu kontak terbaca (kartu tanpa nomor telepon dilewati).
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

## 4. Modul 10: Pengujian Fungsional Antarmuka Frontend & Ketahanan Kesalahan (Frontend UI/UX QA)

| ID Uji | Nama Skenario | Langkah Pengujian & Prosedur | Hasil Aktual & Verifikasi | Status |
|:---:|---|---|---|:---:|
| **TC-10.1** | Responsivitas Layout 3-Kolom & Collapse Panel | Menguji rendering pada layar 1366x768 dan 1920x1080. Klik tombol toggle collapse panel kanan. | Layout menyesuaikan diri secara elegan tanpa overflow horizontal; ruang thread chat melebar saat panel kanan diciutkan. | ✅ **PASS** |
| **TC-10.2** | Navigasi Keyboard Slash Commands `/` | Ketik `/` di input pesan chat. Tekan tombol `ArrowDown`, `ArrowUp`, `Enter`, `Tab`, dan `Escape`. | Sorotan item aktif bergerak naik-turun sesuai tombol panah; teks template tersisipkan saat Enter/Tab; popover tertutup saat Esc. | ✅ **PASS** |
| **TC-10.3** | Audio Chime & Desktop Push Background | Minimalkan jendela browser atau buka tab lain. Kirim pesan WhatsApp dari HP penguji. | Dua nada sintetis Web Audio API (D5 $\rightarrow$ A5) berbunyi tanpa lag; kartu notifikasi HTML5 muncul di OS; klik notifikasi langsung memfokuskan tab tiket terkait. | ✅ **PASS** |
| **TC-10.4** | Token Expiry & Axios 401 Interceptor | Hapus token di `localStorage` atau biarkan token kedaluwarsa, lalu picu request API. | Axios request interceptor menangkap galat 401 dan mengalihkan halaman secara otomatis ke `/login` tanpa menampilkan broken state. | ✅ **PASS** |
| **TC-10.5** | Ketahanan Crash via `ErrorBoundary` | Simulasikan error render komponen React yang tidak tertangkap (*uncaught exception*). | Aplikasi tidak menghasilkan layar putih (*blank screen*), melainkan menampilkan panel diagnostik merah bersahabat beserta stack trace. | ✅ **PASS** |
| **TC-10.6** | Regresi Auto-Open Drawer HTS Pasca Assign | Centang `[✓] Langsung buka formulir Portal HTS` pada modal assign L2 $\rightarrow$ Klik simpan $\rightarrow$ Isi formulir HTS $\rightarrow$ Klik "Terbitkan ke Portal HTS". | Emisi `ticket_updated` mencegah pengosongan `activeTicket`; drawer terbuka mulus dan tombol "Terbitkan" merespons 100% tanpa race condition. | ✅ **PASS** |
| **TC-10.7** | Media Lightbox Preview & Download | Klik gambar di thread obrolan atau catatan internal teknisi. | Modal lightbox layar penuh berlatar gelap terbuka; tombol unduh dan buka di tab baru berfungsi akurat. | ✅ **PASS** |
| **TC-10.8** | Pencarian Kontak & Infinite Paginasi | Buka modal Chat Baru, ketik 3 huruf pada pencarian, lalu klik tombol "Muat lebih banyak". | Pencarian menyaring data secara reaktif; penambahan offset 30 kontak berhasil dimuat tanpa duplikasi kartu. | ✅ **PASS** |

---

## 5. Audit Remediasi Kerentanan Sistem (Sprint 1–3 Hardening)

Seluruh temuan audit keamanan dan integritas teknis terdahulu telah diselesaikan 100%:

| Kode Temuan | Klasifikasi & Ancaman Awal | Tindakan Remediasi yang Terpasang | Status |
|---|---|---|:---:|
| **SEC-01** | Endpoint webhook WhatsApp tanpa otentikasi (rentan spoofing). | Middleware `webhookAuth` via token rahasia `WEBHOOK_SECRET` dengan validasi waktu-konstan (`crypto.timingSafeEqual`) + batas body 10MB + rate limiter 300 req/menit. | ✅ TUNTAS |
| **SEC-02** | Rute chat hanya cek token JWT tanpa pengecekan peran di server. | Penegakan wewenang di peladen via `requireRole(['ADMIN', 'L1', 'L2'])` + isolasi baris data query L2 hanya membaca timnya sendiri. | ✅ TUNTAS |
| **SEC-03** | Nilai rahasia JWT & Evolution API memiliki hardcoded fallback. | Modul fail-fast `config/env.js`; aplikasi otomatis berhenti jika variabel wajib belum disetel. | ✅ TUNTAS |
| **SEC-04** | Jalur berkas lampiran rentan *Path Traversal* (`../`). | Sanitasi ketat berbasis `path.resolve` pada modul `safePath.js` membatasi resolusi berkas hanya di dalam `/uploads`. | ✅ TUNTAS |
| **SEC-05** | Peladen WebSocket berjalan tanpa autentikasi handshake. | Middleware handshake `io.use` memverifikasi token JWT + partisi siaran ke ruang khusus (*rooms*). | ✅ TUNTAS |
| **DATA-01** | Pemrosesan pesan konkuren memicu tiket ganda saat pesan burst. | Antrean serial *in-memory* berbasis mutex `perNumberLock.js` per nomor telepon (`wa:${waNumber}`). | ✅ TUNTAS |
| **DATA-02** | Kolom `wa_message_id` tidak unik di tabel `Message`. | Migrasi skema menambahkan batasan `@unique` + blok penanganan Prisma `P2002` yang anggun. | ✅ TUNTAS |
| **DATA-03** | Eksekusi penutupan tiket rentan *double-close*. | *Atomic conditional update* (`where: { id, status: { not: 'CLOSED' } }`) mengembalikan HTTP 409 jika dipicu ganda. | ✅ TUNTAS |
| **DATA-04** | Ketiadaan indeks komposit memperlambat query antrean. | Menambahkan indeks gabungan `[status, is_aduan, created_at(sort: Desc)]` dan `[customer_id, status]` pada tabel `Ticket`. | ✅ TUNTAS |
| **RES-01** | Axios HTTP client Evolution API tidak memiliki batas timeout. | Menetapkan timeout 10 detik pada teks dan 15 detik pada media, serta loop blast L2 diubah paralel via `Promise.allSettled`. | ✅ TUNTAS |
| **RES-03** | Penamaan berkas Multer tanpa sufiks acak dan folder penuh. | Sufiks acak 6 digit (`img_${Date.now()}_${rand6}`) + background worker `fileCleanupService` retensi 90 hari. | ✅ TUNTAS |
| **LOGIC-01** | `lookupTicketByNumber` mengarang tiket tiruan jika tidak ditemukan. | Menghapus pembuatan tiket palsu dan mengembalikan error HTTP 404 eksplisit. | ✅ TUNTAS |
| **LOGIC-02** | Re-open tiket tidak mereset status penanganan tim L2. | Pada `reopenTicket`, sistem mereset `TicketCategory` secara atomik di dalam satu transaksi `prisma.$transaction`. | ✅ TUNTAS |

---

## 6. Checklist Verifikasi Rilis Produksi (Release Gate)

- [x] Seluruh skema database PostgreSQL telah termigrasi bersih dengan indeks komposit.
- [x] Validasi fail-fast lingkungan aktif (`DATABASE_URL`, `JWT_SECRET`, `EVOLUTION_API_TOKEN`, `WEBHOOK_SECRET`).
- [x] Endpoint webhook terlindungi dengan token rahasia `WEBHOOK_SECRET`.
- [x] Socket.io handshake auth aktif dan menolak koneksi anonim tanpa token JWT.
- [x] Background worker `htsKeepAliveService` (15 menit) dan `fileCleanupService` (24 jam) terinisialisasi.
- [x] Regresi alur Auto-Open HTS terverifikasi stabil tanpa balapan event soket.
- [x] Kompilasi statis Vite (`npm run build`) berjalan bersih tanpa galat dependensi Rollup.
- [ ] Ganti seluruh kata sandi akun benih (`password123`) dengan kata sandi kuat di lingkungan produksi.
- [ ] Lakukan eksekusi simulasi impor master data 1300 kontak OPD (`docs/contacts.csv`).
- [ ] Pastikan reverse proxy Nginx telah mengaktifkan SSL/HTTPS dan pembatasan firewall server (UFW).
