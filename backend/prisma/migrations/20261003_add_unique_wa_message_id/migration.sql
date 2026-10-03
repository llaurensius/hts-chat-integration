-- Clean up any historical duplicate wa_message_id keeping the earliest record
DELETE FROM "Message"
WHERE id IN (
    SELECT id
    FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY wa_message_id ORDER BY created_at ASC, id ASC) AS rnum
        FROM "Message"
        WHERE wa_message_id IS NOT NULL
    ) duplicates
    WHERE duplicates.rnum > 1
);

-- Drop legacy non-unique index
DROP INDEX IF EXISTS "Message_wa_message_id_idx";

-- Create unique index on wa_message_id (DATA-02)
CREATE UNIQUE INDEX IF NOT EXISTS "Message_wa_message_id_key" ON "Message"("wa_message_id");
