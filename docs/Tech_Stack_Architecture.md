# 🏗️ Arsitektur Teknologi & Tech Stack
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Versi:** 2.0 (Workflow V2 Produksi)

Dokumen ini mendefinisikan tumpukan teknologi (*Tech Stack*), pustaka dependensi, dan topologi arsitektur sistem yang digunakan dalam implementasi nyata.

---

## 1. Komponen Teknologi Utama

| Layer Arsitektur | Teknologi yang Digunakan | Versi | Peran & Alasan Pemilihan |
|---|---|:---:|---|
| **WhatsApp Gateway** | **Evolution API v2** | `v2.3.7` | Berjalan di Docker container (`evoapicloud/evolution-api:latest`). Mengelola koneksi protokol WhatsApp (Baileys), autentikasi QR, Webhook event `messages.upsert`, dan API kirim teks/media tanpa biaya langganan cloud. |
| **Realtime Gateway** | **Socket.io** | `v4.8+` | Mengalirkan data pesan masuk, perubahan status tiket, dan notifikasi seketika (*bi-directional WebSocket*) antara backend dan frontend. |
| **Backend Core** | **Node.js + Express.js** | `v18+` | REST API engine, controller webhook, manajemen sesi JWT, dan integrasi WhatsApp blast. |
| **Database & ORM** | **PostgreSQL 15 + Prisma ORM** | `v5.22` | Menyimpan seluruh data relasional (pelanggan, tiket, kategori, multi-assign, pesan, dan pengguna). Prisma menjamin *type safety* dan migrasi skema yang konsisten. |
| **Frontend Framework** | **React.js + Vite** | `v18+` | Single Page Application (SPA) dengan performa kompilasi instan. Dilengkapi **React Router DOM** untuk navigasi halaman dan pemisahan antarmuka dinamis berbasis peran (RBAC). |
| **UI Styling & Icons** | **Tailwind CSS + Lucide React** | `v3+` | Antarmuka modern, responsif, dan ringan dengan ikon visual intuitif. |
| **Session Cache** | **Redis (Alpine)** | Latest | Penyimpanan cache sesi untuk Evolution API di Docker container. |

---

## 2. Pustaka & Dependensi Teknis Terpasang

### Backend (`backend/package.json`):
- **`@prisma/client` & `prisma`**: Object-Relational Mapping (ORM) PostgreSQL.
- **`jsonwebtoken` (JWT)**: Autentikasi sesi berbasis token aman (masa berlaku 12 jam).
- **`bcryptjs`**: Hashing kata sandi satu arah dengan salt rounds = 10.
- **`socket.io`**: Komunikasi WebSocket real-time.
- **`axios`**: Klien HTTP untuk komunikasi antar-layanan ke Evolution API.
- **`multer`**: Penanganan upload file media gambar ke direktori statis `/uploads/`.
- **`helmet`**: Pengamanan HTTP header, CSP (*Content Security Policy*), dan CORP (*Cross-Origin Resource Policy*).
- **`express-rate-limit`**: Mitigasi serangan DoS dan brute-force pada endpoint API.
- **`cors` & `dotenv`**: Manajemen CORS dan variabel lingkungan.

### Frontend (`frontend/package.json`):
- **`react` & `react-dom`**: Core library antarmuka.
- **`react-router-dom`**: Manajemen routing browser (`/login` dan `/`).
- **`socket.io-client`**: Klien listener event WebSocket dari server.
- **`axios`**: Klien HTTP dengan global interceptor untuk Authorization Bearer Token.
- **`lucide-react`**: Paket ikon grafis modern.
- **`date-fns`**: Manipulasi dan pemformatan tanggal/waktu riwayat aduan.

---

## 3. Diagram Topologi Komunikasi Sistem

```mermaid
flowchart TD
    subgraph Pengguna Luar
        PIC([Pelanggan / PIC WhatsApp])
    end

    subgraph Infrastruktur Docker Container
        EVO[Evolution API Gateway\n:8080]
        REDIS[(Redis Cache\n:6379)]
        PG_EVO[(Database evolution_db)]
        PG_HTS[(Database wa_helpdesk\n:5432)]
        
        EVO --- REDIS
        EVO --- PG_EVO
    end

    subgraph Host Server Lokal / LAN
        BE[Backend Express.js + Socket.io\n:3000]
        UPLOADS[(Folder Statis\n/uploads/)]
        FE[Frontend React.js + Vite\n:5173 - Host 0.0.0.0]
        
        BE --- PG_HTS
        BE --- UPLOADS
        BE <-->|WebSocket & REST API| FE
    end

    subgraph Perangkat Tim Helpdesk (Akses LAN)
        L1_UI[Perangkat Dispatcher L1]
        L2_UI[Perangkat Teknisi L2]
        ADM_UI[Perangkat Administrator]
        
        FE --- L1_UI
        FE --- L2_UI
        FE --- ADM_UI
    end

    PIC <-->|Protokol WhatsApp| EVO
    EVO -->|Webhook Inbound\nPOST /api/webhook/whatsapp| BE
    BE -->|REST API Outbound\nPOST /message/sendText & sendMedia| EVO
```
