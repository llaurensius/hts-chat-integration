# 🏗️ Arsitektur Teknologi, Diagram Alur & Keamanan Sistem
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi:** Workflow V4.2 Produksi  
**Audiens Dokumen:** Developer & System Architect  
**Terakhir Diperbarui:** 03 Oktober 2026  

---

## 1. Tech Stack

| Layer | Teknologi | Versi | Peran & Tanggung Jawab |
|---|---|:---:|---|
| **WhatsApp Gateway** | **Evolution API v2 (Baileys)** | `v2.3+` | Mengelola protokol WhatsApp (Baileys), autentikasi QR, webhook `messages.upsert`, pengiriman teks & media |
| **Realtime Gateway** | **Socket.io** | `v4.8+` | WebSocket dua arah terotentikasi: pembaruan chat, status tiket, notifikasi real-time terpartisi (*rooms*) |
| **Backend Core** | **Node.js + Express.js** | `v18+/v20/v22` | REST API, webhook controller, otentikasi JWT, penegakan RBAC, reverse-engineering HTS |
| **HTS Engine** | **Axios + Form-Data** | `v1.7+` | Integrasi portal HTS Diskominfo (cookie PHP `ci_session`, CSRF token, bypass CAPTCHA, multipart upload) |
| **Database & ORM** | **PostgreSQL 15 + Prisma** | `v5.22` | Relational storage (tiket, pesan, pengguna, pelanggan, sesi HTS, quick replies) + indeks komposit |
| **Session Cache** | **Redis (Alpine)** | Latest | Cache sesi WhatsApp pada Evolution API (Docker) |
| **Frontend** | **React.js + Vite** | `v18+/Vite 5` | Single Page Application dasbor helpdesk, manajemen state, perutean RBAC |
| **UI Styling & Ikon** | **Tailwind CSS + Lucide React** | `v3+` | Antarmuka responsif modern, tema warna, ikon grafis |

### Pustaka Backend Utama (`backend/package.json`)
- `@prisma/client` & `prisma` — ORM basis data PostgreSQL
- `jsonwebtoken` — Otentikasi stateless JWT (12 jam) & WebSocket handshake
- `bcryptjs` — Hashing kata sandi (salt rounds 10)
- `socket.io` — Engine WebSocket dengan middleware handshake otentikasi & room partition
- `axios`, `form-data` — Klien HTTP dengan timeout eksplisit untuk gateway WhatsApp & portal HTS
- `multer` — Penanganan berkas unggahan dengan sufiks acak dan sanitasi kanonikal
- `helmet`, `express-rate-limit` — Hardening header HTTP (CSP, CORP) & proteksi DoS
- `xlsx` — Parser multi-format impor master data kontak (Excel `.xlsx/.xls`, CSV, dan vCard `.vcf`)
- `cors`, `dotenv` — Konfigurasi lingkungan & CORS terarah

---

## 2. Topologi Arsitektur Sistem

```mermaid
flowchart TD
    subgraph Pengguna Luar
        PIC([Pelapor / PIC WhatsApp])
    end

    subgraph Docker [Infrastruktur Docker Container]
        EVO[Evolution API Gateway :8080]
        REDIS[(Redis Cache :6379)]
        PG_EVO[(evolution_db)]
        PG_HTS[(wa_helpdesk :5433 -> 5432)]
        EVO --- REDIS
        EVO --- PG_EVO
    end

    subgraph Host [Host Server / VPS / LAN]
        BE[Backend Express + Socket.io :3000]
        UPLOADS[(Folder Penyimpanan /uploads/)]
        WORKER_CLEANUP[File Cleanup Worker<br/>90 Days Retention / 24h Cron]
        WORKER_KEEPALIVE[HTS Keep-Alive Worker<br/>Ping Session / 15m Cron]
        FE[Frontend React + Vite :5200]
        
        BE --- PG_HTS
        BE --- UPLOADS
        BE --- WORKER_CLEANUP
        BE --- WORKER_KEEPALIVE
        BE <-->|WebSocket Handshake Auth & REST| FE
    end

    subgraph Eksternal [Portal Resmi Pemprov Jateng]
        HTS_SRV[Portal HTS Diskominfo Jateng<br/>hts.diskomdigi.jatengprov.go.id]
    end

    subgraph Tim [Perangkat Tim Helpdesk]
        L1_UI[L1 Dispatcher Web]
        L2_UI[L2 Teknisi Web]
        ADM_UI[Administrator Web]
        SPV_UI[Supervisor Web]
        FE --- L1_UI
        FE --- L2_UI
        FE --- ADM_UI
        FE --- SPV_UI
    end

    PIC <-->|Protokol WhatsApp| EVO
    EVO -->|Webhook POST /api/webhook/whatsapp<br/>Auth: apikey = WEBHOOK_SECRET| BE
    BE -->|REST API /message/sendText & sendMedia| EVO
    BE <-->|Multi-HTS Pipeline & Dual-Close<br/>Cookie ci_session + CSRF| HTS_SRV
```

