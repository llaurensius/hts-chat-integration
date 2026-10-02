# 🛠️ Spesifikasi Teknis Perbaikan Sistem (Technical Specification Fixes V4.2)

**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Target Versi:** V4.2  
**Status:** Draf Acuan Teknis  
**Dasar Pembuatan:** Feedback Evaluasi Pengujian Lapangan Modul 9 (02 Oktober 2026)  
**Penulis:** Principal Software Architect & QA Lead  

---

## 1. Ringkasan Eksekutif

Dokumen ini menjadi acuan kerja tunggal untuk perbaikan bug dan penyempurnaan alur bisnis yang ditemukan selama sesi QA Modul 9. Perbaikan difokuskan pada integritas data relasi Multi-HTS, pencegahan duplikasi tiket, penanganan lampiran multi-berkas, dan fleksibilitas identitas kontak pelapor.

### Matriks Evaluasi Temuan & Rencana Aksi

| ID | Area Temuan | Severity | Komponen | Ringkasan Solusi |
|---|---|:---:|---|---|
| **FIX-01** | Tiket HTS percakapan baru tidak bisa di-unlink & kartu terduplikasi | **HIGH** | `frontend/src/App.jsx` | Hilangkan percabangan kartu legacy; satukan SSOT ke `activeTicket.hts_tickets`; pasang handler `handleUnlinkHts` di setiap kartu. |
| **FIX-02** | Anti-duplikat HTS hanya aktif saat link manual, lolos saat terbit baru | **HIGH** | `backend/src/controllers/chatController.js` | Pasang idempotency guard berbasis query unik `(ticket_id, hts_ticket_no)` pada seluruh endpoint sinkronisasi/penerbitan HTS. |
| **FIX-03** | QA 9.8 Hapus semua kontak | **INFO** | `backend/src/controllers/adminController.js` | Terverifikasi **LULUS 100%**. Seluruh kontak terhapus dan sequence auto-increment `Customer_id_seq` kembali ke angka 1. |
| **FIX-04** | Multi-foto hanya berfungsi di modal tutup tiket, form buat tiket terkunci 1 foto | **MEDIUM** | `frontend/src/App.jsx` | Tambah atribut `multiple` pada input berkas form sinkronisasi HTS serta sediakan UI chip pratinjau berkas terpilih. |
| **FIX-05** | Form awal HTS mengunci nomor telepon (tidak bisa diedit) | **MEDIUM** | `backend/src/controllers/chatController.js`, `frontend/src/App.jsx` | Buka mutasi field `wa_number` pada endpoint `updateCustomer` (dengan sanitasi dan proteksi `@unique`) serta buat input telepon di drawer HTS menjadi editable. |

---

## 2. Pembedahan Akar Masalah (Root Cause Analysis)

### FIX-01: Masalah Unlink & Duplikasi Kartu Tiket HTS
* **Gejala:** Pada percakapan yang baru dibuatkan tiket HTS, kartu tiket di panel samping tidak menampilkan tombol hapus/unlink (hanya bisa menambah tiket lain). Selain itu, nomor tiket yang sama kerap muncul dua kali (terduplikasi) di panel kanan.
* **Akar Masalah UI:**  
  Di `frontend/src/App.jsx` baris 3682–3745, terdapat inkonsistensi Single Source of Truth (SSOT). Frontend menggunakan state terpisah `htsTickets` yang diambil via `GET /tickets/:id/hts` paralel dengan objek tiket aktif `activeTicket.hts_tickets`.
  Ketika tiket baru diterbitkan, state `htsTickets` masih kosong sebelum request selesai, sehingga UI jatuh ke blok **Fallback Legacy Card** (baris 3733). Pada blok fallback ini:
  1. Tidak dirender tombol `Trash2` / `handleUnlinkHts`.
  2. Jika request selesai dan state `htsTickets` terisi sementara `activeTicket.hts_ticket_no` tetap ada, kedua blok saling tumpang-tindih me-render tiket yang sama sehingga tampilan menjadi ganda.

