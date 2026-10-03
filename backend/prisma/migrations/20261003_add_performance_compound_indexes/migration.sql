-- Migration: Add Compound Performance Indexes (DATA-04)

-- 1. Index gabungan customer_id dan status untuk query riwayat dan tiket aktif per customer
CREATE INDEX IF NOT EXISTS "Ticket_customer_id_status_idx" ON "Ticket"("customer_id", "status");

-- 2. Index compound status, is_aduan, dan created_at DESC untuk filter antrean tiket aktif & sorting
CREATE INDEX IF NOT EXISTS "Ticket_status_is_aduan_created_at_idx" ON "Ticket"("status", "is_aduan", "created_at" DESC);

-- 3. Index pencarian nama dan OPD pada Customer
CREATE INDEX IF NOT EXISTS "Customer_name_idx" ON "Customer"("name");
CREATE INDEX IF NOT EXISTS "Customer_skpd_name_idx" ON "Customer"("skpd_name");
