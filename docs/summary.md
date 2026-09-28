# 📋 Rangkuman Pekerjaan & Status Implementasi Sistem
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi Sistem:** Workflow V2 (Full Stack Implementation)  
**Terakhir Diperbarui:** 28 September 2026

---

## 📌 1. Ringkasan Eksekutif

Sistem Helpdesk HTS Chat Integration telah bertransformasi dari tahap perancangan dokumen menjadi sistem aplikasi **Full-Stack fungsional penuh**. Sistem ini menghubungkan komunikasi WhatsApp dari pelanggan (PIC / Pelapor) dengan dasbor web terpusat bagi tim Helpdesk, menggunakan arsitektur **Evolution API v2**, **Node.js Express + Socket.io**, **PostgreSQL (Prisma ORM)**, dan **React.js + Tailwind CSS**.

Sistem menerapkan **Workflow V2** dengan sistem peran berlapis (*Role-Based Access Control* - RBAC) yang memisahkan tugas antara **Admin**, **Dispatcher (L1)**, dan **Teknisi Spesialis (L2)**, lengkap dengan notifikasi WhatsApp blast otomatis dan dukungan pertukaran media gambar dua arah.

---

## 🚀 2. Perkembangan Pengerjaan: Workflow V1 ke Workflow V2

### A. Workflow V1 (Dasar Sistem - Selesai)
- **Fase 0:** Setup *boilerplate*, konfigurasi Docker Compose untuk PostgreSQL dan Evolution API v2, inisialisasi Prisma ORM.
- **Fase 1:** *Inbound Webhook* dari Evolution API, auto-create customer & tiket, serta pesan otomatis *Auto-Reply Bot*.
- **Fase 2:** API Chat untuk pesan keluar (*Outbound Message*) via WhatsApp Gateway.
- **Fase 3:** Dasbor *Live Chat* dengan *real-time communication* via Socket.io.
- **Fase 4:** Multi-tagging kategori kendala dan penutupan tiket dengan *Mandatory Summary* (kesimpulan penanganan).
- **Fase 5:** Dasbor Laporan & Rekapitulasi (*Reporting Tab*) dengan fitur **Export to CSV**.
- **Fase 6:** Pengamanan dasar HTTP Headers menggunakan `helmet` dan `express-rate-limit`.

---

### B. Workflow V2 (Penyempurnaan Bisnis, RBAC & Media - Selesai)

#### 1. Fase 1: Perombakan Skema Database & Multi-Category
- Mengganti konsep *Division* menjadi model **`Category`** terstruktur (Server, Network, M&E, Aplikasi, Request Layanan, Monitoring).
- Menambahkan kolom `wa_target_number` pada Kategori untuk kebutuhan *blast* tugas ke nomor WhatsApp PIC Teknisi/Grup.
- Menambahkan status tiket baru: `RESOLVED` (Pekerjaan selesai oleh L2, menunggu konfirmasi tutup oleh L1).
- Menambahkan penanda `is_internal` pada tabel `Message` untuk obrolan/catatan khusus internal tim tanpa dikirim ke WhatsApp pelapor.

#### 2. Fase 2: Autentikasi & Autorisasi (JWT + RBAC Middleware)
- Pembuatan endpoint login `/api/auth/login` dengan enkripsi sandi `bcryptjs` dan tokenisasi `jsonwebtoken` (JWT).
- Proteksi seluruh rute API chat dan report menggunakan middleware `verifyToken` dan `requireRole`.
- Penyediaan endpoint verifikasi sesi `/api/auth/me`.

#### 3. Fase 3 & Peningkatan Media Dua Arah
- **Helpdesk ke PIC:** Pengiriman media gambar melalui UI tombol lampiran (📎), konversi file via Multer ke disk penyimpanan, dan pengiriman otomatis ke WhatsApp pelapor melalui Evolution API `/message/sendMedia`.
- **PIC ke Helpdesk:** Penerimaan gambar dari WhatsApp pelapor, otomatis diunduh melalui endpoint Evolution API (`/chat/getBase64FromMediaMessage`), disimpan di direktori `/uploads/`, dan disajikan secara aman via static asset server.

#### 4. Fase 4: Antarmuka Frontend (React Router & RBAC UI)
- Integrasi `react-router-dom` dengan halaman Login dan navigasi terlindungi.
- Pembelahan UI dinamis berbasis peran:
  - **L1 (Dispatcher):** Input chat balasan pelanggan, tombol kirim lampiran gambar, tombol "Assign ke L2", dan modal "Selesaikan Tiket".
  - **L2 (Teknisi):** Tampilan *view-only* percakapan pelanggan, kolom input khusus *Catatan Internal* (warna kuning), tombol "Tandai Selesai", dan tombol "Kembalikan L1".
- Rendering gambar langsung di dalam gelembung percakapan (*chat bubble*).

