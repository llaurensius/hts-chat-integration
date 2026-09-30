# 🔄 Diagram Alur Sistem (System Flowcharts)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Status:** Produksi / Workflow V3.0 (Full HTS Diskomdigi Integration, Smart Assign, Dual-Close & PIC Sync)

Dokumen ini memuat diagram alur proses (*Flowchart*) komprehensif menggunakan notasi Mermaid untuk seluruh skenario operasional sistem.

---

## 1. Alur Pesan Masuk Pelanggan (Inbound WhatsApp to Webhook)

Menjelaskan perjalanan pesan dari HP pelanggan, diterima Evolution API, diolah backend, disambungkan ke tiket aktif, hingga muncul di Web Dashboard secara *real-time*.

```mermaid
flowchart TD
    A([Pelapor Kirim Pesan / Gambar via WA]) --> B[Server WhatsApp / Meta]
    B --> C[Evolution API Gateway]
    C -->|Webhook POST /api/webhook/whatsapp| D[Backend Express Controller]
    
    D --> E{Pesan Memuat Gambar?}
    E -- Ya --> F[Unduh Base64 dari Evolution API\nSimpan ke /uploads/img_xxx.jpg]
    E -- Tidak --> G[Ekstrak Teks Pesan]
    F --> H[Cek Data Customer di PostgreSQL]
    G --> H
    
    H --> I{Customer Sudah Ada?}
    I -- Belum --> J[Buat Kontak Customer Baru]
    I -- Sudah --> K[Gunakan Customer ID yang Ada]
    J --> L{Ada Tiket Aktif?\nStatus OPEN atau RESOLVED}
    K --> L
    
    L -- Tidak Ada --> M[Buat Tiket Baru: Status OPEN]
    M --> N1{Cek Pengaturan Bot:\nis_active Auto-Reply?}
    N1 -- Aktif (True) --> N2[Bot Kirim Auto-Reply ke WA Pelapor:\n'Baik aduan akan kami cek dahulu...']
    N1 -- Nonaktif (False) --> P[Simpan Pesan Pelanggan ke Database]
    N2 --> O[Simpan Pesan Bot ke Database]
    O --> P
    
    L -- Ada --> Q[Sambungkan ke ID Tiket Aktif Tersebut]
    Q --> P
    
    P --> R[Emit Event Socket.io: 'new_message']
    R --> S([Tampil Seketika di Layar Web Dashboard])
```

---

## 2. Alur Pendelegasian Smart Multi-Assign L1 ke Tim L2 & WhatsApp Blast

Menjelaskan ketika Dispatcher L1 menugaskan atau mengubah penugasan tim teknisi L2 (Network, Server, M&E). Sistem menggunakan *Smart Diffing* sehingga penugasan tim yang sudah berjalan tidak ter-reset atau terhapus secara tidak sengaja.

```mermaid
flowchart TD
    A([Dispatcher L1 Buka Tiket Aktif]) --> B[Klik Tombol 'Assign ke L2']
    B --> C[Muncul Modal Penugasan]
    C --> D[L1 Centang Tim Tujuan:\n- Network\n- Server\n- M&E]
    D --> E[L1 Pilih / Update Jenis Layanan:\nTroubleshooting / Request / Monitoring]
    E --> F[Klik 'Simpan Penugasan']
    
    F --> G[POST /api/chat/tickets/:id/assign]
    G --> H[Update service_type Tiket]
    H --> I[Hitung Diff Penugasan:\n- Existing (pertahankan status & is_resolved)\n- Added (buat TicketCategory baru)\n- Removed (hapus tim yang di-uncheck)]
    I --> J[Simpan Perubahan ke Database]
    
    J --> K[Tulis Catatan Internal Otomatis:\n'Tiket di-assign ke Tim: ...']
    K --> L{Cek Daftar Kontak di CategoryContact\nUntuk Tim yang Ditugaskan}
    
    L -- Ada Kontak Terdaftar --> M[Loop Kirim WhatsApp Blast ke Nomor / Grup Tim L2]
    L -- Tidak Ada Kontak --> N[Lewati Notifikasi WA]
    
    M --> O[Emit Socket.io: 'ticket_closed' & 'new_message']
    N --> O
    O --> P([Antrean Dashboard L2 & L1 Terupdate Seketika])
```

---

## 3. Alur Penyelesaian Mandiri Per-Tim (Per-Team Resolution by L2)

Menjelaskan alur saat masing-masing teknisi L2 menyelesaikan bagian tugasnya disertai catatan solusi teknis.

```mermaid
flowchart TD
    A([Teknisi L2 Buka Tiket]) --> B[Periksa Kendala & Lakukan Penanganan Lapangan]
    B --> C[Pekerjaan Tim Selesai]
    C --> D[Klik Tombol 'Tandai Selesai']
    D --> E[Muncul Dialog Isian Solusi Teknis]
    E --> F[Teknisi Mengisi Solusi Lapangan:\nMisal: 'Splicing kabel FO core 4 tuntas']
    F --> G[POST /api/chat/tickets/:id/resolve]
    
    G --> H[Update TicketCategory:\nis_resolved = true, resolved_at = now, solution = teks]
    H --> I[Catat Log Catatan Internal Solusi Tim]
    I --> J{Apakah SEMUA Tim Lain yang Ditugaskan\nSudah is_resolved = true?}
    
    J -- Masih Ada Tim Belum Selesai --> K[Tiket Utama Tetap Berstatus OPEN]
    J -- Seluruh Tim Sudah Selesai --> L[Otomatis Update Status Tiket Utama = RESOLVED]
    
    K --> M[Emit Socket.io Refresh Data]
    L --> M
    M --> N([Tiket Siap Ditindaklanjuti L1])
```

