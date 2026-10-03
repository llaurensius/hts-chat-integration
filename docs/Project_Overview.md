# 📋 Gambaran Umum Proyek (Project Overview)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Instansi:** Diskominfo Provinsi Jawa Tengah  
**Versi Sistem:** Workflow V4.2.2 Produksi (Full-Stack SPA Integration & Consolidated Architecture)  
**Audiens Dokumen:** Developer, System Architect & Operator Helpdesk  
**Terakhir Diperbarui:** 03 Oktober 2026  

---

## 1. Ringkasan Eksekutif

Sistem Helpdesk **HTS Chat Integration** adalah platform terintegrasi penuh (*full-stack web application*) yang menjembatani saluran komunikasi **WhatsApp** publik/OPD dengan dasbor operasional helpdesk internal dan portal tiket resmi **Helpdesk Ticketing System (HTS) Diskominfo Provinsi Jawa Tengah** (`https://hts.diskomdigi.jatengprov.go.id`).

Arsitektur aplikasi terbagi menjadi empat pilar inti:
1. **WhatsApp Gateway:** Evolution API v2 (Dockerized Baileys) untuk komunikasi pesan dua arah, penanganan berkas multimedia, dan sinkronisasi balasan langsung dari ponsel fisik helpdesk (`fromMe=true`).
2. **Backend Core:** Node.js Express v5 + Socket.io v4.8 dengan perlindungan *fail-fast*, serialisasi antrean *in-memory* anti-race condition (`perNumberLock`), middleware otentikasi JWT, dan penegakan izin berbasis peran di tingkat peladen (*server-side RBAC*).
3. **Database & ORM:** PostgreSQL 15 via Prisma ORM v5.22 dengan arsitektur multi-tiket (One-to-Many `Ticket` $\rightarrow$ `TicketHts[]`), indeks komposit berkinerja tinggi, dan integritas transaksi atomik.
4. **Frontend SPA:** React 18 + Vite 5 modern dengan workspace terpadu 5-tab, tata letak 3-kolom responsif, penanganan ketahanan kesalahan (*crash resilience*) via `ErrorBoundary`, pemanggil balasan cepat (*slash command* `/`), sintesis nada dering audio via Web Audio API, serta notifikasi push browser desktop (HTML5 Notification API).

---

## 2. Tujuan Bisnis & Sasaran Mutu Layanan

1. **Memangkas First Response Time (FRT):** Respon sambutan otomatis bot (*auto-reply*) dan notifikasi visual/audio seketika via WebSocket saat pesan baru tiba.
2. **Kolaborasi Teknis Lintas Bidang Tanpa Hambatan:** Satu percakapan WhatsApp dapat didelegasikan ke banyak tim teknisi L2 sekaligus (`Network`, `Server`, `Mechanical & Electrical`) serta menerbitkan banyak nomor aduan resmi ke portal HTS (*One-to-Many Multi-HTS*).
3. **Privasi & Kerahasiaan Komunikasi Lapangan:** Teknisi L2 berkoordinasi via ruang Catatan Internal (teks dan gambar bukti) yang 100% terisolasi dan tidak pernah bocor ke WhatsApp pelanggan.
4. **Akurasi Metrik SLA (Mean Time to Resolve - MTTR):** Pemisahan tegas antara *Percakapan Biasa* (`GENERAL_CHAT`) yang bebas beban SLA dengan *Aduan Teknis Resmi* (`is_aduan=true`), sehingga metrik durasi penanganan gangguan mencerminkan realitas lapangan tanpa distorsi.
5. **Integritas Master Data Kontak OPD:** Impor buku telepon resmi Pemprov Jawa Tengah (Excel `.xlsx`, `.csv` Google Contacts, dan vCard `.vcf`) sebagai nama resmi prioritas utama yang tidak tertimpa identitas profil WhatsApp.
6. **Keamanan, Skalabilitas & Durabilitas:** Proteksi injeksi webhook via *shared secret token*, sanitasi kanonikal berkas lampiran anti-*path traversal*, deduplikasi pesan atomik, pembersihan otomatis berkas lampiran kedaluwarsa (retensi 90 hari), dan sesi portal HTS yang terjaga terus-menerus via *background keep-alive heartbeat* (15 menit).

