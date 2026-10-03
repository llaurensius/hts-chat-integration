# 📋 Gambaran Umum Proyek (Project Overview)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Instansi:** Diskominfo Provinsi Jawa Tengah  
**Versi Sistem:** Workflow V4.2 Produksi (Multi-HTS, General Chat, Multimedia L2, Quick Replies, Manual Link, Master Data Kontak, Start New Chat, Re-Open Tiket, Hardening Keamanan & Durabilitas)  
**Audiens Dokumen:** Developer (utama) & Operator Helpdesk (sekunder)  
**Terakhir Diperbarui:** 03 Oktober 2026  

---

## 1. Ringkasan Eksekutif

Sistem Helpdesk **HTS Chat Integration** menjembatani saluran komunikasi **WhatsApp** dengan dasbor web helpdesk internal dan portal tiket resmi **Helpdesk Ticketing System (HTS) Diskominfo Provinsi Jawa Tengah** (`https://hts.diskomdigi.jatengprov.go.id`).

Arsitektur inti: **Evolution API v2 (Baileys WhatsApp)** $\rightarrow$ **Node.js Express + Socket.io** $\rightarrow$ **PostgreSQL 15 (Prisma ORM)** $\rightarrow$ **React.js + Vite**.

Tata kelola sistem ditegakkan secara ketat berbasis **Role-Based Access Control (RBAC)** di lapisan peladen (*server-side enforcement*) dengan 4 peran utama:
- **ADMIN** — akses penuh, manajemen pengguna, master data kontak, reset rekapitulasi, pengelolaan kontak blast tim
- **L1 (Dispatcher)** — garda depan penanganan, komunikasi WhatsApp pelapor, delegasi teknisi L2, integrasi penerbitan tiket portal HTS, dan penutupan tiket resmi
- **L2 (Teknisi)** — spesialis penanganan lapangan 3 pilar: `Network`, `Server`, `Mechanical & Electrical (M&E)`
- **SPV (Supervisor)** — pemantauan antrean real-time, evaluasi performa SLA (FRT/MTTR), dan ekspor laporan CSV

---

## 2. Tujuan Bisnis

1. **Memangkas waktu respons aduan (FRT)** — respons otomatis bot sambutan (*auto-reply*) dan notifikasi real-time WebSocket.
2. **Kolaborasi teknis lintas bidang** — satu percakapan WhatsApp dapat didelegasikan ke banyak tim teknisi sekaligus dan menerbitkan banyak tiket resmi ke portal HTS (One-to-Many Multi-HTS).
3. **Privasi komunikasi teknis** — teknisi L2 berkoordinasi via Catatan Internal (teks dan gambar bukti) yang 100% terisolasi dan tidak bocor ke WhatsApp pelanggan.
4. **Pelaporan SLA akurat & terukur** — kalkulasi durasi murni penanganan kendala teknis (MTTR) yang secara otomatis mengecualikan percakapan biasa (*general chat*).
5. **Integritas master data kontak** — impor data resmi OPD/SKPD (Excel, CSV, Google Contacts, vCard VCF) sebagai identitas pelapor prioritas utama yang tidak tertimpa nama profil WhatsApp.
6. **Keamanan & keandalan transaksi** — proteksi race condition pesan burst, pembatasan akses data berbasis peran di peladen, soket terotentikasi handshake JWT, dan retensi berkas kedaluwarsa otomatis.

---

## 3. Profil Pengguna (User Personas)

| Peran | Tugas Utama | Kanal Interaksi |
|---|---|---|
| **Pelapor (PIC WhatsApp / OPD)** | Mengirim laporan gangguan teknis atau permohonan layanan SPBE | WhatsApp Pelanggan |
| **Dispatcher L1** | Triase aduan, verifikasi identitas, balas pelapor, multi-assign L2, terbitkan/tutup tiket HTS | Dasbor Web Helpdesk |
| **Teknisi L2** | Terima notifikasi blast WA, koordinasi catatan internal teknis, unggah bukti, tandai selesai per-tim | Dasbor Web + Notifikasi WhatsApp |
| **Administrator** | Manajemen pengguna, impor/hapus master data kontak, kontak blast L2, pembersihan data testing | Dasbor Web Helpdesk |
| **Supervisor** | Pantau antrean & SLA real-time, evaluasi durasi penanganan, ekspor rekapitulasi CSV | Dasbor Web Helpdesk |

---

## 4. Peran & Hak Akses (RBAC)

### Akun Bawaan Seeding (Semua Password: `password123`)
| Role | Email | Kategori Tim | Hak Akses Utama |
|---|---|:---:|---|
| **ADMIN** | `admin@helpdesk.go.id` | - | Akses penuh seluruh modul, CRUD pengguna, master kontak, hapus rekap |
| **L1** | `l1@helpdesk.go.id` | - | Chat WA, toggle bot, multi-assign L2, integrasi HTS, tutup tiket resmi |
| **SPV** | `spv@helpdesk.go.id` | - | Monitoring antrean, laporan performa SLA, ekspor CSV |
| **L2 Network** | `l2_network@helpdesk.go.id` | Network | View-only chat, catatan internal tim, tandai selesai, return tugas |
| **L2 Server** | `l2_server@helpdesk.go.id` | Server | View-only chat, catatan internal tim, tandai selesai, return tugas |
| **L2 M&E** | `l2_me@helpdesk.go.id` | Mechanical & Electrical | View-only chat, catatan internal tim, tandai selesai, return tugas |

