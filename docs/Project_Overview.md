# 📋 Gambaran Umum Proyek (Project Overview)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Instansi:** Diskomdigi Provinsi Jawa Tengah  
**Versi Sistem:** Workflow V4.1 Produksi (Multi-HTS, General Chat, Multimedia L2, Quick Replies, Manual Link, Master Data Kontak, Start New Chat, Re-Open Tiket)  
**Audiens Dokumen:** Developer (utama) & Operator Helpdesk (sekunder)  
**Terakhir Diperbarui:** 02 Oktober 2026  

---

## 1. Ringkasan Eksekutif

Sistem Helpdesk **HTS Chat Integration** menjembatani saluran **WhatsApp** dengan dasbor web helpdesk internal dan portal tiket resmi **HTS Diskomdigi Jawa Tengah** (`https://hts.diskomdigi.jatengprov.go.id`).

Arsitektur inti: **Evolution API v2 (Baileys WhatsApp)** $\rightarrow$ **Node.js Express + Socket.io** $\rightarrow$ **PostgreSQL 15 (Prisma ORM)** $\rightarrow$ **React.js + Vite**.

Tata kelola berbasis **RBAC** dengan 4 peran:
- **ADMIN** — akses penuh, manajemen pengguna, master data kontak, reset rekap
- **L1 (Dispatcher)** — garda depan, balas WA pelapor, delegasi L2, integrasi HTS
- **L2 (Teknisi)** — 3 pilar: `Network`, `Server`, `Mechanical & Electrical (M&E)`
- **SPV (Supervisor)** — monitoring antrean, laporan SLA, ekspor CSV

---

## 2. Tujuan Bisnis

1. **Memangkas waktu respons aduan** — bot auto-reply + WebSocket real-time.
2. **Kolaborasi lintas bidang** — 1 chat WhatsApp bisa mendelegasikan ke banyak tim L2 sekaligus dan menerbitkan banyak tiket HTS resmi (Multi-HTS).
3. **Privasi komunikasi teknis** — L2 berkoordinasi via Catatan Internal yang 100% tidak bocor ke WhatsApp pelanggan.
4. **Pelaporan siap saji** — rekapitulasi durasi SLA (FRT/MTTR), kesimpulan solusi, ekspor CSV.
5. **Konsistensi data master** — import kontak resmi (Excel/CSV/Google Contacts/VCF) menjadi identitas pelapor prioritas utama.

---

## 3. Profil Pengguna (User Personas)

| Peran | Tugas Utama | Kanal |
|---|---|---|
| **Pelapor (PIC WhatsApp)** | Mengirim laporan gangguan/permohonan layanan via WhatsApp | WA pelanggan |
| **Dispatcher L1** | Triase aduan, balas pelapor, multi-assign L2, terbitkan/tutup tiket HTS | Dasbor web |
| **Teknisi L2** | Terima blast notifikasi, koordinasi catatan internal, tandai selesai per-tim | Dasbor web + WA blast |
| **Administrator** | CRUD pengguna, master data kontak, kontak blast L2, reset rekap | Dasbor web |
| **Supervisor** | Pantau antrean, evaluasi SLA, ekspor laporan | Dasbor web |

---

## 4. Peran & Hak Akses (RBAC)

### Akun Seed (Semua Password: `password123`)
| Role | Email | Kategori | Hak Akses Utama |
|---|---|:---:|---|
| ADMIN | `admin@helpdesk.go.id` | - | Akses penuh, CRUD pengguna, master data kontak, hapus rekap |
| L1 | `l1@helpdesk.go.id` | - | Chat WA, multi-assign L2, bot, integrasi HTS, tutup tiket |
| SPV | `spv@helpdesk.go.id` | - | Monitoring antrean, laporan SLA, ekspor CSV |
| L2 Network | `l2_network@helpdesk.go.id` | Network | View-only chat, catatan internal, tandai selesai, return |
| L2 Server | `l2_server@helpdesk.go.id` | Server | View-only chat, catatan internal, tandai selesai, return |
| L2 M&E | `l2_me@helpdesk.go.id` | M&E | View-only chat, catatan internal, tandai selesai, return |

