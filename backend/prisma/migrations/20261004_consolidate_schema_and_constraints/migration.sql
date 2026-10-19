-- Migration: Consolidate Schema, Enums, Tables & Integrity Constraints (DB-001, DB-002, DB-004, DB-005)

-- 1. Enum Updates (Idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ADMIN' AND enumtypid = 'Role'::regtype) THEN
    ALTER TYPE "Role" ADD VALUE 'ADMIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RESOLVED' AND enumtypid = 'TicketStatus'::regtype) THEN
    ALTER TYPE "TicketStatus" ADD VALUE 'RESOLVED';
  END IF;
END $$;

-- Create ServiceType enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceType') THEN
    CREATE TYPE "ServiceType" AS ENUM ('TROUBLESHOOTING', 'REQUEST_LAYANAN', 'MONITORING', 'GENERAL_CHAT');
  END IF;
END $$;

-- 2. Create Category & Migrate Division
CREATE TABLE IF NOT EXISTS "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "wa_target_number" TEXT,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Division') THEN
    INSERT INTO "Category" ("id", "name")
    SELECT "id", "name" FROM "Division"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;

-- 3. Create CategoryContact
CREATE TABLE IF NOT EXISTS "CategoryContact" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL REFERENCES "Category"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "wa_target" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryContact_pkey" PRIMARY KEY ("id")
);

-- 4. Create Setting
CREATE TABLE IF NOT EXISTS "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- 5. Update User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "category_id" INTEGER REFERENCES "Category"("id") ON DELETE SET NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hts_email" TEXT;

-- 6. Create HtsUserSession
CREATE TABLE IF NOT EXISTS "HtsUserSession" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
    "cookie_data" TEXT NOT NULL,
    "is_logged_in" BOOLEAN NOT NULL DEFAULT false,
    "last_login" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HtsUserSession_pkey" PRIMARY KEY ("id")
);

-- 7. Update Customer table
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "is_custom_name" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "is_imported_contact" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "wa_push_name" TEXT;

-- 8. Update Ticket table
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "service_type" "ServiceType" DEFAULT 'GENERAL_CHAT';
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "is_aduan" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "hts_ticket_id" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "hts_ticket_no" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "hts_ticket_status" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "hts_pic_ids" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "hts_synced_at" TIMESTAMP(3);

-- 9. Create TicketCategory & Migrate TicketDivision
CREATE TABLE IF NOT EXISTS "TicketCategory" (
    "ticket_id" INTEGER NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE,
    "category_id" INTEGER NOT NULL REFERENCES "Category"("id") ON DELETE CASCADE,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "solution" TEXT,
    CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("ticket_id","category_id")
);
CREATE INDEX IF NOT EXISTS "TicketCategory_category_id_idx" ON "TicketCategory"("category_id");

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'TicketDivision') THEN
    INSERT INTO "TicketCategory" ("ticket_id", "category_id")
    SELECT "ticket_id", "division_id" FROM "TicketDivision"
    ON CONFLICT ("ticket_id", "category_id") DO NOTHING;
  END IF;
END $$;

-- 10. Create TicketHts
CREATE TABLE IF NOT EXISTS "TicketHts" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE,
    "category_id" INTEGER REFERENCES "Category"("id") ON DELETE SET NULL,
    "hts_ticket_id" TEXT NOT NULL,
    "hts_ticket_no" TEXT NOT NULL,
    "hts_ticket_status" TEXT NOT NULL DEFAULT 'PENDING',
    "hts_kategori" TEXT NOT NULL DEFAULT 'troubleshoot',
    "hts_sub_kategori" TEXT,
    "hts_detil" TEXT,
    "hts_pic_ids" TEXT,
    "solution" TEXT,
    "attachment_urls" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solved_at" TIMESTAMP(3),
    CONSTRAINT "TicketHts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TicketHts_ticket_id_idx" ON "TicketHts"("ticket_id");
CREATE INDEX IF NOT EXISTS "TicketHts_hts_ticket_no_idx" ON "TicketHts"("hts_ticket_no");

-- 11. Create QuickReply
CREATE TABLE IF NOT EXISTS "QuickReply" (
    "id" SERIAL NOT NULL,
    "shortcut" TEXT NOT NULL UNIQUE,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);

-- 12. Update Message table
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "is_internal" BOOLEAN NOT NULL DEFAULT false;

-- 13. Integrity Constraints (DB-004 & DB-005)
-- Partial unique index: 1 active ticket (OPEN / RESOLVED) per customer
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_ticket_per_customer"
ON "Ticket" ("customer_id")
WHERE "status" IN ('OPEN', 'RESOLVED');

-- Compound unique constraint on TicketHts (ticket_id, hts_ticket_no)
CREATE UNIQUE INDEX IF NOT EXISTS "TicketHts_ticket_id_hts_ticket_no_key"
ON "TicketHts" ("ticket_id", "hts_ticket_no");