### Matriks Penegakan Hak Akses (Server-Side Enforced)
| Fitur Operasional | ADMIN | L1 | L2 | SPV |
|---|:---:|:---:|:---:|:---:|
| Kirim balasan WhatsApp ke pelapor | ✅ | ✅ | ❌ | ❌ |
| Kirim lampiran gambar ke WhatsApp | ✅ | ✅ | ❌ | ❌ |
| Multi-assign penugasan tim L2 | ✅ | ✅ | ❌ | ❌ |
| Kustomisasi & toggle Auto-Reply Bot | ❌ | ✅ | ❌ | ❌ |
| Tulis catatan internal (teks & gambar) | ✅ | ✅ | ✅ | ❌ |
| Tandai selesai penanganan tim (`is_resolved`) | ✅ | ❌ | ✅ | ❌ |
| Lepas / kembalikan penugasan (*return*) | ✅ | ❌ | ✅ | ❌ |
| Tutup tiket resmi (`Mandatory Summary`) | ✅ | ✅ | ❌ | ❌ |
| Sinkronisasi & terbitkan tiket portal HTS | ✅ | ✅ | ❌ | ❌ |
| Selesaikan tiket portal HTS | ✅ | ✅ | ❌ | ❌ |
| Tautkan manual / lepas tautan (*unlink*) HTS | ✅ | ✅ | ❌ | ❌ |
| Start New Chat (Outbound) & Re-Open Tiket | ✅ | ✅ | ❌ | ❌ |
| Lihat antrean tiket tim lain | ✅ | ✅ | ❌ (Hanya tim sendiri) | ✅ |
| Lihat rekapitulasi aduan & ekspor CSV | ✅ | ✅ | ❌ | ✅ |
| Hapus data rekap (terpilih / semua + reset sequence) | ✅ | ❌ | ❌ | ❌ |
| Manajemen kontak blast WhatsApp L2 | ✅ | ❌ | ❌ | ❌ |
| Manajemen akun pengguna (CRUD Pengguna) | ✅ | ❌ | ❌ | ❌ |
| Impor & pembersihan Master Data Kontak | ✅ | ❌ | ❌ | ❌ |

---

## 5. Evolusi Sistem

| Versi | Fokus Pengembangan | Status |
|---|---|:---:|
| **V1.0** | Webhook inbound WhatsApp, outbound chat, Socket.io dasar, tagging, rekapitulasi, rate-limit | ✅ Selesai |
| **V2.0** | Otentikasi JWT + RBAC, media gambar dua arah, UI adaptif L1 vs L2, admin CRUD pengguna, siklus `RESOLVED` | ✅ Selesai |
| **V2.1/V2.2** | 3 pilar tim L2, smart multi-assign diffing, resolusi mandiri per-tim, self-unassign, klasifikasi service type, multi-kontak blast | ✅ Selesai |
| **V3.0** | Integrasi portal resmi HTS Diskomdigi (sesi cookie `ci_session`, bypass CAPTCHA, pipeline 3 tahap, PIC sync, dual-close) | ✅ Selesai |
| **V4.0** | Arsitektur Multi-HTS (One-to-Many), Percakapan Biasa vs Aduan Teknis, multimedia L2, redesign 3 kolom, quick replies, disaster recovery manual link | ✅ Selesai |
| **V4.1** | Impor Master Data Kontak (Excel/CSV/VCF), Start New Chat outbound + paginasi direktori, Re-Open tiket, Unlink HTS, sinkronisasi balasan HP helpdesk (`fromMe`), WhatsApp LID addressing | ✅ Selesai |
| **V4.2** | Hardening Keamanan & Kestabilan Sistem: Webhook Shared Secret Auth, Server-side RBAC, Socket.io Handshake Auth & Room Partitions, Fail-fast config env, Path Traversal Protection, Anti-Race Lock (`perNumberLock`), Deduplikasi atomik `@unique wa_message_id`, Background File Retention Worker (90 hari), dan Indeks Komposit Database | ✅ Selesai |

---

## 6. Indeks Dokumentasi Teknis

| Berkas Dokumen | Lingkup Pembahasan |
|---|---|
| [`Project_Overview.md`](./Project_Overview.md) | Dokumen ini — PRD, ringkasan eksekutif, persona pengguna, matriks RBAC, akun seed, dan roadmap evolusi sistem |
| [`Architecture.md`](./Architecture.md) | Tumpukan teknologi, topologi Docker, diagram alur sistem Mermaid, dan arsitektur pengamanan sistem |
| [`Database_and_API.md`](./Database_and_API.md) | Diagram ERD, kamus data tabel & indeks komposit PostgreSQL, kontrak REST API lengkap, dan event WebSocket |
| [`Features_and_Capabilities.md`](./Features_and_Capabilities.md) | Katalog fungsional seluruh fitur aktif (V1 s/d V4.2) |
| [`Operations_and_Deployment.md`](./Operations_and_Deployment.md) | Panduan instalasi 3 track (Lokal, Docker, VPS Node.js produksi via PM2 & Nginx) dan SOP operasional per peran |
| [`QA_and_Quality.md`](./QA_and_Quality.md) | Skenario pengujian QA Modul 1–9, audit keamanan terverifikasi, mitigasi edge cases, dan release checklist |
| [`summary.md`](./summary.md) | Ringkasan eksekutif remedi teknis, changelog komprehensif, dan panduan operasional Linux/WSL |
