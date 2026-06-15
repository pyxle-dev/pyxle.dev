-- Unsubscribe support for subscribers.
--
-- Three nullable columns, added in place — the production table already holds
-- live subscriber rows, and ALTER TABLE ADD COLUMN with no default is a safe,
-- data-preserving change (existing rows get NULL). Runs once, checksum-tracked.
--
--   unsubscribed_at      — when they unsubscribed (NULL = active subscriber)
--   unsubscribe_reason   — optional preset reason category, collected after the
--                          unsubscribe (never required to unsubscribe)
--   unsubscribe_feedback — optional free-text feedback
--   welcome_email_sent   — 0/1, flipped to 1 only after the welcome email
--                          actually sends, so it goes out once per subscriber
--                          and a retry/backfill never double-sends. Existing
--                          rows (which predate the welcome email) get 0.
--
-- The unsubscribe link itself carries no token column: it's a stateless HMAC
-- of the row id, verified with the app secret (see db.py).

ALTER TABLE subscribers ADD COLUMN unsubscribed_at TEXT;
ALTER TABLE subscribers ADD COLUMN unsubscribe_reason TEXT;
ALTER TABLE subscribers ADD COLUMN unsubscribe_feedback TEXT;
ALTER TABLE subscribers ADD COLUMN welcome_email_sent INTEGER NOT NULL DEFAULT 0;