---

## 3. Profil Pengguna (User Personas) & Kebutuhan Antarmuka

| Peran | Profil Pengguna | Kanal Interaksi | Modul Utama yang Digunakan |
|---|---|---|---|
| **Pelapor (PIC WhatsApp / OPD)** | ASN, staf dinas, atau masyarakat yang melaporkan kendala teknis SPBE atau permohonan layanan | Aplikasi WhatsApp Resmi | Saluran chat WhatsApp helpdesk |
| **Dispatcher L1** | Petugas garda depan helpdesk yang melakukan triase aduan, verifikasi identitas, membalas obrolan, mengelola bot, multi-assign teknisi L2, dan menerbitkan tiket resmi HTS | Dasbor Web (React SPA) | Tab *Chat* (Panel 3-Kolom, Drawer Multi-HTS, Drawer Manual Link, Auto-Open HTS) & Tab *Bot Settings* |
| **Teknisi L2** | Tim spesialis lapangan terbagi dalam 3 pilar: `Network`, `Server`, dan `Mechanical & Electrical (M&E)` | Dasbor Web + Notifikasi WhatsApp | Tab *Chat* (Antarmuka View-only pelanggan, Ruang Catatan Internal teks/gambar, tombol *Tandai Selesai*, dan *Return Task*) |
| **Administrator** | Penanggung jawab teknis sistem & master data | Dasbor Web (React SPA) | Tab *Chat*, Tab *Report*, Tab *Users Management*, Tab *Teams Contact Blast*, dan Modal Impor/Pembersihan Kontak |
| **Supervisor (SPV)** | Pejabat pengawas operasional yang memantau beban antrean, efektivitas penanganan, dan kepatuhan SLA | Dasbor Web (React SPA) | Tab *Chat* (Monitoring antrean real-time) & Tab *Report* (Dashboard metrik SLA MTTR/FRT + Ekspor CSV) |

---

## 4. Peran, Hak Akses & Matriks Antarmuka (RBAC)

### Akun Bawaan Seeding (Seluruh Akun Menggunakan Password: `password123`)

| Peran | Alamat Email | Kategori / Tim | Hak Akses & Tanggung Jawab Utama |
|---|---|:---:|---|
| **ADMIN** | `admin@helpdesk.go.id` | - | Hak akses penuh mencakup manajemen pengguna, kontak blast L2, master kontak, dan hapus rekapitulasi. |
| **L1** | `l1@helpdesk.go.id` | - | Komunikasi pelapor, toggle auto-reply bot, multi-assign L2, integrasi HTS, dan penutupan tiket resmi. |
| **SPV** | `spv@helpdesk.go.id` | - | Pemantauan antrean aduan, evaluasi durasi penanganan tiket (SLA), dan pengunduhan rekap CSV. |
| **L2 Network** | `l2_network@helpdesk.go.id` | Network | Akses tim Network, koordinasi catatan internal, unggah gambar bukti lapangan, dan resolusi tim. |
| **L2 Server** | `l2_server@helpdesk.go.id` | Server | Akses tim Server, koordinasi catatan internal, unggah gambar bukti lapangan, dan resolusi tim. |
| **L2 M&E** | `l2_me@helpdesk.go.id` | Mechanical & Electrical | Akses tim M&E, koordinasi catatan internal, unggah gambar bukti lapangan, dan resolusi tim. |

---

### Matriks Penegakan Hak Akses & Visibilitas UI (Server-Side Enforced)

