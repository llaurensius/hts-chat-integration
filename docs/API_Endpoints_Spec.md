# 📡 Spesifikasi API Endpoints (Kontrak REST & Webhook)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Base URL:** `http://localhost:3000/api` (atau `http://<IP_SERVER>:3000/api`)  
**Format:** JSON / Multipart Form-Data  
**Autentikasi:** Bearer Token JWT (Header `Authorization: Bearer <TOKEN>`)  
**Status:** Produksi / Workflow V3 (Lengkap dengan Integrasi HTS Diskomdigi)

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
*   **Response (200 OK):** Array objek user.

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

### C. Ubah Akun Pengguna (Edit User)
*   **Method / Endpoint:** `PUT /api/admin/users/:userId`
*   **Request Body:**
    ```json
    {
      "name": "Teknisi Senior",
      "email": "l2_network@helpdesk.go.id",
      "password": "newpassword123",
      "role": "L2",
      "category_id": 7
    }
    ```

### D. Hapus Akun Pengguna
*   **Method / Endpoint:** `DELETE /api/admin/users/:userId`

---

## 3. Modul Integrasi Portal HTS Diskomdigi (`/api/hts`)
*Modul komunikasi langsung ke server portal https://hts.diskomdigi.jatengprov.go.id.*

### A. Cek Status Koneksi Sesi HTS Petugas
*   **Method / Endpoint:** `GET /api/hts/status`
*   **Akses:** Terproteksi (`L1`, `ADMIN`, `SPV`)
*   **Response (200 OK - Terhubung):**
    ```json
    {
      "isLoggedIn": true,
      "email": "petugas@jatengprov.go.id",
      "lastLogin": "2026-09-30T10:15:00.000Z"
    }
    ```
*   **Response (200 OK - Belum Terhubung):**
    ```json
    { "isLoggedIn": false }
    ```

### B. Ambil CAPTCHA Live Stream & Token CSRF
*   **Method / Endpoint:** `GET /api/hts/captcha`
*   **Akses:** Terproteksi (`L1`, `ADMIN`)
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "captchaImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
      "csrfToken": "900df72eaf97c651be66f00e4e7214bf"
    }
    ```

### C. Login Petugas ke Portal HTS
*   **Method / Endpoint:** `POST /api/hts/login`
*   **Akses:** Terproteksi (`L1`, `ADMIN`)
*   **Request Body:**
    ```json
    {
      "email": "petugas@jatengprov.go.id",
      "password": "PasswordHTS123",
      "captcha_code": "48921"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "message": "Berhasil terhubung ke portal HTS Diskomdigi sebagai petugas@jatengprov.go.id",
      "email": "petugas@jatengprov.go.id"
    }
    ```

### D. Logout / Putus Koneksi Portal HTS
*   **Method / Endpoint:** `POST /api/hts/logout`
*   **Akses:** Terproteksi (`L1`, `ADMIN`)
*   **Response (200 OK):**
    ```json
    { "success": true, "message": "Sesi portal HTS berhasil diputuskan" }
    ```

### E. Ambil Master Data Dropdown Portal HTS
*   **Method / Endpoint:** `GET /api/hts/master-data`
*   **Akses:** Terproteksi (Semua Role)
*   **Response (200 OK):**
    ```json
    {
      "kategori": [{ "id": "troubleshoot", "name": "Troubleshoot" }, ...],
      "subKategori": [{ "id": "DISTRIBUTION NETWORK", "name": "DISTRIBUTION NETWORK", "team": "Network" }, ...],
      "indukOpd": [{ "id": "2", "name": "Badan Kepegawaian Daerah..." }, ...],
      "pics": [{ "id": "14", "name": "Helpdesk - Ori" }, { "id": "8", "name": "Achmad Julianto, S.Kom" }, ...]
    }
    ```

---

## 4. Modul Tiket & Percakapan (`/api/chat`)

### A. Mengambil Daftar Tiket Aktif
*   **Method / Endpoint:** `GET /api/chat/tickets`
*   **Filter Berdasarkan Peran:**
    - `L1`, `ADMIN`, `SPV`: Melihat seluruh tiket berstatus `OPEN` dan `RESOLVED`.
    - `L2`: Hanya melihat tiket `OPEN` dan `RESOLVED` yang ditugaskan ke divisinya.
*   **Response (200 OK):** Array objek tiket lengkap dengan relasi `customer`, `categories`, status HTS, dan pesan terakhir.

### B. Mengambil Riwayat Percakapan Tiket
*   **Method / Endpoint:** `GET /api/chat/tickets/:ticketId/messages`

### C. Mengirim Balasan Chat ke Pelapor WhatsApp
*   **Method / Endpoint:** `POST /api/chat/send`
*   **Request Body:** `{ "ticketId": 10, "text": "Halo, laporan sedang kami tangani." }`

### D. Mengirim Lampiran Media ke WhatsApp Pelapor
*   **Method / Endpoint:** `POST /api/chat/sendMedia`
*   **Content-Type:** `multipart/form-data` (`ticketId`, `caption`, `media` file)

### E. Penugasan Tim L2 (Multi-Assign) & Opsi Terbitkan Tiket HTS
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/assign`
*   **Content-Type:** `multipart/form-data` atau `application/json`
*   **Form / Body Data:**
    - `categoryIds`: `[7, 8]` (ID Tim L2 tujuan)
    - `serviceType`: `TROUBLESHOOTING` | `REQUEST_LAYANAN` | `MONITORING`
    - *(Opsi Sinkronisasi HTS Otomatis):*
      - `syncHts`: `"true"`
      - `hts_cust`, `hts_opd`, `induk_opd_id`, `hts_tgltshoot`, `hts_jam_problem`, `hts_kategori`, `hts_sub_kategori`, `hts_detil` (min 10 karakter), `hts_pic_ids`, `attachment`

