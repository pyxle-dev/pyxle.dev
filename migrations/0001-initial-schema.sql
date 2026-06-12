-- pyxle.dev schema — adopted from the pre-plugin hand-rolled db.py.
--
-- Every CREATE is IF NOT EXISTS because this migration's first run in
-- production happens against a LIVE database that already has all four
-- tables and their data (subscribers, reaction counts, view counters).
-- Adoption must be a no-op for structure and a zero-loss event for data.
--
-- The UPDATEs at the bottom normalise legacy timestamp strings: the old
-- code stored ISO-8601 with a 'T' separator and '+00:00' offset, while
-- pyxle-db's SQLite adapter writes 'YYYY-MM-DD HH:MM:SS.ffffff' (UTC,
-- space-separated). TEXT-ordering comparisons only stay correct if the
-- column holds ONE format, so legacy rows are rewritten on adoption.
-- On a fresh database both UPDATEs match zero rows.

CREATE TABLE IF NOT EXISTS subscribers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    subscribed_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS playground_reactions (
    emoji TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS playground_stats (
    key   TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rate_limits (
    ip           TEXT NOT NULL,
    attempted_at TEXT NOT NULL,
    scope        TEXT NOT NULL DEFAULT ''
);

UPDATE subscribers
   SET subscribed_at = REPLACE(REPLACE(subscribed_at, 'T', ' '), '+00:00', '')
 WHERE subscribed_at LIKE '%T%';

UPDATE rate_limits
   SET attempted_at = REPLACE(REPLACE(attempted_at, 'T', ' '), '+00:00', '')
 WHERE attempted_at LIKE '%T%';
