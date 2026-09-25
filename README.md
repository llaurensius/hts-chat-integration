# 💬 HTS Chat Integration (WhatsApp to Web Helpdesk)

Repositori ini memuat seluruh **Dokumentasi Teknis, Spesifikasi Sistem, dan Arsitektur** untuk proyek pembuatan Web Helpdesk / Ticketing System yang terintegrasi langsung dengan WhatsApp.

Sistem ini dirancang untuk memfasilitasi komunikasi keluhan dari instansi (via WhatsApp) untuk dikelola oleh Agen L1 (Dispatcher) dan Agen L2 (Teknis) melalui Web Dashboard menggunakan fitur *Live Chat real-time*.

---

## 📂 Daftar Dokumen Teknis

Berikut adalah struktur dokumentasi yang telah disepakati untuk pengembangan proyek ini:

1. **[Product Requirements Document (PRD)](PRD_WhatsApp_Helpdesk.md)** - Kebutuhan bisnis, User Persona, *Acceptance Criteria*, dan fitur inti.
2. **[Arsitektur & Tech Stack](Tech_Stack_Architecture.md)** - Topologi komunikasi dan tumpukan teknologi yang digunakan.
3. **[Database Schema / ERD](Database_Schema.md)** - Desain relasional tabel PostgreSQL, termasuk tabel pivot untuk penanganan multi-kendala.
4. **[Spesifikasi API Endpoints](API_Endpoints_Spec.md)** - Payload kontrak untuk *Webhook* WhatsApp dan *REST API Internal*.
5. **[Konsep Antarmuka & Wireframe](UI_Wireframe_Concept.md)** - Spesifikasi *layout 3-panel* untuk halaman *Live Chat*.
6. **[Flowchart Sistem](System_Flowcharts.md)** - Diagram alur untuk pesan masuk, *blast notifikasi*, dan re-eskalasi tiket.
7. **[Spesifikasi Keamanan](Security_Specification.md)** - Standar Autentikasi (JWT) dan Hak Akses (RBAC).
8. **[Panduan Deployment](Deployment_Guide.md)** - Panduan Docker Compose untuk infrastruktur server dan *Evolution API*.

---

## 🚀 Tumpukan Teknologi (Tech Stack)

Sistem ini direkomendasikan dan akan dibangun menggunakan:
*   **WA Gateway:** Evolution API (Self-Hosted via Docker)
*   **Backend:** Node.js (Express.js) + Socket.io (WebSocket untuk *real-time chat*)
*   **Frontend:** React.js + Tailwind CSS
*   **Database:** PostgreSQL

---

## 🎯 Status Proyek
**Fase:** Dokumentasi / Perancangan Sistem (*System Design & Brainstorming*)
**Target Rilis:** 14 Hari (Sprint)
