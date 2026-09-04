-- Homepage guestbook — "your localhost, simulated honestly".
--
-- Every visitor gets a PRIVATE guestbook: rows are keyed by a random
-- per-browser visitor id (the `pyxle_gb` cookie, a crypto.randomUUID()),
-- so one visitor can never read another's entries and the page publishes
-- zero user-generated content. The SSR of `/` renders only the authored
-- seed entries (which live in code, not here — db.py::SEED_ENTRIES), so
-- the loader stays visitor-independent and the route's 60s edge cache
-- stays valid. db.py::recent / db.py::add are the only readers/writers
-- (named so the homepage's printed specimen calls the site's real API);
-- rows are pruned to the visitor's newest 7 and swept after 90 days.

CREATE TABLE IF NOT EXISTS guestbook_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor    TEXT NOT NULL,
    name       TEXT NOT NULL,
    note       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guestbook_visitor
    ON guestbook_entries (visitor, id);