### FIX-02: Kebocoran Anti-Duplikat Tiket HTS
* **Gejala:** Dispatcher dapat menerbitkan tiket HTS dengan nomor yang sama berulang kali di percakapan yang sama. Proteksi tolak duplikat hanya aktif di tab "Tautkan yang Sudah Ada".
* **Akar Masalah Backend:**  
  Di `backend/src/controllers/chatController.js`, pemeriksaan duplikasi `findFirst({ where: { ticket_id, hts_ticket_no } })` hanya ditanam pada fungsi `linkHtsTicket` (baris 2503).  
  Fungsi-fungsi berikut **tidak memiliki guard pengecekan sama sekali**:
  - `syncTicketToHts` (baris 1145)
  - `createTicketHts` (baris 1424)
  - `assignTicket` dengan opsi `createHtsTicket: true` (baris 619)

### FIX-04: Limitasi Input Multi-Foto Form Sinkronisasi
* **Gejala:** Dispatcher hanya dapat memilih satu berkas gambar saat membuat tiket HTS baru, sedangkan pada form penutupan tiket dapat memilih hingga 5 berkas.
* **Akar Masalah Frontend:**  
  Di `frontend/src/App.jsx` baris 5178:
  ```jsx
  <input
    type="file"
    accept="image/*,.pdf"
    onChange={(e) => setSyncHtsFiles(Array.from(e.target.files || []))}
    className="..."
  />
  ```
  Elemen input tidak menyertakan atribut `multiple`. Padahal backend pada route `POST /tickets/:ticketId/sync-hts` dan `POST /tickets/:ticketId/hts` telah menggunakan middleware `upload.array('attachment', 5)`.

### FIX-05: Nomor Telepon Pelapor Terkunci pada Form HTS
* **Gejala:** Saat pertama kali membuka form sinkronisasi HTS, nomor telepon pelapor ditampilkan sebagai teks mati/disabled. Jika ada salah sambung atau pelapor menggunakan nomor perantara, dispatcher tidak dapat membetulkan nomor resmi pemohon ke portal HTS.
* **Akar Masalah Fullstack:**  
  1. **Backend (`chatController.js:1071`):** Controller `updateCustomer` hanya mengambil `{ name, skpd_name }` dari `req.body`, mengabaikan `wa_number` karena adanya constraint `@unique` di tabel `Customer`.
  2. **Frontend (`App.jsx`):** Modal HTS hanya membaca statis `activeTicket.customer?.wa_number` tanpa menyediakan state penampung input yang dapat diubah oleh operator.

---

## 3. Rencana Implementasi & Refactoring

### A. Refactor Frontend: Unifikasi SSOT Kartu HTS & Fitur Multi-Foto (`frontend/src/App.jsx`)

1. **Hapus fallback legacy card** di panel samping kanan (`App.jsx` sekitar baris 3730). Gunakan array tunggal:
   ```jsx
   const displayedHtsTickets = (activeTicket.hts_tickets && activeTicket.hts_tickets.length > 0)
     ? activeTicket.hts_tickets
     : (htsTickets.length > 0 ? htsTickets : []);
   ```
2. **Pastikan tombol Unlink (`Trash2`) selalu aktif** untuk setiap item dalam `displayedHtsTickets`:
   ```jsx
   {isL1 && (
     <button
       type="button"
       onClick={() => handleUnlinkHts(htsItem.id || htsItem.hts_ticket_id)}
       title="Lepas tautan tiket HTS dari percakapan ini"
       className="p-1 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded transition"
     >
       <Trash2 className="w-3.5 h-3.5" />
     </button>
   )}
   ```
3. **Tambahkan atribut `multiple`** pada input file modal sinkron HTS (`App.jsx:5178`):
   ```jsx
   <input
     type="file"
     multiple
     accept="image/*,.pdf"
     onChange={(e) => {
       const selected = Array.from(e.target.files || []);
       setSyncHtsFiles(prev => [...prev, ...selected].slice(0, 5));
     }}
     className="..."
   />
   ```
4. **Sediakan daftar pratinjau berkas terpilih** dengan tombol hapus satuan (`X`) sebelum submit ke backend.

### B. Refactor Backend: Universal Anti-Duplikat HTS (`backend/src/controllers/chatController.js`)

Tambahkan guard idempotent di dalam fungsi `syncTicketToHts`, `createTicketHts`, dan `assignTicket` tepat sebelum operasi `prisma.ticketHts.create`:

