# 🔄 Diagram Alur Sistem (System Flowcharts)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Status:** Produksi / Workflow V2.2 (Multi-Assign, Per-Team Resolve, Return, Auto-Reply Toggle, Smart Assign, Multi-Contact Blast, Sequence Reset)

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
    E --> F[Klik 'Tugaskan L2']
    
    F --> G[POST /api/chat/tickets/:id/assign]
    G --> H[Update service_type Tiket]
    H --> I[Hitung Diff Penugasan:\n- Existing (tetap dipertahankan status & is_resolved)\n- Added (buat TicketCategory baru)\n- Removed (hapus tim yang tidak dicentang lagi)]
    I --> J[Simpan Perubahan ke Database]
    
    J --> K[Tulis Catatan Internal Otomatis:\n'Tiket di-assign ke Tim: ...']
    K --> L{Cek Daftar Kontak di CategoryContact\nUntuk Masing-Masing Tim yang Ditugaskan}
    
    L -- Ada Kontak Terdaftar --> M[Loop Kirim WhatsApp Blast Notifikasi ke Semua Nomor / Grup Tim L2]
    L -- Tidak Ada Kontak --> N[Lewati Notifikasi WA]
    
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
    E --> F[Tulis Catatan Internal dengan Badge Identitas Tim:\n'[Tim Network] Tim Network telah menandai kendala selesai']
    
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
    G --> H[Tulis Catatan Internal Alasan Pengembalian dengan Badge Identitas Tim]
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

Menjelaskan tahapan akhir di mana L1 mengonfirmasi ke pelanggan dan menutup tiket dengan kesimpulan resmi serta auto pre-fill kategori masalah.

```mermaid
flowchart TD
    A([L1 Melihat Tiket Berstatus RESOLVED]) --> B[L1 Menghubungi Pelapor via Chat Web Helpdesk]
    B --> C[Pelapor Konfirmasi Masalah Sudah Beres]
    C --> D[L1 Klik Tombol 'Selesaikan']
    D --> E[Muncul Modal Penutupan Tiket]
    
    E --> F[Modal Otomatis Mencentang Kategori Masalah\nSesuai Tim L2 yang Ditugaskan Sebelumnya]
    F --> G[L1 Sesuaikan / Konfirmasi Kategori jika Perlu]
    G --> H[L1 Wajib Mengisi Kesimpulan Penanganan\nMinimal 10 Karakter]
    H --> I[Klik 'Tutup Tiket']
    
    I --> J[POST /api/chat/tickets/:id/close]
    J --> K[Set Status Tiket = CLOSED]
    K --> L[Catat Waktu closed_at = now]
    L --> M[Simpan Teks Kesimpulan ke Kolom summary]
    M --> N[Tulis Catatan Internal Resmi Penutupan]
    
    N --> O[Emit Socket.io: 'ticket_closed']
    O --> P[Tiket Berpindah ke Menu Rekap Hasil Aduan]
    P --> Q([Siklus Hidup Tiket Selesai])
```

---

## 6. Alur Penghapusan Rekap Hasil Aduan & Reset Penomoran ID (Admin Only)

Menjelaskan pembersihan rekap tiket selesai oleh Administrator untuk keperluan maintenance atau reset data testing.

```mermaid
flowchart TD
    A([Admin Buka Menu Rekap Hasil Aduan]) --> B[Admin Pilih Tiket Tertentu atau Klik 'Hapus Semua']
    B --> C[Muncul Konfirmasi Peringatan Penghapusan Permanen]
    C --> D[Admin Menyetujui Penghapusan]
    
    D --> E[DELETE /api/reports/tickets]
    E --> F{Hapus Semua atau Terpilih?}
    
    F -- Terpilih (ids: [1, 2, ...]) --> G[Hapus Tiket CLOSED yang Dipilih Saja Beserta Pesan & Kategorinya]
    F -- Hapus Semua (all: true) --> H[Hapus SEMUA Tiket CLOSED Beserta Pesan & Kategorinya]
    H --> I[Cek Jumlah Tiket Aktif Tersisa]
    I --> J[Reset PostgreSQL Auto-Increment Sequence:\nALTER SEQUENCE tickets_id_seq RESTART WITH 1]
    
    G --> K[Kirim Response Berhasil]
    J --> K
    K --> L[Tabel Rekap Segera Kosong & Tiket Baru Berikutnya Mulai dari ID #1]
