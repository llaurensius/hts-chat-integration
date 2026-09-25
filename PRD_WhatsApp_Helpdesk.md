# Product Requirements Document (PRD)
**Proyek:** Integrasi WhatsApp ke Web Helpdesk
**Target Rilis:** 7 Oktober (Durasi: 2 Minggu)
**Status:** Draft / Review

---

## 1. Executive Summary & Goals
Sistem Helpdesk saat ini membutuhkan peningkatan efisiensi dalam menangani aduan dari pengguna. Proyek ini bertujuan untuk membangun integrasi *seamless* antara WhatsApp (sebagai kanal pelaporan dari *user*) dengan Dashboard Web (sebagai kanal manajemen tiket bagi Agen L1/L2). 
Sistem ini dirancang untuk memangkas waktu respons, memfasilitasi kolaborasi lintas divisi (*many-to-one chat*), serta menghasilkan laporan siap pakai untuk bahan paparan manajemen.

## 2. User Personas
1. **Pelapor (User WA):** Klien/SKPD yang mengirimkan keluhan teknis melalui WhatsApp.
2. **Agen L1 (Dispatcher/Helpdesk):** Menerima aduan awal dan memastikan *routing* tiket tepat sasaran.
3. **Agen L2 (Divisi Teknis - Server/Network/dll):** Menerima notifikasi *blast*, menangani tiket, berinteraksi dengan pelapor, dan menyelesaikan masalah.
4. **Supervisor / Manajemen:** Memonitor operasional tiket, membaca rekap aduan, dan mengevaluasi laporan paparan.

---

## 3. Core Features & Acceptance Criteria (AC)

### F1. Auto-Reply & Inbound Routing
*   **User Story:** Sebagai pelapor, saya ingin mendapat kepastian bahwa pesan saya diterima oleh sistem.
*   **Acceptance Criteria (AC):**
    *   Sistem membalas otomatis maksimal 5 detik setelah pesan pertama masuk dengan teks: *"Baik untuk aduan akan kami cek dahulu mohon ditunggu"*.
    *   Sistem mendeteksi identitas pengirim (Nomor WA).

### F2. Manajemen Tiket (Create, Forward, Re-escalate)
*   **User Story:** Sebagai Agen, saya ingin bisa membuat tiket baru dari *chat*, atau menyambungkannya ke masalah lama.
*   **AC:**
    *   Terdapat opsi **"Membuat tiket baru"** (untuk *issue* baru) atau **"Meneruskan (Forward) tiket baru"**.
    *   Terdapat opsi **"Re-escalate to ticket"** untuk memanggil tiket lama jika pengguna menanyakan *follow-up* masalah yang belum selesai (menggabungkan *history chat*).

### F3. Penanganan Multi-Kendala (Split/Multi-Tagging)
*   **User Story:** Sebagai pelapor yang mewakili instansi, saya sering melaporkan 2 kendala sekaligus (misal: Server mati & Jaringan putus) dalam 1 pesan chat.
*   **AC:**
    *   Sistem/Agen L1 dapat men-tag lebih dari 1 divisi (misal `Network` dan `Server`) dalam 1 tiket yang sama.
    *   Jika perlu, sistem bisa memecah (*split*) 1 *chat* menjadi 2 *child tickets* yang di-assign ke divisi masing-masing tanpa harus meminta *user* mengirim ulang pesan.

### F4. Blast Broadcast Notification
*   **User Story:** Sebagai Agen L2, saya ingin segera tahu jika ada tiket masuk ke divisi saya.
*   **AC:**
    *   Sistem secara otomatis mengirim *blast broadcast* / notifikasi ke grup agen spesifik (Server / Network / All).
    *   Notifikasi berisi *summary* singkat dan **URL/Link Eskalasi** yang jika diklik akan langsung membuka *room chat* tiket tersebut di Web.

### F5. Many-to-One Live Chat & Attachment
*   **User Story:** Sebagai Agen L2 dari berbagai divisi, kami butuh berkolaborasi membalas 1 *user* secara bersamaan.
*   **AC:**
    *   Web interface menyediakan *live chat* di mana multiple Agen L2 dapat membalas ke 1 pelapor (Many-to-One).
    *   Tersedia fitur *Upload Image* dan *Upload Document* di dalam kolom *live chat* Web.

### F6. Jeda Rule (Pause Bot)
*   **User Story:** Sebagai Agen, saya tidak ingin Bot ikut membalas saat saya sedang aktif melakukan *troubleshooting* via *chat*.
*   **AC:**
    *   Ada tombol/aturan "Jeda Bot".
    *   Ketika *chat* sudah diklaim Agen atau berada di luar jam operasional tertentu, *auto-reply* bot akan dihentikan.

### F7. Kesimpulan & Penutupan (Mandatory Summary)
*   **User Story:** Sebagai Supervisor, saya ingin tahu ringkasan solusi dari setiap tiket tanpa harus membaca seluruh *history chat*.
*   **AC:**
    *   Tombol "Close Ticket" tidak bisa diklik jika form **Kesimpulan / Summary** belum diisi.
    *   Summary akan menjadi data utama di laporan akhir.

---

## 4. SLA Management (Service Level Agreement)
> **STATUS: DITUNDA (NEXT IMPLEMENTATION / FASE 2)**
> 
> *Catatan: Fitur perhitungan metrik SLA otomatis, pencatatan timer KPI Data Center, dan konsep perpindahan SLA Ownership saat agen L2 mengklik "Ambil" secara resmi dikeluarkan dari scope rilis awal ini. Fokus rilis tahap pertama murni ditujukan pada fungsionalitas penerimaan pesan, kolaborasi agen, dan penutupan tiket.*

---

## 5. Reporting & Analytics

### R1. Rekap Hasil Akhir Aduan
*   Tabel *exportable* (Excel/CSV/PDF) yang berisi: ID Tiket, Tanggal Dibuat, Waktu Selesai, SKPD/Pelapor, Jenis Kendala, Divisi (L2), dan **Kesimpulan (Summary)**.

### R2. Laporan Bahan Paparan (Presentation Prep)
*   Sistem mampu men-generate rekap khusus yang membandingkan periode sebelumnya dan saat ini.
*   Data wajib: "Apa saja masalah pada paparan sebelumnya" disandingkan dengan "Tindak lanjut (Follow-up) apa yang telah dilakukan".
*   *Output* harus mudah di-*copy-paste* ke dalam presentasi manajemen.

---

## 6. Technical Considerations (Aspek Teknis)
*   **Integrasi WhatsApp:** Menggunakan *WhatsApp Business API* / API pihak ketiga berbasis Webhook (pengiriman dan penerimaan pesan seketika).
*   **Real-time Communication:** Kolom *live chat* di Web menggunakan *WebSockets* (contoh: Socket.io) agar *chat* dari *user* dan agen L2 lain muncul tanpa perlu me-*refresh* halaman.
*   **Storage:** Menggunakan *bucket storage* lokal/cloud (misal AWS S3/MinIO) untuk menyimpan lampiran *image & document* secara aman.
*   **Backend & Frontend:** (Disesuaikan dengan *tech stack* yang dikuasai tim *developer*, misal Node.js/PHP Laravel + React/Vue).
