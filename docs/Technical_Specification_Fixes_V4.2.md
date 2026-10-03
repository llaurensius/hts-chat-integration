# 🛠️ Spesifikasi Teknis Perbaikan Sistem (Technical Specification Fixes V4.2)

> [!NOTE]
> **STATUS DOKUMEN: TELAH DIKONSOLIDASIKAN & DIIMPLEMENTASIKAN (SUPERSEDED)**  
> Seluruh poin rencana perbaikan (FIX-01 hingga FIX-05) pada spesifikasi ini telah berhasil diintegrasikan ke dalam basis kode sumber dan diserap ke dalam dokumen acuan utama sistem:
> - Arsitektur & Keamanan $\rightarrow$ [`Architecture.md`](./Architecture.md)
> - Skema Data & Kontrak API $\rightarrow$ [`Database_and_API.md`](./Database_and_API.md)
> - Skenario & Hasil Verifikasi QA $\rightarrow$ [`QA_and_Quality.md`](./QA_and_Quality.md)
> - Panduan Operasional $\rightarrow$ [`Operations_and_Deployment.md`](./Operations_and_Deployment.md)

---

## 1. Riwayat & Rekapitulasi Status Perbaikan

| ID | Area Perbaikan | Status Implementasi di Kode | Dokumen Acuan Hidup (*Living Docs*) |
|---|---|:---:|---|
| **FIX-01** | **Unifikasi SSOT Kartu Tiket HTS & Tombol Unlink**<br/>Menghilangkan percabangan kartu legacy di antarmuka web, menyatukan sumber data ke array `activeTicket.hts_tickets`, dan memastikan tombol unlink aktif untuk setiap kartu. | ✅ **Terpasang** | [`Architecture.md`](./Architecture.md#34-c-dual-close-penutupan-tiket--selesaikan-di-hts) |
| **FIX-02** | **Universal Anti-Duplikat HTS**<br/>Mencegah pendaftaran nomor tiket HTS yang sama di dalam percakapan yang sama, baik melalui sinkronisasi tiket baru, penugasan delegasi, maupun tautan manual. | ✅ **Terpasang** | [`QA_and_Quality.md`](./QA_and_Quality.md#4-matriks-mitigasi-risiko--kasus-tepi-edge-cases) |
| **FIX-03** | **Pembersihan Master Data Kontak & Reset Sequence ID**<br/>Pengosongan tabel `Customer` dan me-reset urutan auto-increment ID (`Customer_id_seq`) kembali ke 1 dengan proteksi tiket aktif. | ✅ **Terpasang** | [`Database_and_API.md`](./Database_and_API.md#37-administrasi-sistem-apiadmin) |
| **FIX-04** | **Dukungan Multi-Foto Unggahan HTS**<br/>Pengiriman multi-lampiran gambar kendala (hingga 5 berkas) pada form sinkronisasi awal dan form penutupan tiket ke portal HTS. | ✅ **Terpasang** | [`Database_and_API.md`](./Database_and_API.md#34-manajemen-percakapan--tiket-apichat) |
| **FIX-05** | **Fleksibilitas Nomor Telepon Pelapor (Editable `wa_number`)**<br/>Pembaruan nomor kontak pelapor melalui endpoint `updateCustomer` dengan sanitasi format `628xxx` dan pengecekan bentrok constraint `@unique`. | ✅ **Terpasang** | [`Database_and_API.md`](./Database_and_API.md#34-manajemen-percakapan--tiket-apichat) |

---

## 2. Catatan Penutupan Spesifikasi
Dengan tuntasnya seluruh implementasi di atas pada rilis **Workflow V4.2 Produksi**, pengembang dan pemelihara sistem disarankan merujuk langsung ke berkas arsitektur dan operasional utama yang diperbarui secara berkala. Dokumen ini dipertahankan murni sebagai arsip rekam jejak teknis.