### Catatan Jaringan & Port
- `docker-compose.yml` memetakan PostgreSQL ke **`5433:5432`** (host:container). Backend di host **wajib** menggunakan port **`5433`** pada `DATABASE_URL` di file `.env`.
- Webhook Evolution API menuju backend host dialirkan melalui alamat IP bridge gateway: `http://172.17.0.1:3000/api/webhook/whatsapp` (atau via hostname reverse proxy VPS).
- Frontend Vite dikonfigurasi pada port **`5200`** (`vite.config.js`) dan mendeteksi host backend secara otomatis via `window.location.hostname`.

---

## 3. Diagram Alur Sistem (Flowcharts)

### 3.1 Alur Pesan Masuk (Inbound WhatsApp $\rightarrow$ Webhook $\rightarrow$ Database)

```mermaid
flowchart TD
    A([Pelapor Kirim Pesan / Media via WA]) --> B[Server WhatsApp / Meta]
    B --> C[Evolution API Gateway]
    C -->|POST /api/webhook/whatsapp<br/>Header: apikey| D[Middleware verifyWebhookAuth]
    
    D -->|Otentikasi Gagal| D_ERR[HTTP 401 Unauthorized]
    D -->|Otentikasi Berhasil| D_OK[Balas HTTP 200 OK ke Gateway]
    
    D_OK --> E[withLock per-nomor: wa:waNumber]
    
    subgraph LockScope [Serial Execution per WhatsApp Number]
        E --> F{wa_message_id sudah ada di DB?}
        F -- Ya --> F_SKIP[Abaikan: Deduplikasi Sukses]
        F -- Tidak --> G{Pesan Memuat Media Gambar?}
        
        G -- Ya --> H[Ambil Base64 & Simpan ke /uploads/<br/>Nama: img_timestamp_rand6.jpg]
        G -- Tidak --> I[Ekstrak Teks Pesan]
        
        H --> J[Cek Identitas Pelapor di DB]
        I --> J
        
        J --> J1{is_imported_contact = true ATAU<br/>is_custom_name = true?}
        J1 -- Ya --> J2[Pertahankan Nama Resmi Master Data<br/>Simpan pushName ke wa_push_name]
        J1 -- Tidak --> J3[Resolusi Nama Hybrid:<br/>Kontak HP > Push Name > Nomor WA]
        
        J2 --> K{Ada Tiket Aktif?<br/>Status OPEN atau RESOLVED}
        J3 --> K
        
        K -- Tidak Ada --> L[Buat Tiket Baru<br/>is_aduan=false, GENERAL_CHAT]
        L --> M{fromMe = false<br/>Pesan dari pelanggan?}
        M -- Ya --> N{Auto-Reply Bot Aktif?}
        N -- Ya --> O[Kirim Balasan Bot via WhatsApp<br/>Simpan pesan sender_type=BOT]
        N -- Tidak --> P[Lewati Bot]
        M -- Tidak --> Q[Pesan dari HP Fisik Helpdesk<br/>Simpan sender_type=AGENT]
        
        K -- Ada --> R[Hubungkan Pesan ke Tiket Aktif Tersebut]
        
        O --> S[Simpan Pesan ke Tabel Message<br/>Constraint @unique wa_message_id]
        P --> S
        Q --> S
        R --> S
        
        S --> T[req.io.emit 'new_message']
    end
    
    T --> U([Gelembung Chat Muncul Real-time di Dasbor Web])
```

