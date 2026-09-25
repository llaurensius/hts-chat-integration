# Arsitektur Teknologi & Tech Stack
**Proyek:** Integrasi WhatsApp ke Web Helpdesk

Dokumen ini mendefinisikan tumpukan teknologi (*Tech Stack*) yang direkomendasikan untuk mengejar target 2 minggu, dengan prioritas pada kestabilan *real-time chat* dan kemudahan perbaikan *bug* (komunitas besar).

---

## 1. Komponen Teknologi

### A. WhatsApp Gateway (Layer Komunikasi)
*   **Teknologi:** **Evolution API** (Self-hosted)
*   **Alasan:** Solusi *open-source* terbaik saat ini. Menjalankan Evolution API via **Docker** di server Anda sendiri menjamin 100% privasi data instansi, tanpa perlu repot mengurus kerumitan *Baileys* secara manual. Sistem ini menyediakan REST API dan Webhook yang stabil.

### B. Backend & API Server (Layer Logika)
*   **Teknologi:** **Node.js** dengan *framework* **Express.js**
*   **Real-time Engine:** **Socket.io**
*   **Alasan:** Aplikasi *live chat* wajib berjalan secara *real-time* (*asynchronous*). Node.js dibangun khusus untuk menangani ribuan koneksi Socket secara bersamaan tanpa membebani memori. Jika ada *bug*, komunitas Node.js adalah salah satu yang terbesar di dunia.

### C. Frontend / Web Dashboard (Layer Antarmuka)
*   **Teknologi:** **React.js** (dibangun menggunakan **Vite** agar sangat cepat)
*   **Styling:** **Tailwind CSS**
*   **Alasan:** React.js memiliki ekosistem *UI component* terbesar. Membuat *layout* 3-panel untuk ruang *chat* akan sangat cepat karena banyak *template* dan *library* pendukung yang tinggal dipakai (*plug & play*).

### D. Database & Storage (Layer Data)
*   **Database:** **PostgreSQL** (atau MySQL)
*   **Storage Media:** **Lokal Folder Server** atau **MinIO** (menyimpan unggahan gambar & dokumen).
*   **Alasan:** Struktur ERD kita (*multi-tagging* divisi, relasi tiket) adalah murni relasional. PostgreSQL sangat tangguh menangani data tekstual (riwayat pesan) dalam jumlah besar.

### E. Infrastruktur (Layer Server)
*   **OS:** Ubuntu Server LTS
*   **Platform:** VPS (Virtual Private Server) di Data Center Instansi.
*   **Engine:** **Docker & Docker Compose** (Sangat disarankan agar Evolution API, Node.js, dan Database berjalan di *container* masing-masing, sehingga jika ada *error* tidak saling menjatuhkan).

---

## 2. Diagram Arsitektur Komunikasi (Topologi)

```mermaid
flowchart LR
    User([Pelapor / User]) -- "Kirim WA" --> WA[Server Meta/WhatsApp]
    WA -- "Terima Pesan" --> Evo[Evolution API\n(Docker Server)]
    
    Evo -- "Webhook (POST)" --> Node[Backend: Node.js]
    Node -- "Simpan Pesan" --> DB[(PostgreSQL)]
    
    Node -- "Emit Socket.io" --> React[Frontend: React.js Web]
    
    React -- "Agen Balas Chat" --> Node
    Node -- "POST /sendText" --> Evo
    Evo -- "Kirim WA" --> WA
```

---

## 3. Langkah Inisiasi Proyek (Action Plan)
1. **DevOps/Sysadmin:** Siapkan VPS, install Docker, lalu jalankan (*pull*) *image* Evolution API dan Database PostgreSQL.
2. **Backend Dev:** Buat *project* Node.js, susun struktur tabel sesuai ERD, dan buat *endpoint* Webhook untuk menerima lemparan data dari Evolution API.
3. **Frontend Dev:** Buat *project* React, desain layout 3-panel, dan pasang Socket.io-client untuk menerima pesan masuk secara *real-time*.