### F. Sinkronisasi Tiket Mandiri ke Portal HTS (Kirim ke Portal HTS)
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/sync-hts`
*   **Content-Type:** `multipart/form-data`
*   **Form Data:**
    - `hts_cust`: Nama pelapor (Dinas/Perorangan)
    - `hts_opd`: Nama instansi/SKPD pelapor
    - `induk_opd_id`: ID OPD Induk HTS (Opsional)
    - `hts_tgltshoot`: Tanggal kejadian (`YYYY-MM-DD`)
    - `hts_jam_problem`: Jam kejadian (`HH:mm`)
    - `hts_kategori`: `troubleshoot` / `request` / `monitoring`
    - `hts_sub_kategori`: Sub-kategori (Wajib jika kategori `troubleshoot`)
    - `hts_detil`: Detil permasalahan (**Wajib minimal 10 karakter**)
    - `hts_pic_id`: ID PIC utama penerima
    - `hts_pic_ids`: Array/multiple ID PIC terpilih
    - `attachment`: File bukti awal (Opsional: `.jpg`, `.jpeg`, `.png`, `.pdf`)
    - `useChatImage`: `"true"` jika ingin melampirkan gambar percakapan terakhir
*   **Response (200 OK):**
    ```json
    {
      "success": true,
      "message": "Tiket berhasil disinkronkan ke HTS: #2025-TShoot-2026-jateng-09",
      "ticket": { ... }
    }
    ```

### G. Tandai Selesai Penanganan Per-Tim (L2)
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/resolve`
*   **Akses:** `L2`, `ADMIN`
*   **Request Body:**
    ```json
    {
      "solution": "Kabel FO putus di tiang KM 14 sudah disambung menggunakan splicer. Redaman normal -18dBm."
    }
    ```
*   **Keterangan:** Teks solusi disimpan di `TicketCategory.solution`. Tiket utama menjadi `RESOLVED` jika semua tim selesai.