---

### 3.2 Alur Pendelegasian Smart Multi-Assign & WhatsApp Blast L2

```mermaid
flowchart TD
    A([Dispatcher L1 Buka Tiket Aktif]) --> B[Klik 'Assign ke L2']
    B --> C[Modal Penugasan Tim]
    C --> D[Centang 1 atau Banyak Tim:<br/>Network / Server / M&E]
    D --> E[Pilih Jenis Layanan Service Type]
    E --> F[Klik 'Simpan Penugasan']

    F --> G[POST /api/chat/tickets/:id/assign]
    G --> H[Evaluasi Diff Penugasan Tim:<br/>- Tim eksisting dipertahankan<br/>- Tim baru dibuatkan TicketCategory<br/>- Tim dilepas dimintai konfirmasi]
    H --> I[Catat Catatan Internal Sistem]
    I --> J{Terdapat Kontak di CategoryContact<br/>untuk Tim yang Baru Ditugaskan?}
    J -- Ya --> K[Paralel WA Blast via Promise.allSettled<br/>Timeout 5000ms per nomor]
    J -- Tidak --> L[Lewati Notifikasi WA]
    K --> M[Emit Socket.io 'ticket_assigned']
    L --> M
    M --> N([Antrean Tim L2 Terkait Otomatis Terbarui])
```

---

### 3.3 Alur Penyelesaian Mandiri Per-Tim (Per-Team Resolution)

```mermaid
flowchart TD
    A([Teknisi L2 Buka Tiket Timnya]) --> B[Analisis & Tindakan Perbaikan Lapangan]
    B --> C{Hasil Evaluasi Tim L2}
    
    C -- Selesai Dilayani --> D[Klik 'Tandai Selesai']
    D --> E[Isi Formulir Solusi Teknis Lapangan]
    E --> F[POST /api/chat/tickets/:id/resolve]
    F --> G[Update TicketCategory:<br/>is_resolved=true, solution, resolved_at]
    G --> H{Apakah Seluruh Tim yang Ditugaskan<br/>Telah Menyatakan is_resolved = true?}
    H -- Belum Lengkap --> I[Tiket Utama Tetap Berstatus OPEN<br/>Header tampilkan centang parsial]
    H -- Sudah Lengkap --> J[Status Tiket Utama Otomatis Berubah: RESOLVED<br/>L1 Siap Menutup Tiket Resmi]
    
    C -- Bukan Kewenangan Tim --> K[Klik 'Kembalikan / Lepas Penugasan']
    K --> L[POST /api/chat/tickets/:id/return + Alasan]
    L --> M[Hapus TicketCategory Tim Tersebut<br/>Tim Lain Tetap Berjalan Normal]
```

---

### 3.4 Alur Integrasi Portal Resmi HTS Diskominfo

#### A. Autentikasi Sesi HTS (Bypass Visual CAPTCHA)
```mermaid
sequenceDiagram
    autonumber
    actor P as Dispatcher L1
    participant UI as Web Dashboard
    participant BE as Express Server
    participant HTS as Portal HTS Pemprov Jateng

    P->>UI: Klik "Hubungkan Akun HTS"
    UI->>BE: GET /api/hts/captcha
    BE->>HTS: GET / (ambil CSRF token & cookie awal)
    BE->>HTS: GET /captcha?rand=... (buffer biner)
    HTS-->>BE: Gambar PNG CAPTCHA + Set-Cookie
    BE-->>UI: { success: true, captchaImage: base64, csrfToken }
    UI-->>P: Render gambar CAPTCHA di modal login
    P->>UI: Input Email HTS + Password + Teks CAPTCHA
    UI->>BE: POST /api/hts/login
    BE->>HTS: POST /login (x-www-form-urlencoded)
    HTS-->>BE: 302 Redirect + Set-Cookie ci_session
    BE->>BE: Simpan cookie sesi aktif ke tabel HtsUserSession
    BE-->>UI: { success: true, user: "..." }
    UI-->>P: Panel kanan hijau: "Terhubung sebagai ..."
```