```javascript
// Guard Anti-Duplikasi Universal
const duplicateCheck = await prisma.ticketHts.findFirst({
  where: {
    ticket_id: ticket.id,
    OR: [
      { hts_ticket_no: htsResult.noTrouble },
      { hts_ticket_id: String(htsResult.idTrouble) }
    ]
  }
});

if (duplicateCheck) {
  return res.status(400).json({
    error: `Nomor aduan HTS #${htsResult.noTrouble} sudah tertaut di percakapan ini.`
  });
}
```

### C. Refactor Backend & Frontend: Editable Nomor WhatsApp Pelapor

1. **Perbaikan Backend (`chatController.js:updateCustomer`):**
   ```javascript
   const updateCustomer = async (req, res) => {
     const { customerId } = req.params;
     const { name, skpd_name, wa_number } = req.body;

     try {
       const existing = await prisma.customer.findUnique({
         where: { id: parseInt(customerId) }
       });
       if (!existing) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

       let updateData = {
         name: name ? name.trim() : existing.name,
         skpd_name: skpd_name !== undefined ? (skpd_name ? skpd_name.trim() : null) : existing.skpd_name,
         is_custom_name: true
       };

       if (wa_number && wa_number.trim()) {
         const sanitizedNumber = wa_number.replace(/\D/g, '');
         const normalizedNumber = sanitizedNumber.startsWith('0') 
           ? '62' + sanitizedNumber.substring(1) 
           : sanitizedNumber;

         if (normalizedNumber !== existing.wa_number) {
           // Cek bentrok nomor pada customer lain
           const conflict = await prisma.customer.findUnique({
             where: { wa_number: normalizedNumber }
           });
           if (conflict && conflict.id !== existing.id) {
             return res.status(400).json({ error: 'Nomor WhatsApp tersebut sudah terdaftar pada kontak lain' });
           }
           updateData.wa_number = normalizedNumber;
         }
       }

       const updated = await prisma.customer.update({
         where: { id: parseInt(customerId) },
         data: updateData
       });

       res.json({ success: true, customer: updated });
     } catch (err) {
       res.status(500).json({ error: err.message });
     }
   };
   ```
2. **Perbaikan Frontend:**
   Pada modal HTS drawer, input nomor telepon dibuat aktif (editable) dan diinisialisasi dari `activeTicket.customer?.wa_number`. Saat disubmit, jika nomor diubah, sistem otomatis memperbarui data customer terlebih dahulu.

---

## 4. Rencana Pengujian Pasca-Perbaikan (Acceptance Criteria)

1. **Pengujian FIX-01 (Unlink & Tampilan Tunggal):**
   * Buat tiket baru -> klik Sinkron HTS -> terbitkan nomor aduan.
   * Pastikan kartu tiket HTS hanya muncul **1 kali** di panel samping kanan.
   * Pastikan ikon tong sampah (`Trash2`) tampil pada kartu tersebut.
   * Klik tombol hapus -> konfirmasi unlink -> baris `TicketHts` terhapus bersih dan nomor HTS hilang dari header/panel.

2. **Pengujian FIX-02 (Anti-Duplikat Universal):**
   * Kirim request berulang (double-click) saat sinkronisasi tiket HTS.
   * Pastikan sistem menolak pembuatan tiket kedua dengan respons `400 Bad Request`.

3. **Pengujian FIX-04 (Multi-Foto Terbitkan Tiket):**
   * Buka drawer Sinkronkan ke Portal HTS -> Tab Terbitkan Baru.
   * Pilih 3 file gambar sekaligus via file browser.
   * Pastikan ketiga nama file muncul di daftar pratinjau.
   * Hapus salah satu file dari daftar (sisa 2 file) -> submit form.
   * Pastikan kedua berkas berhasil terunggah ke backend tanpa error.

4. **Pengujian FIX-05 (Ubah Nomor Telepon Pelapor):**
   * Buka drawer Sinkron HTS pada tiket pelanggan.
   * Ubah nomor telepon di kolom input dari `6281111` menjadi `6282222`.
   * Submit form -> periksa database tabel `Customer`: kolom `wa_number` berhasil diperbarui tanpa bentrok.

---

Dokumen ini menjadi acuan mutlak tahap implementasi kode perbaikan V4.2.
