# 🗄️ Rancangan Database & Skema Relasional (ERD)
**Proyek:** HTS Chat Integration (WhatsApp Helpdesk to Web Ticketing System)  
**Database Engine:** PostgreSQL 15 (Prisma ORM)  
**Status:** Produksi / Workflow V3 (Multi-Assign, Service Type & Full HTS Diskomdigi Integration)

---

## 1. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    Customer ||--o{ Ticket : "membuat"
    Category ||--o{ User : "memiliki teknisi"
    Category ||--o{ TicketCategory : "ditugaskan ke"
    Category ||--o{ CategoryContact : "memiliki kontak blast"
    Ticket ||--o{ TicketCategory : "memiliki tim"
    Ticket ||--o{ Message : "memiliki percakapan"
    User ||--o{ Message : "mengirim"
    User ||--o| HtsUserSession : "memiliki sesi HTS"

    Customer {
        int id PK
        string wa_number "Unique"
        string name
        string skpd_name "Nullable"
        boolean is_custom_name "Status diedit manual via Dashboard (Default: false)"
        datetime created_at
    }

    Category {
        int id PK
        string name "Network, Server, M&E"
        string wa_target_number "Target WA Blast L2"
    }

    User {
        int id PK
        string name
        string email "Unique"
        string password "Hashed bcrypt"
        Role role "ADMIN, L1, L2, SPV"
        int category_id FK "Nullable (Khusus L2)"
        string hts_email "Email akun portal HTS (Nullable)"
    }

    HtsUserSession {
        int id PK
        int user_id FK "Unique (1 User - 1 Sesi)"
        string cookie_data "JSON Cookie PHP ci_session & CSRF"
        boolean is_logged_in "Status login portal HTS"
        datetime last_login "Waktu terakhir login HTS"
        datetime updated_at
    }

    Ticket {
        int id PK
        int customer_id FK
        TicketStatus status "OPEN, RESOLVED, CLOSED"
        ServiceType service_type "TROUBLESHOOTING, REQUEST_LAYANAN, MONITORING"
        string summary "Kesimpulan Penanganan (Nullable)"
        string hts_ticket_id "ID Trouble numerik HTS (Nullable)"
        string hts_ticket_no "Nomor tiket resmi HTS (Nullable)"
        string hts_ticket_status "Status HTS: UNSUBMITTED, INPUT_PIC, PENDING, SOLVED"
        string hts_pic_ids "JSON daftar ID PIC penerima & penanganan HTS (Nullable)"
        datetime hts_synced_at "Waktu sinkronisasi ke HTS (Nullable)"
        datetime created_at
        datetime closed_at "Nullable"
    }

    TicketCategory {
        int ticket_id PK, FK
        int category_id PK, FK
        boolean is_resolved "Status selesai per tim (Default: false)"
        datetime resolved_at "Waktu selesai per tim"
        string solution "Catatan solusi teknis dari L2 (Nullable)"
    }

    CategoryContact {
        int id PK
        int category_id FK
        string name "Nama personil / grup"
        string wa_target "Nomor WA / ID Grup"
        datetime created_at
    }

    Setting {
        string key PK "auto_reply"
        string value "Template teks"
        boolean is_active "Toggle ON/OFF"
        datetime updated_at
    }

    Message {
        int id PK
        int ticket_id FK
        SenderType sender_type "CUSTOMER, AGENT, BOT"
        int sender_id "Nullable (User ID agen jika AGENT)"
        string message_text "Isi chat / catatan"
        string attachment_url "Path gambar di /uploads/ (Nullable)"
        boolean is_internal "Penanda Catatan Khusus L2 (Default: false)"
        datetime created_at
    }
```

---

## 2. Struktur Tabel & Rincian Kolom

### A. Tabel `Customer` (Pelanggan / Pelapor)
Menyimpan identitas kontak WhatsApp yang menghubungi sistem.
| Kolom | Tipe Data | Atribut | Keterangan |
|---|---|---|---|
| `id` | `Int` | PK, Auto Increment | ID unik pelanggan |
| `wa_number` | `String` | Unique, Not Null | Nomor WhatsApp tanpa simbol (misal `628123456789`) |
| `name` | `String` | Not Null | Nama pelapor (Prioritas: Web Custom > Kontak HP > pushName WA > waNumber) |
| `skpd_name` | `String` | Nullable | Nama instansi / dinas / SKPD pelapor |
| `is_custom_name` | `Boolean` | Default `false` | Menandai jika identitas telah diedit manual via Dashboard |
| `created_at` | `DateTime` | Default `now()` | Waktu pertama kali kontak dibuat |

---

### B. Tabel `Category` (Tim Teknisi / Kategori Masalah)
Menggantikan model *Division* lama. Merepresentasikan 3 pilar utama tim penanganan teknis L2.
| Kolom | Tipe Data | Atribut | Keterangan |
|---|---|---|---|
| `id` | `Int` | PK, Auto Increment | ID kategori tim |
| `name` | `String` | Not Null | Nama tim (`Network`, `Server`, `Mechanical & Electrical (M&E)`) |
| `wa_target_number` | `String` | Nullable | Nomor WhatsApp teknisi/grup untuk notifikasi otomatis (*Blast*) |

---

### C. Tabel `User` (Pengguna Tim Helpdesk)
Menyimpan data akun petugas Helpdesk (Admin, Dispatcher L1, Teknisi L2, dan Supervisor).
| Kolom | Tipe Data | Atribut | Keterangan |
|---|---|---|---|
| `id` | `Int` | PK, Auto Increment | ID unik akun |
| `name` | `String` | Not Null | Nama lengkap pengguna |
| `email` | `String` | Unique, Not Null | Alamat email untuk login internal Helpdesk |
| `password` | `String` | Not Null | Password yang dienkripsi menggunakan `bcryptjs` (salt 10) |
| `role` | `Role` (Enum) | Default `L2` | Peran pengguna: `ADMIN`, `L1`, `L2`, `SPV` |
| `category_id` | `Int` | FK, Nullable | Relasi ke `Category` (Wajib diisi untuk teknisi L2) |
| `hts_email` | `String` | Nullable | Email akun resmi petugas pada portal HTS Diskomdigi |

---

### D. Tabel `HtsUserSession` (Sesi Login Portal HTS Petugas)
Menyimpan cookie sesi aktif PHP (`ci_session`) dan CSRF token portal HTS untuk setiap petugas.
| Kolom | Tipe Data | Atribut | Keterangan |
|---|---|---|---|
| `id` | `Int` | PK, Auto Increment | ID sesi |
| `user_id` | `Int` | FK, Unique, Not Null | Relasi 1-to-1 ke `User` (`onDelete: Cascade`) |
| `cookie_data` | `String (Text)` | Not Null | JSON serialisasi cookie PHP CodeIgniter dan CSRF token |
| `is_logged_in`| `Boolean` | Default `false` | Status keaktifan sesi di portal HTS |
| `last_login` | `DateTime` | Default `now()` | Waktu login terakhir ke portal HTS |
| `updated_at` | `DateTime` | Auto Update | Waktu update cookie / refresh |

---

### E. Tabel `Ticket` (Tiket Aduan & Sinkronisasi HTS)
Entitas pusat penanganan keluhan pelanggan dari awal masuk hingga selesai dan ditutup, terintegrasi penuh ke portal HTS Diskomdigi.
| Kolom | Tipe Data | Atribut | Keterangan |
|---|---|---|---|
| `id` | `Int` | PK, Auto Increment | Nomor referensi tiket lokal Helpdesk |
| `customer_id` | `Int` | FK, Not Null | Relasi ke `Customer` |
| `status` | `TicketStatus` | Default `OPEN` | Status siklus hidup tiket: `OPEN`, `RESOLVED`, `CLOSED` |
| `service_type` | `ServiceType` | Nullable | Jenis layanan: `TROUBLESHOOTING`, `REQUEST_LAYANAN`, `MONITORING` |
| `summary` | `String` | Nullable | Kesimpulan akhir penanganan kendala yang diisi L1 saat penutupan (min 10 karakter) |
| `hts_ticket_id`| `String` | Nullable | ID Trouble numerik asli di portal HTS (contoh: `"2025"`) |
| `hts_ticket_no`| `String` | Nullable | Nomor aduan resmi HTS (contoh: `"2025-TShoot-2026-jateng-09"`) |
| `hts_ticket_status`| `String` | Nullable | Status di HTS: `UNSUBMITTED`, `INPUT_PIC`, `PENDING`, `SOLVED` |
| `hts_pic_ids` | `String` | Nullable | JSON array ID PIC penerima & penanganan HTS (contoh: `["14","8"]`) |
| `hts_synced_at`| `DateTime` | Nullable | Waktu terakhir tiket disinkronkan ke portal HTS |
| `created_at` | `DateTime` | Default `now()` | Waktu aduan masuk |
| `closed_at` | `DateTime` | Nullable | Waktu tiket resmi ditutup oleh L1 |

---

### F. Tabel `TicketCategory` (Multi-Assign & Status Solusi Per-Tim)
Tabel pivot yang menghubungkan tiket dengan satu atau lebih Tim L2, mencatat status `is_resolved` serta teks solusi teknis per tim.
| Kolom | Tipe Data | Atribut | Keterangan |
|---|---|---|---|
| `ticket_id` | `Int` | PK, FK | Relasi ke `Ticket` |
| `category_id` | `Int` | PK, FK | Relasi ke `Category` |
| `is_resolved` | `Boolean` | Default `false` | Menandakan apakah tim spesifik ini sudah menyelesaikan tugasnya |
| `resolved_at` | `DateTime` | Nullable | Waktu teknisi tim terkait menandai selesai |
| `solution` | `String (Text)` | Nullable | Catatan solusi teknis dari teknisi L2 saat klik Tandai Selesai |

> **Logika Status Tiket:**  
> Ketika tiket ditugaskan ke beberapa tim (misal `Network` dan `Server`), tiket utama tetap `OPEN` selama masih ada tim dengan `is_resolved = false`. Begitu **seluruh** tim terkait telah mengubah `is_resolved = true`, status tiket utama otomatis berubah menjadi `RESOLVED`. Saat L1 menutup tiket, solusi dari seluruh tim otomatis diagregasikan sebagai draf kesimpulan penutupan.

---

### G. Tabel `Message` (Histori Percakapan & Catatan Internal)
Menyimpan seluruh jejak komunikasi, baik pesan masuk pelapor, pesan keluar agen, pesan bot, lampiran gambar, dan catatan internal L2.
| Kolom | Tipe Data | Atribut | Keterangan |
|---|---|---|---|
| `id` | `Int` | PK, Auto Increment | ID pesan |
| `ticket_id` | `Int` | FK, Not Null | Relasi ke `Ticket` |
| `sender_type` | `SenderType` | Not Null | Tipe pengirim: `CUSTOMER`, `AGENT`, `BOT` |
| `sender_id` | `Int` | FK, Nullable | Relasi ke `User` (`onDelete: SetNull`) untuk mencatat identitas agen/teknisi pengirim |
| `message_text` | `String` | Nullable | Isi teks pesan obrolan atau catatan |
| `attachment_url`| `String` | Nullable | Path relatif file gambar/lampiran (misal `/uploads/img_1790595960337.jpg`) |
| `is_internal` | `Boolean` | Default `false` | `true` jika pesan adalah **Catatan Internal L2** (tidak dikirim ke WA pelapor) |
| `created_at` | `DateTime` | Default `now()` | Waktu pesan dibuat |

---

### H. Tabel `CategoryContact` (Daftar Kontak WhatsApp Blast Tim L2)
Menyimpan daftar target nomor WhatsApp personil teknisi maupun ID grup WhatsApp untuk broadcast notifikasi penugasan tiket.
| Kolom | Tipe Data | Atribut | Keterangan |
|---|---|---|---|
| `id` | `Int` | PK, Auto Increment | ID unik kontak |
| `category_id` | `Int` | FK, Not Null | Relasi ke `Category` (`onDelete: Cascade`) |
| `name` | `String` | Not Null | Nama personil teknisi (misal: "Budi") atau nama grup (misal: "Grup WA Network") |
| `wa_target` | `String` | Not Null | Nomor WhatsApp format internasional (`628xxx`) atau ID grup (`xxx@g.us`) |
| `created_at` | `DateTime` | Default `now()` | Waktu pendaftaran kontak |

---

### I. Tabel `Setting` (Konfigurasi Dinamis Sistem)
Menyimpan konfigurasi dinamis yang dapat diubah dari dasbor web tanpa merestart server.
| Kolom | Tipe Data | Atribut | Keterangan |
|---|---|---|---|
| `key` | `String` | PK | Kunci konfigurasi unik (misal: `auto_reply`) |
| `value` | `String (Text)`| Not Null | Nilai konfigurasi (template teks sambutan bot) |
| `is_active` | `Boolean` | Default `true` | Sakelar status ON / OFF |
| `updated_at` | `DateTime` | Auto Update | Waktu terakhir konfigurasi diubah |

---

## 3. Rincian Enum (Tipe Data Konstan)

1. **`Role`**:
   - `ADMIN`: Hak akses penuh (melihat antrean L1 & L2, CRUD User, CRUD Kontak Tim L2, Hapus Rekap Aduan).
   - `L1`: Dispatcher (chat ke pelapor, assign ke L2, sinkronisasi HTS, kustomisasi Auto-Reply Bot, menutup tiket resmi).
   - `L2`: Teknisi lapangan (mode baca aduan, catatan internal tim, resolve per-tim dengan catatan solusi, return penugasan).
   - `SPV`: Supervisor (monitoring antrean dan laporan rekap).
2. **`TicketStatus`**:
   - `OPEN`: Tiket aktif baru masuk atau sedang dalam penanganan teknisi L2.
   - `RESOLVED`: Seluruh tim L2 yang ditugaskan telah menandai pekerjaan selesai; menunggu L1 menutup tiket.
   - `CLOSED`: Tiket telah resmi diselesaikan dan ditutup oleh L1 beserta kesimpulan penanganan.
3. **`SenderType`**:
   - `CUSTOMER`: Pesan masuk dari WhatsApp pelapor.
   - `AGENT`: Pesan keluar yang diketik oleh petugas Helpdesk atau notifikasi catatan sistem.
   - `BOT`: Pesan balasan otomatis sambutan (*Auto-Reply*).
4. **`ServiceType`**:
   - `TROUBLESHOOTING`: Penanganan gangguan atau kerusakan teknis (memiliki Sub-Kategori di HTS).
   - `REQUEST_LAYANAN`: Permintaan konfigurasi, instalasi, atau permohonan akses (tanpa Sub-Kategori di HTS).
   - `MONITORING`: Pemantauan rutin performa jaringan atau server (tanpa Sub-Kategori di HTS).

---

## 4. Pengelolaan Sequence & Reset Nomor ID
Untuk keperluan pembersihan data testing (*Fresh State Cleanup*), PostgreSQL menggunakan urutan *Sequence*:
- `Ticket_id_seq`
- `Message_id_seq`
- `Customer_id_seq`

Saat Admin mengeksekusi fitur **"Hapus Semua Data"**, selain menghapus seluruh baris data, sistem menjalankan:
```sql
ALTER SEQUENCE "Ticket_id_seq" RESTART WITH 1;
ALTER SEQUENCE "Message_id_seq" RESTART WITH 1;
ALTER SEQUENCE "Customer_id_seq" RESTART WITH 1;
```
Hal ini memastikan tiket dan aduan baru berikutnya akan **selalu mengulang penomoran mulai dari ID 1**.