#### 5. Fase 4.5: Akun Admin & Manajemen Pengguna
- Penambahan role **`ADMIN`** yang memiliki kapabilitas L1 + L2 sekaligus.
- Pembuatan menu dan antarmuka **Manajemen Pengguna** untuk Admin membuat, melihat daftar, dan menghapus akun tim (L1/L2) beserta penetapan kategori L2.

#### 6. Fase 5: Pendelegasian Tiket L1 ke L2 & WhatsApp Blast
- Tombol dan modal **"Assign ke L2"** pada tiket aktif.
- Dispatcher memilih Kategori masalah yang dituju.
- Sistem otomatis mencatat histori internal dan mengirimkan pesan **WhatsApp Blast Notifikasi** ke nomor target L2 via Evolution API.

#### 7. Fase 6: Siklus Hidup Tiket L2 (Resolve & Return)
- **Tandai Selesai:** Teknisi L2 mengubah status tiket menjadi `RESOLVED` ketika kendala teknis telah tertangani.
- **Kembalikan ke L1:** Teknisi L2 dapat mengembalikan tiket ke antrean terbuka L1 jika terjadi salah kamar/kategori.
- **Tutup Tiket:** Tiket `RESOLVED` diberi label visual biru pada antrean L1 agar Dispatcher segera menghubungi pelapor dan menutup tiket secara resmi (`CLOSED`) disertai kesimpulan penanganan.

---

## 🛠️ 3. Bug Fixes & Stabilitas yang Telah Diselesaikan

1. **React Hooks Order Error (`Rendered more hooks than during the previous render`)**:
   - *Masalah:* State dan Effect tab Admin ditempatkan di bawah conditional check `if (!currentUser) return null`.
   - *Solusi:* Memindahkan seluruh deklarasi Hooks ke tingkat teratas komponen sesuai aturan React.
2. **Crash Format Kategori pada Auth Me**:
   - *Masalah:* Endpoint `/api/auth/me` mengembalikan objek relasi `Category`, sedangkan React merendernya sebagai teks anak (`child`).
   - *Solusi:* Normalisasi output controller menjadi string nama kategori dan penambahan pengecekan tipe data pada UI.
3. **Pemberian Rute API Internal-Note**:
   - *Masalah:* Kesalahan penulisan *chaining* rute Express pada `routes/chat.js` menyebabkan rute internal note berstatus 404.
   - *Solusi:* Refaktor dan restrukturisasi rute Express secara bersih dan eksplisit.
4. **Gambar Broken / Content-Type Octet-Stream**:
   - *Masalah:* File upload tersimpan tanpa ekstensi file dan dicegat oleh header Helmet `Cross-Origin-Resource-Policy: same-origin`.
   - *Solusi:* Membuat utility `imageStorage.js` berbasis Multer diskStorage yang mempertahankan ekstensi asli (`.jpg`/`.png`), menyesuaikan header CSP & CORP, serta memperbaiki record data lama di database.
5. **Penerimaan Gambar dari WhatsApp PIC**:
   - *Masalah:* Evolution API tidak menyertakan data base64 pada payload webhook events.
   - *Solusi:* Mengimplementasikan pengunduhan gambar aktif via endpoint `/chat/getBase64FromMediaMessage` begitu metadata gambar masuk ke webhook.

---

## 👥 4. Akun Default Pengujian (Seeding)

Semua akun terdaftar menggunakan **Password:** `password123`

| Peran (Role) | Nama Pengguna | Alamat Email | Hak Akses Utama |
|---|---|---|---|
| **ADMIN** | Administrator | `admin@helpdesk.go.id` | Akses penuh (L1 + L2) & Menu Manajemen User |
| **L1** | Dispatcher L1 | `l1@helpdesk.go.id` | Chat ke PIC, Assign L2, Tutup Tiket Resmi |
| **SPV** | Supervisor | `spv@helpdesk.go.id` | Monitoring, Reporting, dan Chat |
| **L2 (Server)** | Teknisi Server | `l2_server@helpdesk.go.id` | View chat, Catatan Internal, Tandai Selesai, Return |
| **L2 (Network)**| Teknisi Network | `l2_network@helpdesk.go.id` | View chat, Catatan Internal, Tandai Selesai, Return |

---

## 📂 5. Rekapitulasi Dokumen Terkait

- Dokumen Kebutuhan Produk: [`docs/PRD_WhatsApp_Helpdesk.md`](./PRD_WhatsApp_Helpdesk.md)
- Desain Skema Database: [`docs/Database_Schema.md`](./Database_Schema.md)
- Perencanaan Alur V2: [`docs/Workflow_V2_Brainstorming.md`](./Workflow_V2_Brainstorming.md)
- Rencana Implementasi V2: [`docs/Implementation_Plan_V2.md`](./Implementation_Plan_V2.md)
- Panduan Operasional Tim: [`docs/Operational_Guide.md`](./Operational_Guide.md)
- Daftar Kredensial Pengguna: [`docs/user.md`](./user.md)