| Fitur Operasional & Navigasi Antarmuka | ADMIN | L1 | L2 | SPV |
|---|:---:|:---:|:---:|:---:|
| **Visibilitas Tab Navigasi Utama:** | | | | |
| - Tab *Chat* (Percakapan & Tiket) | ✅ | ✅ | ✅ | ✅ |
| - Tab *Report* (Rekapitulasi SLA & Ekspor CSV) | ✅ | ✅ | ❌ | ✅ |
| - Tab *Users* (Manajemen Akun Pengguna) | ✅ | ❌ | ❌ | ❌ |
| - Tab *Teams* (Manajemen Kontak Blast L2) | ✅ | ❌ | ❌ | ❌ |
| - Tab *Bot* (Pengaturan Auto-Reply Sambutan) | ❌ | ✅ | ❌ | ❌ |
| **Operasional Percakapan & Tiket:** | | | | |
| - Kirim balasan pesan WhatsApp ke pelapor | ✅ | ✅ | ❌ (View-only) | ❌ (View-only) |
| - Kirim lampiran berkas/gambar ke WhatsApp | ✅ | ✅ | ❌ | ❌ |
| - Gunakan Slash Commands (`/`) Quick Replies | ✅ | ✅ | ❌ | ❌ |
| - Tulis Catatan Internal (Teks & Lampiran Bukti Foto) | ✅ | ✅ | ✅ | ❌ |
| - Pendelegasian Tim L2 (*Smart Multi-Assign*) | ✅ | ✅ | ❌ | ❌ |
| - Centang *Auto-Open HTS* saat menyimpan penugasan | ✅ | ✅ | ❌ | ❌ |
| - Tandai selesai penanganan tim teknisi (`is_resolved`) | ✅ | ❌ | ✅ (Tim sendiri) | ❌ |
| - Lepas / kembalikan tugas penanganan (*Return Task*) | ✅ | ❌ | ✅ (Tim sendiri) | ❌ |
| - Selesaikan Percakapan Biasa (`[ ✅ Selesaikan Percakapan ]`) | ✅ | ✅ | ❌ | ❌ |
| - Terbitkan tiket baru ke Portal HTS Diskomdigi | ✅ | ✅ | ❌ | ❌ |
| - Tautkan nomor tiket HTS yang sudah ada (*Manual Link*) | ✅ | ✅ | ❌ | ❌ |
| - Lepas tautan tiket HTS (*Unlink HTS*) | ✅ | ✅ | ❌ | ❌ |
| - Selesaikan tiket di Portal HTS & Dual-Close Lokal | ✅ | ✅ | ❌ | ❌ |
| - *Start New Chat* (Pesan Keluar Baru ke Nomor/Kontak) | ✅ | ✅ | ❌ | ❌ |
| - *Re-Open* Tiket yang Sudah Ditutup (`CLOSED`) | ✅ | ✅ | ❌ | ❌ |
| - Lihat antrean tiket lintas tim / semua kategori | ✅ | ✅ | ❌ (Hanya timnya) | ✅ |
| - Impor / Hapus Bersih Master Data Kontak Pelanggan | ✅ | ❌ | ❌ | ❌ |
| - Hapus baris data rekapitulasi aduan / reset sequence | ✅ | ❌ | ❌ | ❌ |

---

## 5. Riwayat Evolusi Sistem