---

## 4. Alur Autentikasi Sesi HTS Petugas (Bypass CAPTCHA Visual)

Menjelaskan cara Dispatcher L1 menghubungkan akun resmi HTS Diskomdigi ke aplikasi Helpdesk.

```mermaid
sequenceDiagram
    autonumber
    actor Petugas as Dispatcher L1
    participant UI as Web Dashboard
    participant Backend as Express Server
    participant HTS as Server Portal HTS

    Petugas->>UI: Klik "Hubungkan Akun HTS"
    UI->>Backend: GET /api/hts/captcha
    Backend->>HTS: GET https://hts.diskomdigi.jatengprov.go.id/
    HTS-->>Backend: Set-Cookie (ci_session awal) & CSRF Token
    Backend->>HTS: GET /captcha?rand=xxx (pakai cookie ci_session)
    HTS-->>Backend: Binary Buffer Gambar PNG Captcha
    Backend-->>UI: Base64 Data Image & CSRF
    UI-->>Petugas: Tampilkan Gambar CAPTCHA di Modal

    Petugas->>UI: Masukkan Email, Password, dan Teks CAPTCHA
    UI->>Backend: POST /api/hts/login (email, password, captcha_code)
    Backend->>HTS: POST /login (x-www-form-urlencoded)
    HTS-->>Backend: 302 Redirect & Set-Cookie (ci_session login)
    Backend->>Backend: Simpan cookie ci_session ke tabel HtsUserSession
    Backend-->>UI: { success: true, message: "Terhubung sebagai ..." }
    UI-->>Petugas: Widget Panel Kanan Hijau: Terhubung
```

---

## 5. Alur Penerbitan Tiket ke Portal HTS (Pipeline 3-Tahap)

Menjelaskan bagaimana sebuah tiket aduan di Helpdesk diproses hingga resmi terdaftar di portal HTS dengan nomor aduan dan PIC.

```mermaid
flowchart TD
    A([Dispatcher L1 Klik 'Kirim ke Portal HTS']) --> B[Form Data HTS Terbuka]
    B --> C[Isi Data: Kategori, Detil min 10 karakter,\nPIC Penerima, OPD Induk opsional, Lampiran]
    C --> D[POST /api/chat/tickets/:id/sync-hts]
    
    D --> E[Ambil Sesi Cookie ci_session Petugas dari HtsUserSession]
    
    subgraph Pipeline_HTS [Pipeline 3 Tahap HTS Client Service]
        E --> F[Tahap 1: POST /submit_aduan]
        F --> G[HTS Terbitkan Nomor Aduan:\nContoh: #2025-TShoot-2026-jateng-09]
        G --> H[Query POST /get_aduan_data unsubmitted:\nAmbil id_trouble numerik database HTS]
        H --> I[Tahap 2: POST /submit_aduan_status\nPindahkan dari unsubmitted ke input-pic]
        I --> J[Tahap 3: POST /submit_pic\nTetapkan PIC Penerima Awal: pic_id = '14']
    end
    
    J --> K[Status di HTS Berubah Menjadi PENDING]
    K --> L[Simpan ke Database Helpdesk:\n- hts_ticket_id\n- hts_ticket_no\n- hts_ticket_status = PENDING\n- hts_pic_ids = JSON]
    L --> M[Buat Catatan Internal Tiket Resmi Terbit]
    M --> N[Emit Socket.io: 'ticket_closed' & 'new_message']
    N --> O([Nomor HTS Tampil di Header & Panel Resume])
```

---

## 6. Alur Penutupan Tiket Resmi & Dual-Close HTS (PIC Sync)

Menjelaskan proses saat L1 menutup tiket di Helpdesk dan menyelesaikan tiket di portal HTS secara bersamaan.

```mermaid
flowchart TD
    A([L1 Klik Tombol 'Selesaikan Tiket']) --> B[Modal Penutupan Tiket Terbuka]
    B --> C[Draf Kesimpulan Terisi Otomatis dari Solusi L2]
    C --> D[PIC Penerima Awal Otomatis Tercentang\nBadge Hijau: PIC Penerima]
    D --> E[L1 Centang Teknisi L2 Tambahan jika Ada\nBadge Biru: PIC Penanganan]
    E --> F[L1 Lampirkan Foto Bukti Penyelesaian / Form Teknis]
    F --> G[Klik 'Tutup Tiket']
    
    G --> H[POST /api/chat/tickets/:id/close]
    H --> I{Apakah Tiket Terhubung ke HTS & closeHtsTicket = true?}
    
    I -- Ya --> J[Merge PIC Penerima Awal + PIC Penanganan Akhir\nContoh: ['14', '8']]
    J --> K[Tahap 1 HTS: POST /submit_input_teknis]
    K --> L[Tahap 2 HTS: POST /submit_teknis\npic_id = '14,8', detil solusi, foto bukti]
    
    L --> M{Apakah HTS Berhasil Merespon Success?}
    M -- Gagal / Error HTS --> N[BATALKAN Penutupan Tiket Lokal!\nKembalikan Error ke UI agar Chat Tetap Aman]
    M -- Berhasil --> O[Update Status HTS = SOLVED]
    
    I -- Tidak (Tiket Non-HTS) --> P[Lewati Submit Teknis HTS]
    
    O --> Q[Update Tiket Lokal: status = CLOSED, summary, closed_at]
    P --> Q
    Q --> R[Catat Catatan Internal Penutupan]
    R --> S[Emit Socket.io: 'ticket_closed']
    S --> T([Tiket Selesai & Berpindah ke Menu Rekap])
```