### Matriks Hak Akses
| Fitur | ADMIN | L1 | L2 | SPV |
|---|:---:|:---:|:---:|:---:|
| Kirim balasan chat ke pelapor | ✅ | ✅ | ❌ | ❌ |
| Kirim lampiran gambar ke pelapor | ✅ | ✅ | ❌ | ❌ |
| Multi-assign tim L2 | ✅ | ✅ | ❌ | ❌ |
| Kustomisasi & toggle Auto-Reply Bot | ❌ | ✅ | ❌ | ❌ |
| Tulis catatan internal | ✅ | ✅ | ✅ | ❌ |
| Tandai selesai bagian tim (`is_resolved`) | ✅ | ❌ | ✅ | ❌ |
| Lepas / kembalikan penugasan | ✅ | ❌ | ✅ | ❌ |
| Tutup tiket resmi (`Mandatory Summary`) | ✅ | ✅ | ❌ | ❌ |
| Lihat rekap aduan & ekspor CSV | ✅ | ✅ | ❌ | ✅ |
| Hapus data rekap (terpilih / semua + reset ID) | ✅ | ❌ | ❌ | ❌ |
| Manajemen kontak & nomor WA blast L2 | ✅ | ❌ | ❌ | ❌ |
| Manajemen pengguna (CRUD user) | ✅ | ❌ | ❌ | ❌ |
| **Import / hapus Master Data Kontak** | ✅ | ❌ | ❌ | ❌ |
| **Start New Chat (outbound)** | ✅ | ✅ | ❌ | ❌ |
| **Re-Open Tiket (aktifkan kembali)** | ✅ | ✅ | ❌ | ❌ |
| **Unlink tiket HTS** | ✅ | ✅ | ❌ | ❌ |

### Tips Pengujian Multi-Role
1. Buka 2–3 jendela browser (atau mode Incognito).
2. Jendela 1: login `l1@helpdesk.go.id` (antrean & delegasi).
3. Jendela 2: login `l2_network@helpdesk.go.id` (terima tugas, catatan internal, tandai selesai).
4. Jendela 3: login `admin@helpdesk.go.id` (kontak tim & data testing).

---

## 5. Evolusi Sistem

| Versi | Fokus | Status |
|---|---|:---:|
| **V1** | Webhook inbound, outbound chat, WebSocket, tagging, report, helmet/rate-limit | ✅ Selesai |
| **V2** | JWT + RBAC, media gambar dua arah, mode dinamis L1 vs L2, admin CRUD, blast, siklus hidup `RESOLVED` | ✅ Selesai |
| **V2.1/V2.2** | 3 pilar L2, multi-assign, per-team resolution, self-unassign, service type, bot toggle, multi-kontak blast | ✅ Selesai |
| **V3** | Integrasi penuh portal HTS Diskomdigi (cookie `ci_session`, bypass CAPTCHA, pipeline 3 tahap, PIC sync, dual-close) | ✅ Selesai |
| **V4.0** | Multi-HTS, General Chat, multimedia L2, redesign 3 kolom, quick replies & SLA, manual link recovery | ✅ Selesai |
| **V4.1** | Master Data Kontak (import), Start New Chat + direkontori paginasi, Re-Open Tiket, Unlink & auto-assign HTS, fix `fromMe`/LID | ✅ Selesai |

---

## 6. Indeks Dokumentasi

| Dokumen | Isi |
|---|---|
| `Project_Overview.md` | Dokumen ini — PRD, ringkasan proyek, peran & RBAC, akun seed |
| `Architecture.md` | Tech stack, topologi, diagram alur sistem, spesifikasi keamanan |
| `Database_and_API.md` | ERD, struktur tabel & kolom, kontrak REST API & WebSocket |
| `Features_and_Capabilities.md` | Seluruh fitur operasional V1–V4.1 yang aktif |
| `Operations_and_Deployment.md` | SOP operator (L1/L2/Admin/SPV) & panduan deployment |
| `QA_and_Quality.md` | Skenario pengujian QA, potensi bug & mitigasi, audit arsitektur |