#### B. Penerbitan Tiket HTS (Pipeline 3 Tahap)
```mermaid
flowchart TD
    A([L1 Klik Sinkronkan ke Portal HTS]) --> B[Formulir Data Aduan HTS]
    B --> C[Isi Data: Kategori, Detil min 10 char,<br/>PIC Penerima, OPD Induk, Lampiran multi-foto]
    C --> D[POST /api/chat/tickets/:id/hts]
    D --> E[Ambil Cookie ci_session Petugas dari DB]

    subgraph Pipeline [Pipeline 3 Tahap htsClientService]
        E --> F[Tahap 1: POST /submit_aduan<br/>Kirim data formulir + lampiran pic]
        F --> G[HTS Mengeluarkan Nomor Aduan Resmi<br/>Format: 2041-TShoot-2026-jateng-10]
        G --> H[POST /get_aduan_data status unsubmitted<br/>Ekstrak id_trouble numerik]
        H --> I[Tahap 2: POST /submit_aduan_status<br/>Ubah status: unsubmitted -> input-pic]
        I --> J[Tahap 3: POST /submit_pic<br/>Penugasan PIC awal via form-data]
    end

    J --> K[Status Tiket HTS Menjadi PENDING]
    K --> L[Simpan Entri ke Tabel TicketHts<br/>+ Relasi ke Category Tim]
    L --> M[req.io.emit 'hts_ticket_created']
    M --> N([Kartu Tiket HTS Tampil di Panel Kanan])
```

#### C. Dual-Close Berintegritas (Penutupan Lokal + Penyelesaian HTS)
```mermaid
flowchart TD
    A([L1 Klik Tombol Selesaikan Tiket]) --> B[Modal Penutupan Tiket Resmi]
    B --> C{Cek SSOT TicketHts:<br/>Apakah seluruh tiket HTS terkait<br/>sudah berstatus SOLVED?}
    
    C -- Sudah Semua SOLVED --> D[Formulir Solusi HTS Disembunyikan<br/>Badge Hijau: Seluruh Tiket HTS Selesai]
    C -- Masih Ada PENDING --> E[Formulir Solusi HTS Diaktifkan<br/>Input Solusi + Pilihan Gabungan PIC Penerima & Penanganan]
    
    D --> F[Klik 'Konfirmasi Tutup Tiket']
    E --> F
    
    F --> G[POST /api/chat/tickets/:id/close]
    G --> H[Loop Seluruh TicketHts yang Masih PENDING<br/>Kirim POST /submit_solve ke Portal HTS]
    
    H --> I{Apakah Seluruh Eksekusi HTS Berhasil?}
    
    I -- Ada yang Gagal / Timeout --> J[BATALKAN PENUTUPAN LOKAL!<br/>Kembalikan HTTP 400 berisi daftar nomor #HTS yang gagal<br/>Tiket tetap OPEN agar dapat dicoba kembali]
    I -- Seluruhnya Berhasil SOLVED --> K[Tutup Tiket Lokal:<br/>status=CLOSED, closed_at=now, summary]
    
    K --> L[req.io.emit 'ticket_closed']
    L --> M([Tiket Pindah ke Tab Selesai])
```

---

## 4. Arsitektur Keamanan Sistem (Security Architecture)

### 4.1 Validasi Konfigurasi Lingkungan Fail-Fast (`SEC-03`)
Sistem menginisialisasi [`config/env.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/config/env.js) pada baris pertama startup aplikasi. Jika salah satu variabel wajib (`DATABASE_URL`, `JWT_SECRET`, `EVOLUTION_API_TOKEN`) tidak disetel atau bernilai string kosong, peladen langsung menghentikan proses (`process.exit(1)`) dengan pesan kesalahan konfigurasi fatal, mencegah eksekusi dengan kredensial default yang lemah.

### 4.2 Autentikasi Webhook Shared Secret (`SEC-01`)
Endpoint penerimaan pesan WhatsApp `POST /api/webhook/whatsapp` dilindungi oleh [`webhookAuth.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/middlewares/webhookAuth.js):
- Memvalidasi token dari header `apikey`, `x-api-key`, `Authorization: Bearer <token>`, atau query parameter `token`.
- Menggunakan perbandingan string waktu-konstan (`crypto.timingSafeEqual`) untuk menolak serangan *timing attack*.
- Membatasi ukuran body parser webhook maksimal **10MB** dan menerapkan *rate limiter* khusus **300 request / menit / IP**.

