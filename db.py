"""pyxle.dev's data layer, on the pyxle-db plugin.

The plugin (configured in ``pyxle.config.json``) opens ``data/pyxle.db``
at startup, applies ``migrations/`` (checksum-tracked), and registers the
shared async ``Database``. This module is the one place that talks to it —
pages import these functions and never touch SQL themselves.

Schema lives in ``migrations/0001-initial-schema.sql``, not here. Every
function is async: callers ``await`` them from ``@server`` loaders,
``@action`` handlers, and API routes.

Timestamps are bound as aware-UTC ``datetime`` objects; pyxle-db's SQLite
adapter stores them as ``YYYY-MM-DD HH:MM:SS.ffffff`` TEXT, which compares
correctly as strings (the adoption migration normalised pre-plugin rows
into the same format).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from pyxle_db import IntegrityError, get_database

# ── Subscribers ───────────────────────────────────────────────


async def add_subscriber(email: str) -> bool:
    """Insert a new subscriber. Returns ``True`` on success, ``False`` if
    the email already exists (UNIQUE COLLATE NOCASE on the column)."""
    db = get_database()
    try:
        await db.execute(
            "INSERT INTO subscribers (email, subscribed_at) VALUES (?, ?)",
            (email, datetime.now(tz=timezone.utc)),
        )
        return True
    except IntegrityError:
        return False


async def subscriber_exists(email: str) -> bool:
    db = get_database()
    row = await db.fetchone("SELECT 1 FROM subscribers WHERE email = ?", (email,))
    return row is not None


async def subscriber_count() -> int:
    db = get_database()
    row = await db.fetchone("SELECT COUNT(*) AS n FROM subscribers")
    return int(row["n"]) if row else 0


async def get_all_subscribers() -> list[dict]:
    """All subscribers, most recent first."""
    db = get_database()
    rows = await db.fetchall(
        "SELECT id, email, subscribed_at FROM subscribers ORDER BY subscribed_at DESC"
    )
    return [row.asdict() for row in rows]


# ── Playground ────────────────────────────────────────────────


async def increment_reaction(emoji: str) -> int:
    """Atomically increment the reaction count for *emoji*; return the new count."""
    db = get_database()
    async with db.transaction() as tx:
        await tx.execute(
            "INSERT INTO playground_reactions (emoji, count) VALUES (?, 1) "
            "ON CONFLICT(emoji) DO UPDATE SET count = count + 1",
            (emoji,),
        )
        row = await tx.fetchone(
            "SELECT count FROM playground_reactions WHERE emoji = ?", (emoji,)
        )
    return int(row["count"]) if row else 1


async def get_reactions() -> dict[str, int]:
    """``{emoji: count}`` for all recorded reactions."""
    db = get_database()
    rows = await db.fetchall("SELECT emoji, count FROM playground_reactions")
    return {row["emoji"]: int(row["count"]) for row in rows}


async def increment_playground_views() -> int:
    """Atomically bump and return the playground page-view counter."""
    db = get_database()
    async with db.transaction() as tx:
        await tx.execute(
            "INSERT INTO playground_stats (key, value) VALUES ('views', 1) "
            "ON CONFLICT(key) DO UPDATE SET value = value + 1"
        )
        row = await tx.fetchone(
            "SELECT value FROM playground_stats WHERE key = 'views'"
        )
    return int(row["value"]) if row else 0


# ── Rate limiting ─────────────────────────────────────────────


async def check_rate_limit(
    ip: str,
    *,
    scope: str,
    max_attempts: int = 5,
    window_seconds: int = 3600,
) -> bool:
    """``True`` if *ip* is within the limit for *scope*, ``False`` if blocked.

    Buckets are independent per ``(ip, scope)`` tuple, so exhausting one
    feature's quota never spills into another. The whole check —
    opportunistic GC of expired rows (all scopes), the count, and the
    attempt insert — runs in one transaction, so concurrent calls can't
    slip past the limit between the count and the insert. The out-of-band
    sweep in ``scripts/cleanup_rate_limits.py`` handles scopes that see
    no traffic.
    """
    db = get_database()
    now = datetime.now(tz=timezone.utc)
    cutoff = now - timedelta(seconds=window_seconds)
    async with db.transaction() as tx:
        await tx.execute("DELETE FROM rate_limits WHERE attempted_at < ?", (cutoff,))
        row = await tx.fetchone(
            "SELECT COUNT(*) AS n FROM rate_limits "
            "WHERE ip = ? AND scope = ? AND attempted_at >= ?",
            (ip, scope, cutoff),
        )
        if row and int(row["n"]) >= max_attempts:
            return False
        await tx.execute(
            "INSERT INTO rate_limits (ip, attempted_at, scope) VALUES (?, ?, ?)",
            (ip, now, scope),
        )
    return True


# ── Request helpers (no database) ─────────────────────────────


def get_client_ip(request: object) -> str:
    """Return the real client IP for rate-limit bucketing.

    Production traffic flows ``browser -> Cloudflare -> nginx -> Starlette``.
    Starlette's ``request.client.host`` shows the immediate peer -- the
    local nginx proxy or the Cloudflare edge -- which is useless for
    per-visitor rate limiting because:

    - Cloudflare edges rotate across requests, so a single user can fan
      out across many edge IPs within seconds.
    - Every visitor on the site shares the same nginx proxy IP (127.0.0.1
      from Starlette's perspective).

    The only trustworthy real-IP signal on a Cloudflare-fronted origin is
    the ``CF-Connecting-IP`` header, which Cloudflare sets on every
    request and scrubs if the client sends it themselves. ``X-Forwarded-For``
    is a reasonable secondary fallback for other reverse proxies; its
    leftmost entry is the original client. ``request.client.host`` is the
    last-resort fallback for local development, where neither header is
    set and the user IS the peer.

    Returns ``"unknown"`` only as a final safety net; callers pass the
    return value straight into ``check_rate_limit`` as the bucket key.
    """

    headers = getattr(request, "headers", None)
    if headers is not None:
        cf_ip = headers.get("cf-connecting-ip")
        if cf_ip:
            cf_ip = cf_ip.strip()
            if cf_ip:
                return cf_ip
        forwarded = headers.get("x-forwarded-for")
        if forwarded:
            # ``X-Forwarded-For: client, proxy1, proxy2`` -- the leftmost
            # entry is the original client.
            first = forwarded.split(",")[0].strip()
            if first:
                return first
    client = getattr(request, "client", None)
    host = getattr(client, "host", None) if client is not None else None
    return host or "unknown"
