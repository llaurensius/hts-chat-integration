# Konsep Antarmuka Website (UI / Wireframe)
**Proyek:** Integrasi WhatsApp ke Web Helpdesk

Aplikasi web ini utamanya akan diakses lewat Desktop/Laptop oleh para Agen dan Supervisor. Berikut adalah rancangan *layout* dan komponen untuk setiap halaman.

---

## 1. Halaman Dashboard (Beranda)
Halaman pertama setelah agen berhasil *login*. 
*   **Top Nav:** Profil, Notifikasi (untuk *Blast Broadcast* divisi), dan Role Agen.
*   **Widget Statistik:** 
    *   Total Tiket Hari Ini
    *   Tiket Berstatus "OPEN" di Divisi Saya
    *   Tiket Berstatus "CLOSED" Hari Ini
*   **Tabel Quick View:** Daftar tiket terbaru yang masuk tapi belum di-*assign* ke divisi/agen manapun (Khusus Agen L1 / Dispatcher).

---

## 2. Halaman Live Chat & Ticketing (Halaman Utama)
Ini adalah halaman inti tempat komunikasi Many-to-One terjadi. Disarankan menggunakan **Layout 3 Kolom (Three-Pane Layout)** agar efisien.

### 📋 Panel Kiri (Daftar Tiket / Inbox)
Berisi daftar tiket yang sedang aktif (seperti daftar *chat* di WhatsApp Web).
*   **Filter/Tab:** [Semua Tiket] | [Divisi Saya] | [Tiket Belum Ditangani]
*   **List Item Tiket:**
    *   Nama SKPD / Nomor WA
    *   Cuplikan pesan terakhir
    *   Indikator/Tag Divisi (Bisa lebih dari 1 tag, misal: `Server`, `Network`)
    *   Label Status (Misal: `Menunggu Respons L2`)

### 💬 Panel Tengah (Area Percakapan)
Area utama untuk berbalas pesan dengan *user* WA.
*   **Header Chat:** Nama Klien & Status "Jeda Bot" (Toggle Switch *On/Off*).
*   **Chat Bubbles:**
    *   Kiri: Chat dari Pelapor / *User*.
    *   Kanan: Chat dari Agen (Wajib menampilkan *Nama Agen* yang membalas, karena 1 chat bisa dibalas banyak Agen).
    *   Tengah (Sistem): Chat *Auto-reply* dari Bot.
*   **Kolom Input Bawah:** 
    *   Text area (Ketik pesan).
    *   Tombol 📎 (Attachment): Untuk *Upload Image & Document*.
    *   Tombol "Kirim".

### ⚙️ Panel Kanan (Kontrol Tiket / Actions)
Area untuk mengatur *state* dari tiket tersebut.
*   **Informasi Pelapor:** Nama, Nomor WA, Instansi.
*   **Action L1 (Dispatcher):**
    *   Tombol `Teruskan (Tag) ke Divisi`. Saat diklik, bisa *checklist* > 1 divisi (Multi-kendala).
    *   Tombol `Re-escalate`. Untuk memanggil/menggabungkan *chat* ini ke tiket ID lama.
*   **Action L2 (Teknis):**
    *   Tombol `Close Ticket`.
    *   *(Pop-up Modal):* Jika `Close Ticket` diklik, muncul *form* **wajib isi**: "Kesimpulan / Summary Penanganan". Tidak bisa ditutup sebelum form ini diisi.

---

## 3. Halaman Rekap & Laporan (Reporting)
Halaman khusus untuk Supervisor/Manajemen mengambil data paparan.
*   **Filter Tanggal:** Range (Dari Tgl - Sampai Tgl).
*   **Filter Divisi & Status.**
*   **Tabel Data:** 
    *   ID | Tanggal | Instansi | Kendala | Divisi | Summary
*   **Export Actions:** Tombol `Export Excel`, `Export PDF`.
*   **Tab Khusus "Bahan Paparan":** Menampilkan view perbandingan *Before/After* (Masalah sebelumnya vs Follow-up saat ini) dalam format yang rapi untuk di-*copy-paste* ke PowerPoint/Slide presentasi.

---

## 4. Modal Pop-up Penting (UX Behaviors)

1. **Notifikasi Blast (F4):** 
   Saat pesan WA baru masuk dan di-*tag* ke divisi "Server", muncul *toast/pop-up* kecil di sudut kanan atas seluruh agen L2 Divisi Server yang sedang *login*: 
   *"Tiket Baru: [Instansi X] melaporkan Server Down. [Klik di sini untuk membuka]"*
2. **Modal Close Ticket (F7):**
   *   Teks peringatan: *"Anda akan menutup tiket ini. Silakan tuliskan kesimpulan dan tindakan yang telah dilakukan."*
   *   Text Area (Wajib).
   *   Tombol "Simpan & Tutup Tiket".
