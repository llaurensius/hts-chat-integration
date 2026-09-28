# 🔄 Diagram Alur Sistem (System Flowcharts)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Status:** Produksi / Workflow V2 (Multi-Assign, Per-Team Resolve, Return)

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
    M --> N[Bot Kirim Auto-Reply ke WA Pelapor:\n'Baik aduan akan kami cek dahulu...']
    N --> O[Simpan Pesan Bot ke Database]
    O --> P[Simpan Pesan Pelanggan ke Database]
    
    L -- Ada --> Q[Sambungkan ke ID Tiket Aktif Tersebut]
    Q --> P
    
    P --> R[Emit Event Socket.io: 'new_message']
    R --> S([Tampil Seketika di Layar Web Dashboard])
```

---

## 2. Alur Pendelegasian Multi-Assign L1 ke Tim L2 & WhatsApp Blast

Menjelaskan ketika Dispatcher L1 menugaskan satu atau lebih tim teknisi L2 (misal Network dan Server sekaligus).

```mermaid
flowchart TD
    A([Dispatcher L1 Buka Tiket Aktif]) --> B[Klik Tombol 'Assign ke L2']
    B --> C[Muncul Modal Penugasan]
    C --> D[L1 Centang Tim Tujuan:\n- Network\n- Server\n- M&E]
    D --> E[L1 Pilih Jenis Layanan:\nTroubleshooting / Request / Monitoring]
    E --> F[Klik 'Tugaskan L2']
    
    F --> G[POST /api/chat/tickets/:id/assign]
    G --> H[Update service_type Tiket]
    H --> I[Hapus Relasi Penugasan Lama]
    I --> J[Buat Relasi TicketCategory Baru\nUntuk Setiap Tim yang Dicentang\nis_resolved = false]
    
    J --> K[Tulis Catatan Internal Otomatis:\n'Tiket di-assign ke Tim: Network, Server']
    K --> L{Apakah Tim Punya wa_target_number?}
    
    L -- Ya --> M[Kirim WhatsApp Blast Notifikasi ke Masing-Masing Tim L2]
    L -- Tidak --> N[Lewati Notifikasi WA]
    
    M --> O[Emit Socket.io: 'ticket_closed' & 'new_message']
    N --> O
    O --> P([Tiket Otomatis Muncul di Layar Teknisi Terkait])
```

---

## 3. Alur Penyelesaian Mandiri Per-Tim (Per-Team Resolution)

Menjelaskan bagaimana masing-masing tim L2 menyelesaikan bagiannya sendiri hingga tiket berstatus `RESOLVED`.

```mermaid
flowchart TD
    A([Teknisi L2 Buka Tiket di Antreannya]) --> B[Teknisi Selesai Menangani Masalah Bagiannya]
    B --> C[Klik Tombol 'Tandai Selesai']
    C --> D[POST /api/chat/tickets/:id/resolve]
    
    D --> E[Set is_resolved = true & resolved_at = now\nKhusus untuk Kategori Tim Pengguna Tersebut]
    E --> F[Tulis Catatan Internal:\n'Tim X telah menandai kendala di bagiannya selesai']
    
    F --> G{Apakah SEMUA Tim yang Ditugaskan\nSudah is_resolved = true?}
    
    G -- Belum (Ada Tim Lain yang Masih Kerja) --> H[Status Tiket Utama TETAP OPEN]
    H --> I[Layar Tampilkan Badge Status:\n✓ Tim Selesai | ⏳ Tim Masih Kerja]
    
    G -- Ya (Semua Tim Sudah Selesai) --> J[Ubah Status Tiket Utama Menjadi RESOLVED]
    J --> K[Tulis Catatan Internal:\n'Seluruh tim telah selesai menangani. Siap ditutup L1.']
    
    I --> L[Emit Socket.io Refresh Data]
    K --> L
    L --> M([Tiket Siap Ditindaklanjuti L1])
```

---

## 4. Alur Pengembalian Tiket / Pelepasan Tim Mandiri (Self-Unassign Return)

Menjelaskan jika teknisi mendapati kendala bukan di bagiannya dan ingin melepas penugasan tanpa mengganggu tim lain.

```mermaid
flowchart TD
    A([Teknisi L2 Buka Tiket]) --> B[Periksa Kendala & Ternyata Normal di Bagiannya]
    B --> C[Klik Tombol 'Kembalikan / Lepas']
    C --> D[Muncul Dialog Isian Alasan Pengembalian]
    D --> E[Teknisi Isi Alasan:\nMisal: 'Tidak ada kendala di sisi server']
    E --> F[POST /api/chat/tickets/:id/return]
    
    F --> G[Hapus Relasi TicketCategory Milik Tim Pengguna]
    G --> H[Tulis Catatan Internal Alasan Pengembalian]
    H --> I{Apakah Masih Ada Tim Lain yang Ditugaskan?}
    
    I -- Ya (Masih Ada Tim Lain) --> J[Tiket Tetap Berjalan di Tim yang Tersisa]
    I -- Tidak (Semua Tim Sudah Dilepas) --> K[Tiket Kembali Berstatus 'Belum Ditugaskan' di Antrean L1]
    
    J --> L[Tiket Hilang dari Antrean Teknisi Ini]
    K --> L
    L --> M[Emit Socket.io Refresh Data]
    M --> N([Antrean Diperbarui Seketika])
```

---

## 5. Alur Penutupan Tiket Resmi oleh Dispatcher L1 (Official Closure)

Menjelaskan tahapan akhir di mana L1 mengonfirmasi ke pelanggan dan menutup tiket dengan kesimpulan resmi.

```mermaid
flowchart TD
    A([L1 Melihat Tiket Berstatus RESOLVED]) --> B[L1 Menghubungi Pelapor via Chat Web Helpdesk]
    B --> C[Pelapor Konfirmasi Masalah Sudah Beres]
    C --> D[L1 Klik Tombol 'Selesaikan']
    D --> E[Muncul Modal Penutupan Tiket]
    
    E --> F[L1 Konfirmasi Tag Kategori Masalah]
    F --> G[L1 Wajib Mengisi Kesimpulan Penanganan\nMinimal 10 Karakter]
    G --> H[Klik 'Tutup Tiket']
    
    H --> I[POST /api/chat/tickets/:id/close]
    I --> J[Set Status Tiket = CLOSED]
    J --> K[Catat Waktu closed_at = now]
    K --> L[Simpan Teks Kesimpulan ke Kolom summary]
    L --> M[Tulis Catatan Internal Resmi Penutupan]
    
    M --> N[Emit Socket.io: 'ticket_closed']
    N --> O[Tiket Berpindah ke Menu Rekap Hasil Aduan]
    O --> P([Siklus Hidup Tiket Selesai])
```
