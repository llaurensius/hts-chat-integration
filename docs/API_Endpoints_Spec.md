# 📡 Spesifikasi API Endpoints (Kontrak REST & Webhook)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Base URL:** `http://localhost:3000/api` (atau `http://192.168.10.100:3000/api`)  
**Format:** JSON / Multipart Form-Data  
**Autentikasi:** Bearer Token JWT (Header `Authorization: Bearer <TOKEN>`)

---

## 1. Modul Autentikasi (`/api/auth`)

### A. Login Pengguna
*   **Method / Endpoint:** `POST /api/auth/login`
*   **Akses:** Publik
*   **Request Body:**
    ```json
    {
      "email": "l1@helpdesk.go.id",
      "password": "password123"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": 2,
        "name": "Dispatcher L1",
        "email": "l1@helpdesk.go.id",
        "role": "L1",
        "category": null
      }
    }
    ```

### B. Cek Sesi Pengguna Login
*   **Method / Endpoint:** `GET /api/auth/me`
*   **Akses:** Terproteksi (Semua Role)
*   **Response (200 OK):**
    ```json
    {
      "id": 4,
      "name": "Teknisi Network L2",
      "email": "l2_network@helpdesk.go.id",
      "role": "L2",
      "category": "Network"
    }
    ```

---

## 2. Modul Manajemen Pengguna (`/api/admin`)
*Hanya dapat diakses oleh peran `ADMIN`.*

### A. Ambil Daftar Semua Pengguna
*   **Method / Endpoint:** `GET /api/admin/users`
*   **Response (200 OK):**
    ```json
    [
      {
        "id": 1,
        "name": "Administrator",
        "email": "admin@helpdesk.go.id",
        "role": "ADMIN",
        "category": null
      }
    ]
    ```

### B. Tambah Akun Pengguna Baru
*   **Method / Endpoint:** `POST /api/admin/users`
*   **Request Body:**
    ```json
    {
      "name": "Teknisi Baru",
      "email": "teknisi_baru@helpdesk.go.id",
      "password": "password123",
      "role": "L2",
      "category_id": 7
    }
    ```

### C. Hapus Akun Pengguna
*   **Method / Endpoint:** `DELETE /api/admin/users/:userId`
*   **Response (200 OK):**
    ```json
    {
      "message": "Pengguna berhasil dihapus"
    }
    ```

---

## 3. Modul Live Chat & Penanganan Tiket (`/api/chat`)

### A. Mengambil Daftar Antrean Tiket Aktif
Mengembalikan tiket berstatus `OPEN` dan `RESOLVED`.
*   **Method / Endpoint:** `GET /api/chat/tickets`
*   **Aturan RBAC:**
    *   Jika peran `L2`: Backend otomatis memfilter hanya tiket yang ditugaskan ke `category_id` milik teknisi tersebut.
    *   Jika peran `L1` / `ADMIN` / `SPV`: Mengembalikan seluruh tiket aktif.
*   **Response (200 OK):**
    ```json
    [
      {
        "id": 10,
        "customer_id": 1,
        "status": "OPEN",
        "service_type": "TROUBLESHOOTING",
        "created_at": "2026-09-28T15:41:26.869Z",
        "customer": {
          "id": 1,
          "name": "Laurensius Liquori",
          "wa_number": "628992572654"
        },
        "categories": [
          {
            "ticket_id": 10,
            "category_id": 7,
            "is_resolved": false,
            "resolved_at": null,
            "category": { "id": 7, "name": "Network" }
          },
          {
            "ticket_id": 10,
            "category_id": 8,
            "is_resolved": true,
            "resolved_at": "2026-09-28T15:52:21.000Z",
            "category": { "id": 8, "name": "Server" }
          }
        ],
        "messages": [
          {
            "id": 25,
            "message_text": "Mohon dicek jaringan dan web server",
            "attachment_url": null,
            "created_at": "2026-09-28T15:42:00.000Z"
          }
        ]
      }
    ]
    ```

