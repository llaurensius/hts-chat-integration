# 👥 Daftar Akun & Kredensial Pengguna (Default User Credentials)

Dokumen ini memuat daftar akun bawaan (*seed accounts*) yang tersedia untuk keperluan pengujian dan operasional sistem **HTS Chat Integration**.

---

## 🔑 Informasi Kredensial Utama

Semua akun bawaan di bawah ini menggunakan kata sandi standar yang sama:
> **Default Password:** `password123`

---

## 📋 Tabel Akun Pengguna

| Peran (Role) | Nama Pengguna | Alamat Email | Kategori / Tim | Hak Akses Utama |
|---|---|---|:---:|---|
| **ADMIN** | Administrator | `admin@helpdesk.go.id` | - | Akses penuh (L1 + L2), Menu Manajemen Pengguna, Kontak Tim L2, Hapus Rekap Aduan (Batch & Reset) |
| **L1 (Dispatcher)** | Dispatcher L1 | `l1@helpdesk.go.id` | - | Chat ke Pelapor WA, Lampiran Gambar, Multi-Assign L2, Auto-Reply Bot, Tutup Tiket Resmi |
| **SPV (Supervisor)** | Supervisor | `spv@helpdesk.go.id` | - | Monitoring Antrean Tiket, Akses Rekapitulasi Aduan, Export Laporan ke CSV |
| **L2 (Network)** | Teknisi Network L2 | `l2_network@helpdesk.go.id` | Network | View-Only Chat Pelapor, Catatan Internal berlabel Tim Network, Tandai Selesai, Lepas Penugasan |
| **L2 (Server)** | Teknisi Server L2 | `l2_server@helpdesk.go.id` | Server | View-Only Chat Pelapor, Catatan Internal berlabel Tim Server, Tandai Selesai, Lepas Penugasan |
| **L2 (M&E)** | Teknisi M&E L2 | `l2_me@helpdesk.go.id` | Mechanical & Electrical | View-Only Chat Pelapor, Catatan Internal berlabel Tim M&E, Tandai Selesai, Lepas Penugasan |

---

## 🛡️ Matriks Hak Akses Berdasarkan Role

| Fitur / Halaman | L1 Dispatcher | L2 Teknisi | SPV Supervisor | ADMIN |
|---|:---:|:---:|:---:|:---:|
| **Kirim Balasan Chat ke Pelapor** | ✅ | ❌ | ❌ | ✅ |
| **Kirim Lampiran Gambar ke Pelapor** | ✅ | ❌ | ❌ | ✅ |
| **Tugaskan / Tambah Tim L2 (Multi-Assign)**| ✅ | ❌ | ❌ | ✅ |
| **Pengaturan Template & Toggle Auto-Reply Bot** | ✅ | ❌ | ❌ | ❌ |
| **Tulis Catatan Internal Tim** | ✅ | ✅ | ❌ | ✅ |
| **Tandai Selesai Bagian Tim (`is_resolved`)** | ❌ | ✅ | ❌ | ✅ |
| **Lepas / Kembalikan Tiket ke L1** | ❌ | ✅ | ❌ | ✅ |
| **Selesaikan / Tutup Tiket Resmi** | ✅ | ❌ | ❌ | ✅ |
| **Lihat Rekap Hasil Aduan & Export CSV** | ✅ | ❌ | ✅ | ✅ |
| **Hapus Data Aduan (Terpilih / Semua Data)** | ❌ | ❌ | ❌ | ✅ |
| **Manajemen Kontak & Nomor WA Blast L2** | ❌ | ❌ | ❌ | ✅ |
| **Manajemen Pengguna (User Management)** | ❌ | ❌ | ❌ | ✅ |

---

## 💡 Tips Pengujian Multi-Role

Untuk menguji interaksi *real-time* antar pengguna:
1. Buka dua atau lebih jendela peramban (*browser*) yang berbeda atau gunakan mode *Incognito/Private Window*.
2. Jendela 1: Login sebagai `l1@helpdesk.go.id` (memantau aduan masuk dan mendelegasikan tugas).
3. Jendela 2: Login sebagai `l2_network@helpdesk.go.id` atau `l2_server@helpdesk.go.id` (menerima tugas, menulis catatan internal, dan menandai selesai).
4. Jendela 3: Login sebagai `admin@helpdesk.go.id` (mengelola tim kontak dan data testing).