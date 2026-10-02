# 🏗️ Arsitektur Teknologi, Diagram Alur & Keamanan Sistem
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi:** Workflow V4.1 Produksi  
**Audiens Dokumen:** Developer  

---

## 1. Tech Stack

| Layer | Teknologi | Versi | Peran |
|---|---|:---:|---|
| **WhatsApp Gateway** | **Evolution API v2 (Baileys)** | `v2.3.7` | Mengelola protokol WhatsApp (Baileys), QR auth, webhook `messages.upsert`, REST kirim teks/media |
| **Realtime Gateway** | **Socket.io** | `v4.8+` | WebSocket dua arah: pesan masuk, status tiket, notifikasi |
| **Backend Core** | **Node.js + Express.js** | `v18+/v22` | REST API, controller webhook, JWT, integrasi HTS |
| **HTS Engine** | **Axios + Form-Data** | `v1.7+` | Reverse-engineering portal HTS (cookie PHP `ci_session`, CSRF, bypass CAPTCHA, multipart) |
| **Database & ORM** | **PostgreSQL 15 + Prisma** | `v5.22` | Seluruh data relasional (tiket, pesan, pengguna, pelanggan, integrasi HTS) |
| **Session Cache** | **Redis (Alpine)** | Latest | Cache sesi Evolution API (Docker) |
| **Frontend** | **React.js + Vite** | `v18+/Vite 5` | SPA dasbor helpdesk, RBAC UI, react-router-dom |
| **UI Styling** | **Tailwind CSS + Lucide React** | `v3+` | Antarmuka responsif, ikon grafis |

### Pustaka Backend Utama (`backend/package.json`)
- `@prisma/client` & `prisma` — ORM PostgreSQL
- `jsonwebtoken` — JWT 12 jam
- `bcryptjs` — hashing password (salt rounds 10)
- `socket.io` — WebSocket real-time
- `axios`, `form-data` — komunikasi HTTP ke Evolution API & Portal HTS
- `multer` — upload file media (diskStorage, ekstensi asli)
- `helmet`, `express-rate-limit` — keamanan HTTP
- `xlsx` — parsing file import kontak (Excel/CSV)
- `cors`, `dotenv`

### Pustaka Frontend Utama (`frontend/package.json`)
- `react`, `react-dom`, `react-router-dom`, `vite`
- `socket.io-client`, `axios`
- `lucide-react`, `tailwindcss`, `date-fns`

---

## 2. Topologi Arsitektur Sistem

```mermaid
flowchart TD
    subgraph Pengguna Luar
        PIC([Pelanggan / PIC WhatsApp])
    end

    subgraph Docker [Infrastruktur Docker Container]
        EVO[Evolution API Gateway :8080]
        REDIS[(Redis Cache :6379)]
        PG_EVO[(evolution_db)]
        PG_HTS[(wa_helpdesk :5433->5432)]
        EVO --- REDIS
        EVO --- PG_EVO
    end

    subgraph Host [Host Server / LAN]
        BE[Backend Express + Socket.io :3000]
        UPLOADS[(Folder /uploads/)]
        FE[Frontend React + Vite :5200]
        BE --- PG_HTS
        BE --- UPLOADS
        BE <-->|WebSocket & REST| FE
    end

    subgraph Eksternal [Portal Eksternal Pemprov Jateng]
        HTS_SRV[Portal HTS Diskomdigi]
    end

    subgraph Tim [Perangkat Tim Helpdesk]
        L1_UI[L1 Dispatcher]
        L2_UI[L2 Teknisi]
        ADM_UI[Administrator]
        FE --- L1_UI
        FE --- L2_UI
        FE --- ADM_UI
    end

    PIC <-->|Protokol WhatsApp| EVO
    EVO -->|Webhook POST /api/webhook/whatsapp| BE
    BE -->|REST API /message/sendText & sendMedia| EVO
    BE <-->|Sinkronisasi Tiket & Dual-Close<br/>Cookie ci_session + CSRF| HTS_SRV
```