### H. Kembalikan / Lepas Penugasan Tim (L2)
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/return`
*   **Request Body:** `{ "reason": "Bukan kendala tim Server" }`

### I. Menutup Tiket Resmi & Dual-Close ke Portal HTS (L1)
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/close`
*   **Akses:** `L1`, `ADMIN`
*   **Content-Type:** `multipart/form-data`
*   **Form Data:**
    - `summary`: Kesimpulan akhir penanganan kendala (**Wajib min 10 karakter**)
    - `categoryIds`: Array ID tim final
    - `closeHtsTicket`: `"true"` jika ingin menyelesaikan tiket di HTS sekaligus
    - `htsSolution`: Teks respon teknis untuk HTS (default: menggunakan `summary`)
    - `htsPicId`: ID PIC penanganan
    - `htsPicIds`: Multi PIC penanganan (otomatis di-merge dengan PIC Penerima awal)
    - `htsTglTeknis`: Tanggal selesai (`YYYY-MM-DD`)
    - `htsJamTeknis`: Jam selesai (`HH:mm`)
    - `attachment`: File bukti selesai/foto tindakan (Opsional: `.jpg`, `.jpeg`, `.png`, `.pdf`)
    - `useChatImage`: `"true"` (opsional jika ambil dari chat)
*   **Prinsip Keamanan Integritas:** Jika penutupan tiket di portal HTS gagal (misal file tidak valid atau server HTS error), status tiket lokal **batal ditutup** dan percakapan tetap terbuka agar dapat diperiksa kembali.

### J. Selesaikan Tiket HTS yang Berstatus PENDING (Tombol Panel Resume)
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/sync-solve-hts`
*   **Akses:** `L1`, `ADMIN`
*   **Request Body:**
    ```json
    {
      "solution": "Permasalahan telah selesai ditangani secara teknis.",
      "picId": "14",
      "picIds": ["14", "8"]
    }
    ```
*   **Keterangan:** Menyelesaikan tiket di portal HTS yang sebelumnya masih `PENDING` tanpa mengubah status percakapan chat lokal jika sudah closed.

### K. Menulis Catatan Internal (L2 & L1)
*   **Method / Endpoint:** `POST /api/chat/tickets/:ticketId/internal-note`
*   **Request Body:** `{ "text": "Catatan khusus tim..." }`

### L. Mengambil Daftar Kategori / Tim
*   **Method / Endpoint:** `GET /api/chat/categories`

### M. Memperbarui Identitas Pelapor (Nama & Instansi/SKPD)
*   **Method / Endpoint:** `PUT /api/chat/customers/:customerId`
*   **Request Body:** `{ "name": "Nama Baru", "skpd_name": "Dinas Kesehatan" }`

---

## 5. Modul Laporan & Rekapitulasi (`/api/reports`)

### Mengambil Rekap Laporan Aduan
*   **Method / Endpoint:** `GET /api/reports/tickets`
*   **Query Parameters (Opsional):** `status`, `startDate`, `endDate`, `categoryId`
*   **Hapus Rekap Aduan (Admin Only):** `DELETE /api/reports/tickets`
    - Body hapus terpilih: `{ "ids": [10, 11] }`
    - Body reset total & reset sequence ke 1: `{ "all": true }`

---

## 6. Webhook WhatsApp Inbound (`/api/webhook/whatsapp`)
*   **Method / Endpoint:** `POST /api/webhook/whatsapp`
*   **Event:** `messages.upsert`
*   **Alur:**
    1. Parse payload Evolution API v2.
    2. Cek/buat kontak `Customer`.
    3. Cek tiket aktif (`OPEN`/`RESOLVED`). Jika belum ada, buat tiket baru dan tembakkan template **Auto-Reply Bot**.
    4. Simpan media/teks dan broadcast via Socket.io `new_message`.
*   **Response:** `200 OK` `{ "status": "success" }`.

---

## 7. Event Real-time WebSocket (Socket.io)

| Nama Event | Arah | Payload Utama | Keterangan |
|---|---|---|---|
| `new_message` | Server ➡️ Client | `{ ticketId, senderType, text, attachmentUrl, isInternal, createdAt }` | Ditembakkan saat ada chat masuk, chat keluar, atau catatan sistem/HTS. |
| `ticket_closed`| Server ➡️ Client | `{ ticketId, summary, categorys }` | Ditembakkan saat tiket di-assign, di-resolve, disinkronkan ke HTS, atau ditutup. |