### B. Mengambil Riwayat Pesan Tiket
*   **Method / Endpoint:** `GET /api/chat/tickets/:ticketId/messages`
*   **Response (200 OK):**
    ```json
    [
      {
        "id": 1,
        "ticket_id": 10,
        "sender_type": "CUSTOMER",
        "message_text": "Halo, jaringan mati.",
        "attachment_url": null,
        "is_internal": false,
        "created_at": "2026-09-28T15:41:26.869Z"
      },
      {
        "id": 2,
        "ticket_id": 10,
        "sender_type": "AGENT",
        "message_text": "[SISTEM] Tim Network telah menandai kendala di bagiannya selesai.",
        "attachment_url": null,
        "is_internal": true,
        "created_at": "2026-09-28T15:45:10.000Z"
      }
    ]
    ```

### C. Mengirim Balasan Chat ke WhatsApp Pelapor (L1)
*   **Method / Endpoint:** `POST /api/chat/send`
*   **Akses:** `L1`, `ADMIN`, `SPV`
*   **Request Body:**
    ```json
    {
      "ticketId": 10,
      "text": "Selamat siang, kendala sudah kami koordinasikan dengan tim terkait."
    }
    ```

### D. Mengirim Lampiran Gambar ke WhatsApp Pelapor (L1)
*   **Method / Endpoint:** `POST /api/chat/sendMedia`
*   **Content-Type:** `multipart/form-data`
*   **Form Data:**
    - `ticketId`: `10`
    - `caption`: "Berikut tangkapan layar status jaringan" (Opsional)
    - `media`: (File gambar .jpg / .png maksimal 10MB)

### E. Multi-Assign Tiket ke Tim L2 & WhatsApp Blast
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/assign`
*   **Akses:** `L1`, `ADMIN`
*   **Request Body:**
    ```json
    {
      "categoryIds": [7, 8],
      "serviceType": "TROUBLESHOOTING"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "message": "Tiket berhasil di-assign ke Tim: Network, Server"
    }
    ```

### F. Tandai Selesai Penanganan Per-Tim (L2)
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/resolve`
*   **Akses:** `L2`, `ADMIN`
*   **Keterangan:** Jika masih ada tim lain yang belum selesai, status tiket utama tetap `OPEN`. Jika seluruh tim sudah selesai, status tiket utama otomatis menjadi `RESOLVED`.
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "isFullyResolved": true,
      "message": "[SISTEM] Tim Server telah menandai kendala di bagiannya selesai. Seluruh tim telah selesai menangani. Tiket berstatus RESOLVED."
    }
    ```

### G. Kembalikan / Lepas Penugasan Tim (L2)
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/return`
*   **Akses:** `L2`, `ADMIN`
*   **Request Body:**
    ```json
    {
      "reason": "Tidak ada kendala pada tim Server, murni kendala switch network."
    }
    ```

### H. Menutup Tiket Secara Resmi (L1)
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/close`
*   **Akses:** `L1`, `ADMIN`
*   **Request Body:**
    ```json
    {
      "summary": "Router core telah diganti dan jalur optik kembali normal. Selesai.",
      "categoryIds": [7]
    }
    ```

### I. Menulis Catatan Internal (L2 & L1)
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/internal-note`
*   **Request Body:**
    ```json
    {
      "ticketId": 10,
      "text": "Sedang koordinasi dengan pihak provider FO di lapangan."
    }
    ```

### J. Mengambil Daftar Kategori / Tim
*   **Method / Endpoint:** `GET /api/chat/categories`
*   **Response (200 OK):**
    ```json
    [
      { "id": 7, "name": "Network", "wa_target_number": "628000000001" },
      { "id": 8, "name": "Server", "wa_target_number": "628000000002" },
      { "id": 9, "name": "Mechanical & Electrical (M&E)", "wa_target_number": "628000000003" }
    ]
    ```

---

## 4. Modul Laporan & Rekapitulasi (`/api/reports`)

### Mengambil Rekap Laporan Aduan
*   **Method / Endpoint:** `GET /api/reports/tickets`
*   **Query Parameters (Opsional):**
    - `status`: `OPEN` / `RESOLVED` / `CLOSED`
    - `startDate`: `2026-09-01`
    - `endDate`: `2026-09-30`
    - `categoryId`: `7`
