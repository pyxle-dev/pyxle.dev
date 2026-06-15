-- Delivery suppression for subscribers, driven by Resend webhooks.
--
-- A hard bounce or a spam complaint means we must STOP sending to an address,
-- independent of whether the person ever chose to unsubscribe. Two nullable
-- columns, added in place (data-preserving, existing rows get NULL):
--
--   suppressed_at      — when we suppressed the address (NULL = deliverable)
--   suppression_reason — why: 'hard_bounce' (address rejected mail) or
--                        'spam_complaint' (recipient marked us as spam). A
--                        complaint also sets unsubscribed_at — they asked.
--
-- Send-eligibility is therefore: unsubscribed_at IS NULL AND suppressed_at IS
-- NULL. Suppression protects sender reputation; it is set by
-- /api/resend-webhook after Svix-verifying the event (see db.py:suppress_email).

ALTER TABLE subscribers ADD COLUMN suppressed_at TEXT;
ALTER TABLE subscribers ADD COLUMN suppression_reason TEXT;
