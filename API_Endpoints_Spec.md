# Spesifikasi API Endpoints
**Proyek:** Integrasi WhatsApp ke Web Helpdesk

Dokumen ini mendefinisikan *endpoint* utama yang dibutuhkan *Backend* untuk menghubungkan *Frontend* (Web Dashboard) dan Provider WhatsApp API.

---

## 1. Webhook (WhatsApp ke Sistem)

### `POST /api/webhook/whatsapp`
Digunakan untuk menerima notifikasi pesan masuk dari server WhatsApp API secara real-time.
*   **Request Payload (Contoh dari Provider WA):**
    ```json
    {
      "from": "6281234567890",
      "name": "Budi - SKPD A",
      "message": "Server aplikasi keuangan mati.",
      "type": "text",
      "timestamp": 1695640000
    }
    ```
*   **Action Backend:** 
    1. Cek nomor WA di Database, *create/update* data kontak.
    2. Cek apakah ada tiket berstatus OPEN untuk kontak ini. Jika ada, masukkan sebagai pesan baru.
    3. Jika tidak ada, buat tiket baru dan *trigger* **Auto-Reply Bot**.
    4. *Push* event WebSocket ke *Frontend* agar chat muncul di layar agen tanpa *refresh*.

---

## 2. Manajemen Tiket (Web ke Sistem)

### `GET /api/tickets`
Mengambil daftar tiket aktif berdasarkan filter (digunakan di Panel Kiri Web).
*   **Query Params:** `?status=OPEN&division_id=2`
*   **Response:** Daftar (Array) dari data tiket.

### `POST /api/tickets`
Membuat tiket baru secara manual (jika diperlukan) atau *Forward* tiket.
*   **Payload:** `{ "customer_id": 12, "division_ids": [1, 2] }`

### `PUT /api/tickets/:id/divisions`
Fungsi **Multi-kendala (F3)**: Menambahkan atau merubah *tag* divisi pada satu tiket.
*   **Payload:** `{ "division_ids": [1, 3] }`  *(Misal: Server & Network)*
*   **Action Backend:** Meng-update tabel `ticket_divisions` dan melakukan *Blast Broadcast* ke divisi terkait.

### `POST /api/tickets/:id/close`
Menutup tiket. Memenuhi aturan **F7 (Mandatory Summary)**.
*   **Payload:**
    ```json
    {
      "summary": "Kabel FO putus di area X, sudah disambung kembali oleh tim."
    }
    ```
*   **Response:** `200 OK` (Status tiket berubah menjadi CLOSED, waktu penutupan tercatat).

---

## 3. Pesan / Live Chat (Web ke Sistem ke WA)

### `GET /api/tickets/:id/messages`
Mengambil histori *chat* untuk suatu tiket (digunakan di Panel Tengah Web saat agen mengklik sebuah tiket).

### `POST /api/tickets/:id/messages`
Agen mengirim balasan *chat* melalui Web ke WA pelapor (F5 Many-to-One).
*   **Payload:**
    ```json
    {
      "sender_id": 5,
      "message_text": "Baik Pak, tim network sedang meluncur ke lokasi.",
      "attachment_url": null
    }
    ```
*   **Action Backend:**
    1. Simpan pesan ke database tabel `messages`.
    2. *Hit* API Provider WhatsApp untuk mem-forward teks tersebut ke nomor WA pelapor.

### `POST /api/media/upload`
Mengunggah gambar/dokumen (F5).
*   **Payload:** `multipart/form-data` (File Image/PDF).
*   **Response:** `{ "url": "https://storage.domain.com/files/img123.jpg" }`

---

## 4. Kontrol Bot

### `PUT /api/tickets/:id/bot-status`
Aturan **Jeda Rule Bot (F6)**. Digunakan untuk menghidupkan/mematikan balasan *auto-reply* bot pada tiket tertentu agar tidak bentrok dengan balasan agen.
*   **Payload:** `{ "is_bot_paused": true }`

---

## 5. Reporting

### `GET /api/reports/recap`
Mengambil rekap hasil akhir aduan (*export*).
*   **Query Params:** `?start_date=2023-09-01&end_date=2023-09-30`

### `GET /api/reports/presentation`
Mengambil data komparasi untuk paparan manajemen (Masalah Sebelumnya vs Follow-up saat ini).

