# 🛡️ Spesifikasi Keamanan Sistem (Security Specification)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Status:** Produksi / Workflow V2

Dokumen ini mendefinisikan standar keamanan, arsitektur proteksi data, kontrol akses, dan mitigasi kerentanan yang diterapkan pada sistem Helpdesk HTS Chat Integration.

---

## 1. Autentikasi Pengguna (JWT & Hashing)

### A. Penyimpanan Kata Sandi
- Kata sandi pengguna tidak pernah disimpan dalam bentuk teks polos (*plaintext*).
- Setiap kata sandi dienkripsi menggunakan algoritma **`bcryptjs`** dengan nilai *salt round* = 10 sebelum disimpan ke database PostgreSQL.
- Verifikasi sandi saat login menggunakan fungsi `bcrypt.compare`.

### B. Mekanisme JSON Web Token (JWT)
- Sesi pengguna dikelola secara *stateless* menggunakan standar **JWT** (`jsonwebtoken`).
- **Payload Token:** Memuat identitas aman `{ id, role, category_id }` tanpa menyertakan data sensitif seperti password.
- **Masa Berlaku (*Expiration*):** Token berlaku selama **12 Jam**. Setelah masa berlaku habis, sesi otomatis kedaluwarsa dan pengguna diarahkan ke halaman login.
- **Transmisi:** Klien mengirimkan token melalui HTTP Header standar:
  ```http
  Authorization: Bearer <TOKEN_JWT>
  ```

---

## 2. Otorisasi & Hak Akses Berbasis Peran (RBAC)

Sistem menerapkan **Role-Based Access Control (RBAC)** ketat di level API Gateway dan Antarmuka Pengguna melalui middleware `verifyToken` dan `requireRole`.

### Matriks Hak Akses (Access Control Matrix)

| Fitur / Tindakan | ADMIN | L1 (Dispatcher) | L2 (Teknisi) | SPV (Supervisor) |
|---|:---:|:---:|:---:|:---:|
| **Login & Profil Diri** | ✅ | ✅ | ✅ | ✅ |
| **Melihat Antrean Umum (Unassigned)** | ✅ | ✅ | ❌ | ✅ |
| **Melihat Antrean Tiket Sesuai Kategori Tim** | ✅ | ✅ | ✅ (Hanya timnya) | ✅ |
| **Membalas Chat ke WhatsApp Pelapor** | ✅ | ✅ | ❌ (View-Only) | ✅ |
| **Mengirim Lampiran Gambar ke WhatsApp** | ✅ | ✅ | ❌ | ✅ |
| **Menugaskan Tiket (Multi-Assign ke L2)** | ✅ | ✅ | ❌ | ❌ |
| **Menulis Catatan Internal Tim** | ✅ | ✅ | ✅ | ✅ |
| **Tandai Selesai Penanganan Bagian Tim** | ✅ (Semua tim) | ❌ | ✅ (Bagian timnya) | ❌ |
| **Kembalikan / Lepas Penugasan Tim** | ✅ (Semua tim) | ❌ | ✅ (Bagian timnya) | ❌ |
| **Menutup Tiket Resmi (Mandatory Summary)** | ✅ | ✅ | ❌ | ❌ |
| **Melihat Rekap Aduan & Export CSV** | ✅ | ✅ | ❌ | ✅ |
| **Manajemen Pengguna (CRUD User)** | ✅ | ❌ | ❌ | ❌ |

---

## 3. Proteksi HTTP Headers (Helmet & CORS)

Backend Express dilindungi oleh pustaka **`helmet`** untuk mencegah kerentanan berbasis browser:

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "blob:", "*"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
```

1. **Cross-Origin Resource Policy (CORP: `cross-origin`):**  
   Mengizinkan aset media gambar di direktori `/uploads/` dimuat dengan aman oleh frontend yang berjalan di port terpisah (`5173`) atau diakses via IP jaringan lokal (LAN).
2. **Content Security Policy (CSP):**  
   Membatasi eksekusi skrip berbahaya (XSS) dan membatasi sumber unduhan media gambar hanya ke jalur yang sah.
3. **CORS (Cross-Origin Resource Sharing):**  
   Dikonfigurasi untuk mengizinkan permintaan API dari domain/IP frontend yang terdaftar.

---

## 4. Pembatasan Laju Permintaan (Rate Limiting) & Proteksi DoS

Untuk mencegah serangan *Brute Force* login dan *Denial of Service* (DoS), backend menerapkan **`express-rate-limit`**:
- **Batas Permintaan:** Maksimal **1.000 requests per 15 menit per IP address**.
- **Pengecualian Webhook:** Rute `/api/webhook` dikecualikan secara eksplisit dari pembatasan laju (*skip rate limiting*) agar transmisi lalu lintas pesan masuk dari WhatsApp Gateway (Evolution API) tidak pernah terputus atau terhambat.

---

## 5. Validasi & Sanitasi Unggahan Berkas (Media Upload Security)

Pengunggahan gambar lampiran (Fase 3 & Media Engine) dikelola dengan aturan ketat via Multer:
1. **File Type Filtering:** Hanya menerima tipe MIME gambar yang sah:
   - `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/webp`
   - Berkas biner berbahaya (`.exe`, `.sh`, `.php`, `.js`) ditolak di level parser.
2. **Batas Ukuran Berkas:** Maksimal **10 MB per file gambar**.
3. **Penyimpanan Acak & Sanitasi Ekstensi:** File disimpan dengan nama acak berbasis timestamp (`img_<timestamp>.<ext>`) untuk mencegah *Path Traversal attack* (`../../`).
4. **Body Parser Sizing:** Kapasitas parser JSON disetel ke **50 MB** (`express.json({ limit: '50mb' })`) guna memastikan payload webhook berukuran besar dari Evolution API dapat diproses tanpa mengalami `PayloadTooLargeError`.

---

## 6. Isolasi Lingkungan Data (Database Isolation)

Sistem memisahkan database operasional menjadi dua wadah terisolasi:
1. **`wa_helpdesk`:** Database internal aplikasi helpdesk (tiket, pesan, pengguna, pelanggan). Hanya dapat diakses oleh Backend Node.js.
2. **`evolution_db`:** Database terpisah khusus untuk *session storage* dan *cache* Evolution API.

Isolasi ini menjamin bahwa jika terjadi masalah pada koneksi WhatsApp atau Evolution API, data riwayat tiket dan akun petugas helpdesk tetap aman dan tidak mengalami kerusakan relasi.