| Versi | Fokus Pengembangan | Rincian Utama | Status |
|---|---|---|:---:|
| **V1.0** | Fondasi Webhook & Chat Dasar | Webhook inbound WhatsApp, outbound chat, Socket.io dasar, tagging, rekapitulasi, rate-limit. | ✅ Selesai |
| **V2.0** | Otentikasi & Media | Otentikasi JWT + RBAC, media gambar dua arah, UI adaptif L1 vs L2, admin CRUD pengguna, siklus status `RESOLVED`. | ✅ Selesai |
| **V2.1/V2.2** | 3 Pilar Tim L2 & Smart Assign | Pembagian pilar Network, Server, M&E, smart multi-assign diffing, resolusi mandiri per-tim, self-unassign, kontak blast L2. | ✅ Selesai |
| **V3.0** | Integrasi Portal Resmi HTS | Integrasi portal resmi HTS Diskomdigi (sesi cookie `ci_session`, bypass CAPTCHA, pipeline 3 tahap, PIC sync, dual-close). | ✅ Selesai |
| **V4.0** | Multi-HTS & Redesign UI | Arsitektur Multi-HTS (One-to-Many), klasifikasi Percakapan Biasa vs Aduan Teknis, multimedia L2, antarmuka 3-kolom, quick replies, manual link disaster recovery. | ✅ Selesai |
| **V4.1** | Master Data & Outbound Flow | Impor Master Data Kontak (Excel/CSV/VCF), Start New Chat outbound + paginasi direktori, Re-Open tiket, sinkronisasi balasan HP helpdesk (`fromMe`), WhatsApp LID addressing. | ✅ Selesai |
| **V4.2** | Hardening Keamanan & Durabilitas | Webhook Shared Secret Auth, Server-side RBAC, Socket.io Handshake Auth & Room Partitions, Fail-fast config env, Path Traversal Protection, Anti-Race Lock (`perNumberLock`), Deduplikasi atomik `@unique wa_message_id`, Background File Retention Worker (90 hari), dan Indeks Komposit Database. | ✅ Selesai |
| **V4.2.1** | Full-Stack SPA Integration & UX Resilience | Integrasi menyeluruh Frontend SPA (5-tab workspace), mitigasi race condition drawer AutoOpen HTS pasca-assign, audio chime Web Audio API + HTML5 desktop notifications. | ✅ Selesai |
| **V4.2.2** | Full-Stack Production & Living Docs Refresh | Peremajaan dokumentasi hidup (Living Documentation), sanitasi 100% path portabel, sinkronisasi kontrak API terbaru, dan audit kesiapan operasional server. | ✅ Selesai |

---

## 6. Indeks Dokumentasi Teknis Hidup (Living Documentation)

Dokumentasi sistem ini dirawat secara aktif di direktori [`docs/`](./) dan terdiri atas 7 dokumen standar:

| Berkas Dokumen | Lingkup Pembahasan Utama |
|---|---|
| [`Project_Overview.md`](./Project_Overview.md) | Dokumen ini — Ringkasan eksekutif, persona pengguna, matriks RBAC antarmuka & peladen, akun seed, dan roadmap evolusi sistem. |
| [`Architecture.md`](./Architecture.md) | Arsitektur Full-Stack (Frontend React SPA, Backend Node.js, Docker, Nginx Reverse Proxy), diagram alur Mermaid, dan mekanisme proteksi keamanan. |
| [`Features_and_Capabilities.md`](./Features_and_Capabilities.md) | Katalog fungsional lengkap seluruh fitur aktif (Workspace 5-Tab, Tata Letak 3-Kolom, Multi-HTS, Slash Commands, Audio/Desktop Alerts, Master Kontak). |
| [`Database_and_API.md`](./Database_and_API.md) | Diagram relasi ERD, kamus data tabel & indeks komposit PostgreSQL, spesifikasi REST API backend, dan kontrak payload event WebSocket Socket.io. |
| [`Operations_and_Deployment.md`](./Operations_and_Deployment.md) | Panduan instalasi 3 track (Lokal, Docker Stack, VPS Ubuntu 22.04 LTS via PM2 & Nginx), optimasi caching aset Vite, dan SOP operasional per peran. |
| [`QA_and_Quality.md`](./QA_and_Quality.md) | Skenario pengujian QA Modul 1–10 (mencakup verifikasi fungsional backend, integritas transaksi database, dan pengujian UI/UX frontend). |
| [`summary.md`](./summary.md) | Rekapitulasi eksekutif pekerjaan teknis, audit keamanan, laporan mitigasi insiden AutoOpen HTS, dan status kesiapan operasional sistem. |
