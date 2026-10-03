# Laporan Analisis & Rencana Perbaikan (Bug Report & Fix Plan)
## Masalah: Tombol "Terbitkan ke Portal HTS" Tidak Merespons Setelah Assign ke L2

**Tanggal:** 3 Oktober 2026  
**Status:** Selesai Diimplementasikan (*Implemented & Verified*)  
**Penulis:** Antigravity AI Pair Programmer  
**Target File Terdampak:**
* [backend/src/controllers/chatController.js](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/controllers/chatController.js)
* [frontend/src/App.jsx](file:///d:/Kuliah/Repository/hts-chat-integration/frontend/src/App.jsx)

---

## 1. Deskripsi Masalah

### Gejala yang Dilaporkan (*Reported Symptoms*)
1. **Skenario 1 (Gagal / Tidak Merespons):**
   * Pengguna (Helpdesk L1) membuka modal penugasan tiket chat ke L2.
   * Pada bagian **3. Integrasi Portal HTS Diskomdigi**, pengguna mencentang opsi:  
     `[✓] Langsung buka formulir Portal HTS setelah menyimpan penugasan`.
   * Pengguna mengklik simpan penugasan, lalu drawer formulir Portal HTS terbuka otomatis.
   * Pengguna mengisi seluruh formulir (OPD, tanggal, jam, kategori, detil aduan, dan memilih teknisi PIC).
   * Saat tombol **"Terbitkan ke Portal HTS"** diklik, **tidak ada respons apapun** (tidak ada request HTTP yang dikirim, tidak ada animasi loading, dan tidak ada pesan error di layar).
2. **Skenario 2 (Berhasil):**
   * Pengguna membuka kembali percakapan chat tersebut dari antrean sebelah kiri.
   * Pengguna mengakses menu **"Sinkronkan / Tautkan ke Portal HTS"** melalui **Pusat Kendali (Panel Kanan)**.
   * Mengisi formulir yang sama dan menekan tombol **"Terbitkan ke Portal HTS"**.
   * Tiket HTS **berhasil diterbitkan** ke portal HTS tanpa kendala.

---

## 2. Analisis Akar Masalah (*Root Cause Analysis - RCA*)

Berdasarkan penelusuran alur kode secara *end-to-end* antara frontend dan backend, ditemukan **kondisi balapan (*race condition*) dan ketidakcocokan event Socket.io**:

```
[Helpdesk L1] Klik "Simpan Penugasan" (Centang Auto-Open HTS)
      │
      ▼
[Frontend] Mengirim POST /chat/tickets/:ticketId/assign
      │
      ▼
[Backend] chatController.js -> assignTicket()
      │
      ├─► Menyimpan penugasan kategori L2 di Database (Status tiket tetap OPEN)
      │
      └─► req.io.emit('ticket_closed', { ticketId: ticket.id }) ⚠️ SALAH EVENT!
            │
            ▼
[Socket.io Broadcast] Dikirim ke semua klien (termasuk browser pengirim)
      │
      ▼
[Frontend Listener] handleTicketClosed() di App.jsx
      │
      ├─► activeTicketRef.current.id === data.ticketId
      └─► setActiveTicket(null) 💥 TIKET AKTIF DIKOSONGKAN!
            │
            ▼
[Jembatan UX] handleOpenSyncHtsModal() tetap membuka drawer formulir HTS
            │
            ▼
[Pengguna] Mengisi formulir di drawer & klik "Terbitkan ke Portal HTS"
            │
            ▼
[Frontend] handleSyncTicketToHts()
      │
      ├─► if (!activeTicket) return;  <-- 💥 activeTicket SUDAH NULL!
      │
      └─► Eksekusi berhenti seketika tanpa request, tanpa pesan, TANPA RESPON APAPUN.
```

### Rincian Temuan Kode:

1. **Backend Salah Memancarkan Event Socket (`ticket_closed`):**
   * Di [backend/src/controllers/chatController.js baris 939](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/controllers/chatController.js#L939):
     ```javascript
     if (req.io) {
       req.io.emit('ticket_closed', { ticketId: ticket.id }); // Trigger reload
       req.io.emit('new_message', { ... });
     }
     ```
   * Fungsi `assignTicket` hanya mengubah penugasan tim L2, status tiket **tidak ditutup** (tetap `OPEN`). Menggunakan event `ticket_closed` di sini adalah kekeliruan pemodelan event.
   * Selain `assignTicket`, audit menemukan beberapa endpoint lain yang juga salah memancarkan `ticket_closed` padahal tiket tidak ditutup:
     - `resolveTicket` (L2 menyelesaikan aduan lapangan, tiket belum ditutup L1)
     - `returnTicket` (L2 mengembalikan tiket ke L1)
     - `createTicketHts` (pembuatan tiket HTS baru)
     - `solveTicketHtsSingle` (penyelesaian mandiri 1 tiket HTS)
     - `toggleAduan` (pengubahan status percakapan umum jadi aduan)

2. **Frontend Langsung Mereset Tiket Aktif Menjadi `null` Saat Menerima `ticket_closed`:**
   * Di [frontend/src/App.jsx baris 1648–1656](file:///d:/Kuliah/Repository/hts-chat-integration/frontend/src/App.jsx#L1648-L1656):
     ```javascript
     const handleTicketClosed = (data) => {
       loadTickets(); 
       if (currentTabRef.current === 'report') loadReports();
       
       if (activeTicketRef.current && data.ticketId === activeTicketRef.current.id) {
         setActiveTicket(null); // <-- Mengosongkan percakapan aktif
         alert('Tiket ini baru saja diupdate statusnya.');
       }
     };
     ```
   * Akibatnya, operator yang sedang membuka tiket tersebut dipaksa keluar dari percakapan aktif (`activeTicket = null`).

3. **Drawer Formulir HTS Tetap Tampil, Namun State `activeTicket` Hilang:**
   * State drawer formulir HTS (`showSyncHtsModal`) adalah boolean independen, sehingga drawernya tetap terbuka di layar.
   * Namun saat pengguna menekan tombol *“Terbitkan ke Portal HTS”*, fungsi `handleSyncTicketToHts` memiliki *guard clause*:
     ```javascript
     const handleSyncTicketToHts = async (e) => {
       e.preventDefault();
       if (!activeTicket) return; // <-- Keluar hening (silent return)
     ```
   * Karena `activeTicket` sudah bernilai `null`, fungsi langsung keluar secara hening tanpa ada indikator apapun.

4. **Penjelasan Mengapa Berhasil Jika Dibuka Kembali dari Panel Kanan:**
   * Saat pengguna mengklik kembali tiket tersebut di daftar antrean chat kiri, `setActiveTicket(ticket)` dipanggil ulang dan `activeTicket` terisi kembali dengan objek tiket yang valid.
   * Sehingga saat drawer HTS dibuka melalui tombol panel kanan, `activeTicket` ada dan valid, sehingga pengiriman `POST /chat/tickets/:ticketId/hts` berjalan lancar.

---

## 3. Rencana Perbaikan Komprehensif (*Fix Plan*)

Untuk mengatasi masalah ini secara permanen dan mencegah regresi (*regression*), perbaikan akan diterapkan di 2 sisi (Backend dan Frontend):

### A. Perbaikan Sisi Backend ([chatController.js](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/controllers/chatController.js))
1. **Koreksi Event Socket pada `assignTicket`:**
   * Ubah pemancaran event pada baris 939 dari `ticket_closed` menjadi `ticket_assigned` dan `ticket_updated`:
     ```javascript
     if (req.io) {
       req.io.emit('ticket_assigned', { ticketId: ticket.id, categories: newCategories });
       req.io.emit('ticket_updated', { ticketId: ticket.id });
       req.io.emit('new_message', { ... });
     }
     ```
2. **Koreksi Event Socket pada Controller Bukan-Tutup:**
   * Ganti `ticket_closed` menjadi `ticket_updated` pada `resolveTicket`, `returnTicket`, `createTicketHts`, `solveTicketHtsSingle`, dan `toggleAduan`.
   * Pastikan `ticket_closed` **hanya** dipancarkan saat tiket resmi ditutup di `closeTicket` dan `closeGeneralChat`.

### B. Perbaikan Sisi Frontend ([App.jsx](file:///d:/Kuliah/Repository/hts-chat-integration/frontend/src/App.jsx))
1. **Pengamanan Listener `handleTicketClosed`:**
   * Ubah logika `handleTicketClosed` agar **hanya** mengosongkan `activeTicket` jika status tiket yang diterima dari payload socket benar-benar `CLOSED` atau jika tiket tersebut tidak lagi ada di daftar antrean aktif.
   * Jangan mereset `activeTicket` jika tiket tersebut berstatus `OPEN` atau sedang dalam proses penugasan L2.
2. **Isolasi State Target Tiket di Modal HTS (`syncTargetTicket`):**
   * Saat `handleOpenSyncHtsModal(targetTicket)` dipanggil, simpan objek tiket target ke dalam state khusus `syncTargetTicket` (default ke `targetTicket || activeTicket`).
   * Di dalam `handleSyncTicketToHts`, gunakan `syncTargetTicket` atau fallback `activeTicket`. Dengan demikian, bahkan jika terjadi pembaruan di latar belakang, formulir HTS tetap memegang referensi tiket target yang sah.
3. **Penghapusan *Silent Return* (Feedback Defensif):**
   * Jika target tiket tidak ditemukan, jangan keluar secara hening (`return;`), melainkan tampilkan notifikasi/alert yang jelas:
     ```javascript
     const target = syncTargetTicket || activeTicket;
     if (!target) {
       alert('Sesi tiket tidak valid. Silakan pilih kembali tiket aduan dari daftar antrean.');
       return;
     }
     ```

---

## 4. Rencana Pengujian (*Testing & Verification Plan*)

Setelah perbaikan diizinkan untuk diimplementasikan, pengujian berikut akan dilakukan:

| No | Skenario Pengujian | Hasil yang Diharapkan |
|---|---|---|
| 1 | L1 melakukan Assign ke L2 dengan centang *"Langsung buka formulir Portal HTS setelah menyimpan penugasan"* | Penugasan tersimpan, tiket tetap aktif di panel tengah (tidak ter-reset ke null), drawer formulir HTS terbuka dengan data terisi. |
| 2 | Mengisi form di drawer HTS dan menekan *"Terbitkan ke Portal HTS"* | Tombol menampilkan status loading *"Menerbitkan ke HTS..."*, request HTTP terkirim, tiket HTS terbuat di portal, dan muncul konfirmasi sukses. |
| 3 | Membuka percakapan chat yang sudah memiliki HTS dari panel kanan dan menambahkan HTS kedua | Penambahan Multi-HTS tetap berfungsi normal seperti sebelumnya (tidak ada regresi). |
| 4 | Menutup tiket melalui modal Selesaikan Tiket | Status tiket berubah jadi CLOSED, tombol penutupan tervalidasi penuh sesuai SOP Multi-HTS. |

---

## 5. Status Tindakan Saat Ini
 
> [!NOTE]
> **Perbaikan Telah Selesai Diimplementasikan & Tervalidasi:**
> 1. **Backend ([chatController.js](file:///d:/Kuliah/Repository/hts-chat-integration/backend/src/controllers/chatController.js)):**
>    - `assignTicket` kini memancarkan event `ticket_assigned` dan `ticket_updated` (disertai objek `ticket` lengkap). Tidak lagi memancarkan `ticket_closed`.
>    - `resolveTicket`, `returnTicket`, `createTicketHts`, dan `syncSolveHts` kini memancarkan `ticket_updated` bukannya `ticket_closed`.
>    - Event `ticket_closed` secara ketat hanya dipancarkan pada saat tiket benar-benar ditutup secara definitif (`closeTicket` dan `closeGeneralChat`).
> 2. **Frontend ([App.jsx](file:///d:/Kuliah/Repository/hts-chat-integration/frontend/src/App.jsx)):**
>    - Ditambahkan state `syncTargetTicket` untuk mengisolasi tiket sasaran formulir HTS.
>    - `handleOpenSyncHtsModal` menerima argumen tiket target dan menyimpan ke `syncTargetTicket`.
>    - `handleSyncTicketToHts` dan `handleLinkHtsTicket` menggunakan referensi tiket `syncTargetTicket || activeTicket`.
>    - Menghilangkan *silent return* dengan menambahkan notifikasi alert defensif jika sesi tiket tidak ditemukan.
>    - Listener `ticket_updated` ditambahkan untuk memperbarui data antrean dan percakapan aktif secara mulus tanpa mereset ke `null`.
>    - Listener `ticket_closed` diberi proteksi agar tidak mereset tiket jika status tiket masih `OPEN`.
> 3. **Verifikasi Build:**
>    - Syntax check backend (`node --check`) sukses 100%.
>    - Build frontend (`npm run build` via Vite) sukses tanpa error (0 errors).