*   **Response (200 OK):**
    ```json
    [
      {
        "id": 10,
        "customerName": "Laurensius Liquori",
        "waNumber": "628992572654",
        "status": "CLOSED",
        "serviceType": "Troubleshooting",
        "createdAt": "2026-09-28T15:41:26.869Z",
        "closedAt": "2026-09-28T16:15:00.000Z",
        "duration": "33 Menit",
        "summary": "Router core telah diganti dan jalur optik normal.",
        "categories": "Network"
      }
    ]
    ```

---

## 5. Webhook Inbound WhatsApp (`/api/webhook`)

### Menerima Event Pesan Masuk dari Evolution API
*   **Method / Endpoint:** `POST /api/webhook/whatsapp`
*   **Event:** `messages.upsert`
*   **Alur:**
    1. Cek atau buat kontak `Customer`.
    2. Cek apakah ada tiket aktif berstatus `OPEN` atau `RESOLVED`.
    3. Jika tidak ada, buat tiket baru dan kirim **Auto-Reply Bot**.
    4. Jika pesan berupa media gambar, simpan otomatis ke `/uploads/` dan catat URL lampirannya.
    5. Broadcast pesan ke Web Dashboard via Socket.io `new_message`.
*   **Response:** Selalu `200 OK` `{ "status": "success" }`.

---

## 6. Event Real-time WebSocket (Socket.io)

| Nama Event | Arah | Payload Utama | Keterangan |
|---|---|---|---|
| `new_message` | Server ➡️ Client | `{ ticketId, senderType, text, attachmentUrl, isInternal, createdAt }` | Ditembak saat ada pesan baru dari WhatsApp atau catatan internal agen. |
| `ticket_closed` | Server ➡️ Client | `{ ticketId }` | Ditembak saat status tiket berubah (di-assign, resolved, atau closed) untuk memicu refresh antrean. |

---

## 7. Modul Pengaturan & Kontak Tim L2 (`/api/settings` & `/api/admin`)

### A. Pengaturan Auto-Reply Bot (Khusus L1)
*   **Method / Endpoint:** `GET /api/settings/autoreply`
*   **Akses:** `L1`, `ADMIN`, `SPV`
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "data": {
        "key": "auto_reply",
        "value": "Halo! Terima kasih telah menghubungi Helpdesk...",
        "is_active": true
      }
    }
    ```
*   **Method / Endpoint:** `PUT /api/settings/autoreply`
*   **Akses:** `L1` (Role lain: 403 Forbidden)
*   **Request Body:**
    ```json
    {
      "value": "Template pesan baru...",
      "is_active": true
    }
    ```

### B. Hapus Rekap Hasil Aduan (Khusus ADMIN)
*   **Method / Endpoint:** `DELETE /api/reports/tickets`
*   **Akses:** `ADMIN` (Role lain: 403 Forbidden)
*   **Request Body (Hapus Terpilih):**
    ```json
    { "ids": [10, 11, 12] }
    ```
*   **Request Body (Hapus Semua Data Testing):**
    ```json
    { "all": true }
    ```

### C. Manajemen Multi-Kontak WhatsApp Blast Tim L2 (Khusus ADMIN)
*   **Ambil Daftar Kategori & Kontak:** `GET /api/admin/categories/contacts`
    - Akses: `ADMIN`
*   **Tambah Kontak Tim:** `POST /api/admin/categories/:categoryId/contacts`
    - Akses: `ADMIN`
    - Body: `{ "name": "Teknisi 2", "wa_target": "081234567890" }` (otomatis disanitasi ke `628xxx` atau `@g.us`)
*   **Perbarui Kontak Tim (Edit):** `PUT /api/admin/categories/contacts/:contactId`
    - Akses: `ADMIN`
    - Body: `{ "name": "Teknisi 2 (Updated)", "wa_target": "628999888777" }`
*   **Hapus Kontak Tim:** `DELETE /api/admin/categories/contacts/:contactId`
    - Akses: `ADMIN`