### Catatan Jaringan Docker
- `docker-compose.yml` memetakan Postgres ke **`5433:5432`** (host:container). Backend di host wajib memakai port **5433** di `DATABASE_URL`.
- Webhook Evolution → backend memakai IP bridge Docker host: `http://172.17.0.1:3000/api/webhook/whatsapp` (atau `HOST_IP`).
- Frontend memakai `window.location.hostname` dinamis untuk koneksi API/Socket agar akses LAN langsung jalan tanpa konfigurasi tambahan.

---

## 3. Diagram Alur Sistem (Flowcharts)

### 3.1 Alur Pesan Masuk (Inbound WhatsApp $\rightarrow$ Webhook)

```mermaid
flowchart TD
    A([Pelapor Kirim Pesan / Gambar via WA]) --> B[Server WhatsApp / Meta]
    B --> C[Evolution API Gateway]
    C -->|Webhook POST /api/webhook/whatsapp| D[Backend Express Controller]

    D --> E{Pesan Memuat Gambar?}
    E -- Ya --> F[Unduh Base64 dari Evolution API<br/>Simpan ke /uploads/img_*.jpg]
    E -- Tidak --> G[Ekstrak Teks Pesan]
    F --> H[Cek / Upsert Customer]
    G --> H

    H --> H2{Nama berasal dari<br/>Master Data Import / Edit Manual?}
    H2 -- Ya --> H3[TIDAK TIMPA nama<br/>Simpan pushName ke wa_push_name]
    H2 -- Tidak --> H4[Update nama dari pushName / kontak HP]
    H3 --> I
    H4 --> I

    I{Ada Tiket Aktif?<br/>OPEN atau RESOLVED}
    I -- Tidak --> J[Buat Tiket Baru<br/>is_aduan=false, GENERAL_CHAT]
    J --> K{fromMe = false<br/>(dari pelanggan)?}
    K -- Ya --> L[Kirim Auto-Reply Bot jika aktif]
    K -- Tidak --> P[Simpan sebagai AGENT]
    L --> M[Simpan pesan BOT]
    M --> P
    I -- Ada --> N[Sambungkan ke Tiket Aktif]
    N --> P

    P --> R[Emit Socket.io: new_message]
    R --> S([Tampil Seketika di Web Dashboard])
```

**Catatan teknis (V4.1):**
- Deduplikasi pesan via kolom `Message.wa_message_id` (`key.id` dari Evolution). Webhook skip jika ID sudah ada.
- Proteksi *race condition*: `prisma.customer.upsert` + fallback pembuatan tiket jika bentrok konkurensi.
- Mendukung **WhatsApp LID addressing** (`remoteJidAlt` $\rightarrow$ nomor HP asli).
- Pesan `fromMe=true` dari HP fisik helpdesk diterima & disimpan sebagai `AGENT`.

---

### 3.2 Alur Pendelegasian Smart Multi-Assign & WhatsApp Blast

```mermaid
flowchart TD
    A([L1 Buka Tiket Aktif]) --> B[Klik Assign ke L2]
    B --> C[Modal Penugasan]
    C --> D[Centang Tim: Network / Server / M&amp;E]
    D --> E[Pilih Jenis Layanan]
    E --> F[Klik Simpan Penugasan]

    F --> G[POST /api/chat/tickets/:id/assign]
    G --> H[Diff Penugasan:<br/>Existing dipertahankan<br/>Added dibuat baru<br/>Removed dihapus dengan konfirmasi]
    H --> I[Tulis Catatan Internal Sistem]
    I --> J{Ada Kontak di CategoryContact<br/>untuk Tim yang Baru Ditugaskan?}
    J -- Ya --> K[Loop Kirim WA Blast ke Nomor/Grup L2]
    J -- Tidak --> L[Lewati Notifikasi]
    K --> M[Emit Socket.io]
    L --> M
    M --> N([Antrean L1 & L2 Terupdate])
```

**Catatan teknis:** Blast hanya dikirim ke tim **yang baru ditambahkan** (anti-spam berulang). Penugasan ulang tidak mereset `is_resolved` tim yang sudah selesai.

---

### 3.3 Alur Penyelesaian Mandiri Per-Tim (Per-Team Resolution)

