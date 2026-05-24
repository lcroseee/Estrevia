-- Migration 0014: A/B test variant column for paywall_teaser email
--
-- Adds paywall_teaser_variant to email_leads.
-- NULL = pre-experiment row (created before this migration); excluded from
-- experiment analysis. New rows get 'A' | 'B' | 'C' at INSERT time.
--
-- No NOT NULL constraint — existing 200+ rows must remain valid without backfill.
-- No DEFAULT — explicit NULL is intentional and distinguishable from assigned variants.

ALTER TABLE "email_leads" ADD COLUMN "paywall_teaser_variant" text;