### 4.3 Penegakan Otorisasi RBAC Sisi Peladen (`SEC-02` & `AUTH-01`)
Otorisasi tidak hanya dibebankan pada antarmuka web, melainkan ditegakkan secara absolut di lapisan Express via [`authMiddleware.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/middlewares/authMiddleware.js):
- `verifyToken`: Memverifikasi integritas token JWT dan menyuntikkan identitas pengguna ke `req.user`.
- `requireRole([...])`: Memeriksa peran aktif pengguna (`ADMIN`, `SPV`, `L1`, `L2`).
- **Isolasi Baris Data:** Agen L2 yang memiliki `category_id` hanya diizinkan membaca pesan dan antrean tiket timnya sendiri.

### 4.4 Otentikasi Handshake WebSocket & Isolasi Ruang (`SEC-05`)
Peladen Socket.io pada [`index.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/index.js) menerapkan middleware handshake `io.use`:
- Memverifikasi token JWT dari `socket.handshake.auth.token` sebelum menyetujui koneksi WebSocket.
- Klien anonim langsung ditolak dengan pesan `unauthorized`.
- Soket yang terotentikasi otomatis dimasukkan ke dalam ruang (*rooms*) eksklusif: `user_{id}`, `role_{role}`, dan `category_{category_id}`.

### 4.5 Pencegahan Path Traversal Lampiran (`SEC-04`)
Seluruh fungsi pemrosesan lampiran berkas yang dikirimkan ke portal HTS disaring menggunakan modul [`safePath.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/utils/safePath.js):
- Memeriksa nama berkas menggunakan `path.resolve` dan memastikan jalur kanonikal berkas berada di dalam folder yang diizinkan (`/uploads`).
- Upaya manipulasi jalur direktori (`../`) akan memicu penolakan seketika dengan pesan `Akses path traversal ditolak`.

### 4.6 Proteksi Race Condition & Konkurensi Data (`DATA-01` & `DATA-02`)
- **Mutex Per-Nomor WhatsApp:** Webhook incoming dibungkus oleh antrean janji in-memory [`perNumberLock.js`](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/utils/perNumberLock.js) berbasis key `wa:${waNumber}`. Pesan yang tiba dalam interval milidetik diproses secara serial.
- **Deduplikasi Atomik Database:** Kolom `Message.wa_message_id` memiliki indeks `@unique`. Jika terjadi tabrakan pesan ganda, penanganan kesalahan Prisma menangkap kode `P2002` secara elegan tanpa menjatuhkan proses peladen.

### 4.7 Background Workers & Siklus Hidup File (`RES-03`)
Aplikasi menjalankan dua background service mandiri di dalam event loop peladen:
1. **`htsKeepAliveService` (Interval 15 Menit):** Melakukan ping ringan otomatis ke portal HTS untuk memastikan sesi cookie petugas L1 tidak kedaluwarsa.
2. **`fileCleanupService` (Interval 24 Jam):** Memindai dan menghapus berkas lampiran media fisik pada direktori `/uploads` untuk tiket yang telah berstatus `CLOSED` lebih dari 90 hari.

### 4.8 Optimasi Indeks Skema Database (`DATA-04`)
Model basis data PostgreSQL telah dilengkapi dengan indeks komposit:
- `Ticket`: `@@index([status, is_aduan, created_at(sort: Desc)])` untuk filtering antrean cepat dan `@@index([customer_id, status])`.
- `Customer`: `@@index([name])` dan `@@index([skpd_name])` untuk pencarian direktori kontak berkinerja tinggi.