```mermaid
flowchart TD
    A([Teknisi L2 Buka Tiket]) --> B[Analisis Kendala Lapangan]
    B --> C{Status Pekerjaan Tim?}
    C -- Selesai --> D[Klik Tandai Selesai]
    D --> E[Isi Solusi Teknis]
    E --> F[POST /tickets/:id/resolve]
    F --> G[Update TicketCategory:<br/>is_resolved=true, solution]
    G --> H{Semua Tim Ditugaskan<br/>sudah is_resolved?}
    H -- Belum --> I[Tiket Utama Tetap OPEN]
    H -- Ya --> J[Otomatis Status = RESOLVED]
    C -- Salah Kamar --> K[Klik Kembalikan / Lepas]
    K --> L[POST /tickets/:id/return + Alasan]
    L --> M[Tim Tersebut Dilepas,<br/>Tim Lain Tidak Terpengaruh]
```

---

### 3.4 Alur Integrasi Portal HTS Diskomdigi

#### A. Autentikasi Sesi HTS (Bypass CAPTCHA Visual)
```mermaid
sequenceDiagram
    autonumber
    actor P as Dispatcher L1
    participant UI as Web Dashboard
    participant BE as Express Server
    participant HTS as Portal HTS

    P->>UI: Klik "Hubungkan Akun HTS"
    UI->>BE: GET /api/hts/captcha
    BE->>HTS: GET halaman + /captcha (cookie ci_session)
    HTS-->>BE: Buffer gambar PNG CAPTCHA
    BE-->>UI: Base64 CAPTCHA + CSRF Token
    UI-->>P: Tampilkan gambar CAPTCHA
    P->>UI: Email + Password + teks CAPTCHA
    UI->>BE: POST /api/hts/login
    BE->>HTS: POST /login (x-www-form-urlencoded)
    HTS-->>BE: 302 + Set-Cookie ci_session (login sukses)
    BE->>BE: Simpan cookie ke tabel HtsUserSession
    BE-->>UI: { success, message: "Terhubung sebagai ..." }
    UI-->>P: Panel kanan hijau: Terhubung
```

#### B. Penerbitan Tiket (Pipeline 3 Tahap)
```mermaid
flowchart TD
    A([L1 Klik Sinkronkan ke Portal HTS]) --> B[Form Data HTS]
    B --> C[Isi: Kategori, Detil min 10 char,<br/>PIC Penerima, OPD Induk opsional, Lampiran multi-foto]
    C --> D[POST /api/chat/tickets/:id/sync-hts]
    D --> E[Ambil Cookie ci_session dari HtsUserSession]

    subgraph Pipeline [Pipeline 3 Tahap htsClientService]
        E --> F[Tahap 1: POST /submit_aduan<br/>Kirim data + pic[] array]
        F --> G[HTS Terbitkan Nomor Aduan<br/>contoh: 2041-TShoot-2026-jateng-10]
        G --> H[POST /get_aduan_data unsubmitted<br/>Ambil id_trouble numerik]
        H --> I[Tahap 2: POST /submit_aduan_status<br/>unsubmitted -> input-pic]
        I --> J[Tahap 3: POST /submit_pic<br/>PIC awal, misal pic_id=14]
    end

    J --> K[Status HTS = PENDING]
    K --> L[Simpan di DB:<br/>Ticket.hts_* + baris TicketHts]
    L --> M[Emit Socket.io hts_ticket_created]
    M --> N([Nomor HTS tampil di Header & Panel])
```

#### C. Dual-Close (Penutupan Tiket + Selesaikan di HTS)
```mermaid
flowchart TD
    A([L1 Klik Selesaikan Tiket]) --> B[Modal Penutupan]
    B --> C{Seluruh Tiket HTS<br/>terkait sudah SOLVED?}
    C -- Ya --> D[Form HTS disembunyikan<br/>Badge: Sudah SOLVED]
    C -- Belum --> E[Form Solusi HTS aktif<br/>Tanggal/Jam/PIC/Bukti]
    E --> F[L1 Centang PIC:<br/>PIC Penerima + PIC Penanganan]
    D --> G[Klik Tutup Tiket]
    F --> G
    G --> H[POST /api/chat/tickets/:id/close]
    H --> I[Loop TicketHts berstatus PENDING<br/>Submit solveTicketHts per tiket]
    I --> J{Submit ke HTS Berhasil?}
    J -- Gagal --> K[BATALKAN Penutupan Lokal!<br/>Chat tetap terbuka]
    J -- Berhasil --> L[Update lokal CLOSED + summary]
    L --> M[Emit Socket.io ticket_closed]
```

