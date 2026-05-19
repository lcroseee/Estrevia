-- Curiosity-hook rebuild: renumber nurture_step + update partial index.
-- Applied via `npm run db:migrate` after coordination with founder.

-- 1. Renumber existing leads: shift steps 1..6 by +1.
--    Step=0 stays 0 (initial state unchanged).
--    Step=1 (T+0 sent, waiting T+24h) → step=2 (T+1h sent, waiting T+24h).
--      Existing pre-deploy leads skip T+1h intentionally — no back-fill.
--    All other steps shift +1 to preserve semantic state in the new schema.
--    nurture_next_at is NOT modified — existing timestamps remain valid.
UPDATE email_leads
SET nurture_step = nurture_step + 1
WHERE nurture_step BETWEEN 1 AND 6;

-- 2. Drop old partial index and recreate with new step bound.
--    OLD covered steps 0,1,2 (early high-frequency drip pre-rebuild).
--    NEW covers steps 0,1,2,3 (T+0, T+1h, T+24h, T+72h — early window).
DROP INDEX IF EXISTS "email_leads_nurture_due_idx";

CREATE INDEX "email_leads_nurture_due_idx"
  ON "email_leads" USING btree ("nurture_next_at")
  WHERE nurture_step < 4 AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL AND email_undeliverable = false;

-- Note: sent_lead_emails.email_type column has no SQL CHECK constraint —
-- the enum lives at TypeScript level in schema.ts. No ALTER TABLE needed
-- to accept the new 'lead_curiosity_hook' value (text column accepts any).