**Kebijakan integritas:** Jika submit ke portal HTS gagal (file ditolak / sesi expired), tiket lokal **tidak tertutup** sehingga percakapan tidak terputus sepihak.

#### D. Manual Link & Disaster Recovery
```mermaid
flowchart TD
    A([Tiket belum punya Nomor HTS]) --> B[Klik Sinkronkan ke Portal HTS]
    B --> C[Drawer Tab 1: Terbitkan Baru]
    B --> D[Drawer Tab 2: Tautkan yang Sudah Ada]
    C --> E[Pipeline 3 tahap seperti 3.4-B]
    D --> F[Input No. Aduan + Pilih Divisi Tim]
    F --> G[POST /tickets/:id/link-hts]
    G --> H{Nomor sudah tertaut<br/>di percakapan ini?}
    H -- Ya --> I[TOLAK 400: Duplikat di percakapan]
    H -- Belum --> J{Nomor tertaut<br/>di tiket lain?}
    J -- Ya --> K[Konfirmasi Force Link 409]
    J -- Tidak --> L[lookupTicketByNumber ke HTS]
    K --> L
    L --> M[Simpan TicketHts + Update Ticket.hts_*]
    M --> N[Auto-Promotion is_aduan=true]
    N --> O{category_id dipilih?}
    O -- Ya --> P[Auto-create TicketCategory<br/>+ Socket ticket_assigned]
    O -- Tidak --> Q[Lewati auto-assign]
    P --> Q
    Q --> R[Catatan internal sistem<br/>+ Emit hts_ticket_created]
```

---

### 3.5 Alur Start New Chat (Outbound) & Import Master Data Kontak

```mermaid
flowchart TD
    subgraph Impor [Import Master Data Kontak - Admin]
        A1[Admin Buka Modal Chat Baru<br/>klik Import Master Data Kontak] --> A2[Unggah File Excel/CSV/VCF]
        A2 --> A3{Deteksi Format File}
        A3 -- VCF --> A4[Parser vCard: FN/N + TEL + ORG]
        A3 -- CSV/XLSX --> A5[Parser xlsx: kolom fleksibel<br/>termasuk First/Middle/Last Name<br/>dan Organization Name]
        A4 --> A6
        A5 --> A6[Upsert Customer:<br/>is_imported_contact=true]
        A6 --> A7[MASTER DATA = PRIORITAS UTAMA<br/>Tidak tertimpa nama WA]
    end

    subgraph Chat [Start New Chat]
        B1[L1 Klik Chat Baru] --> B2[Pencarian Direktori Kontak<br/>(DB Master + Kontak HP Evolution)]
        B2 --> B3[Pilih Kontak atau Ketik Manual<br/>+ Pesan Pembuka]
        B3 --> B4{Toggle: Langsung<br/>Kirim Pesan?}
        B4 -- Ya --> B5[POST /chat/start-new-chat<br/>+ sendText Evolution]
        B4 -- Tidak --> B6[Tiket kosong<br/>(tanpa kirim WA)]
        B5 --> B7[Simpan pesan AGENT<br/>+ Socket new_message]
        B6 --> B8[Tiket terbuka,<br/>L1 kirim manual nanti]
    end
```

**Hierarki resolusi nama pelapor (V4.1):**
1. 🥇 **Hasil import Admin** (`is_imported_contact = true`) — tidak tertimpa apa pun
2. 🥈 **Edit manual via dashboard** (`is_custom_name = true`)
3. 🥉 **Kontak HP Evolution API** (`pushName`)
4. 🏅 **WhatsApp Push Name** (disimpan ke `wa_push_name` sebagai data pembanding)
5. 📱 **Nomor telepon** (fallback terakhir)

---

### 3.6 Alur Re-Open Tiket

```mermaid
flowchart TD
    A([Pelanggan Tanya Ulang / Kendala Kambuh]) --> B{Tiket Sebelumnya CLOSED?}
    B -- Ya --> C[L1 Buka Tab Selesai<br/>klik Aktifkan Kembali Tiket]
    B -- Tidak --> D[Lanjut di Tiket Aktif]
    C --> E[Input Alasan Opsional]
    E --> F[POST /api/chat/tickets/:id/reopen]
    F --> G[Update: status=OPEN, closed_at=null]
    G --> H[Catatan internal + Socket ticket_updated]
    H --> I([Chat Bisa Dibalas Lagi])
```

---

## 4. Spesifikasi Keamanan (Security Specification)

### 4.1 Autentikasi (JWT & Hashing)
- Password dihash dengan **`bcryptjs`**, salt rounds **10**. Tidak pernah disimpan plaintext.
- Token JWT (`jsonwebtoken`) berlaku **12 jam**.
- Payload: `{ id, name, role, category_id }` (tanpa data sensitif).
- Transmisi: HTTP Header `Authorization: Bearer <TOKEN>`.

### 4.2 Otorisasi (RBAC)
- Middleware `verifyToken` di seluruh rute `/api/chat`, `/api/reports`, `/api/admin`, `/api/hts`.
- Middleware `requireRole([...])` untuk proteksi berbasis peran (misal `/api/admin` hanya `ADMIN`).
- Matriks hak akses lengkap ada di `Project_Overview.md`.

### 4.3 Proteksi HTTP Headers (Helmet & CORS)
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "blob:", "*"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
```
- CORP `cross-origin` mengizinkan media `/uploads/` dimuat dari frontend di port/IP berbeda (LAN).
- CSP membatasi eksekusi skrip berbahaya (XSS).

### 4.4 Rate Limiting
- `express-rate-limit`: **1000 requests / 15 menit / IP**.
- Rute `/api/webhook` **dikecualikan** agar transmisi pesan WhatsApp tidak pernah terputus.

### 4.5 Validasi Unggahan Berkas (Multer)
1. Filter MIME: `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/webp` (tipe biner berbahaya ditolak).
2. Batas ukuran: **10 MB per file**.
3. Nama file acak berbasis `Date.now() + randomSuffix` — mencegah *path traversal* & collision timestamp.
4. Body parser JSON dibatasi **50 MB** agar payload webhook besar dari Evolution tidak error `PayloadTooLarge`.

### 4.6 Isolasi Database
Dua database terpisah dalam satu instance Postgres:
- **`wa_helpdesk`** — data aplikasi helpdesk (tiket, pesan, pengguna, pelanggan). Hanya diakses backend Node.js.
- **`evolution_db`** — session storage/cache Evolution API.

### 4.7 Integritas Data & Anti-Duplikasi
- **Deduplikasi pesan:** kolom `Message.wa_message_id` + time-window 60 detik untuk balasan agen.
- **Proteksi duplikat HTS:** penautan nomor HTS yang sama di 1 percakapan ditolak; nomor di tiket lain memicu konfirmasi force link.
- **FK `onDelete: Cascade`** pada `TicketCategory` & `Message` ke `Ticket` (anti-orphan record).
- **Index performa:** `Message` diindeks pada `(ticket_id)`, `(ticket_id, created_at)`, dan `(wa_message_id)`.
- **Race condition webhook:** `customer.upsert` atomik + fallback pembuatan tiket.

### 4.8 Batasan & Risiko yang Diketahui
| Risiko | Status |
|---|---|
| CSRF Token portal HTS invalidasi saat submit bersamaan | 🔴 **BELUM diperbaiki** — rekomendasi: mutex lock per userId (`async-mutex`) |
| Disk `/uploads/` tanpa retensi/cleanup cron | 🟡 Belum ada cron pembersihan berkas lama |
| Ekspor file kontak Google Contacts format `.vcf` dengan multi-`TEL` | ⚪ Parser menghasilkan baris per nomor (by design) |
