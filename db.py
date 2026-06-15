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

import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

from pyxle_db import IntegrityError, get_database

# ── Subscribers ───────────────────────────────────────────────


async def add_subscriber(email: str) -> bool:
    """Insert a subscriber, or reactivate a previously-unsubscribed one.

    Returns ``True`` if they're now subscribed (new row, or an unsubscribed
    row brought back), ``False`` only when the email is already an *active*
    subscriber. Reactivation clears any prior unsubscribe reason/feedback so a
    returning subscriber starts clean."""
    db = get_database()
    try:
        await db.execute(
            "INSERT INTO subscribers (email, subscribed_at) VALUES (?, ?)",
            (email, datetime.now(tz=timezone.utc)),
        )
        return True
    except IntegrityError:
        # Email already exists. If it's unsubscribed, bring it back; if it's
        # active, this is a genuine duplicate.
        row = await db.fetchone(
            "SELECT id, unsubscribed_at FROM subscribers WHERE email = ?", (email,)
        )
        if row is None:  # pragma: no cover - lost a race; treat as duplicate
            return False
        if row["unsubscribed_at"] is None:
            return False
        await db.execute(
            "UPDATE subscribers SET unsubscribed_at = NULL, unsubscribe_reason = NULL, "
            "unsubscribe_feedback = NULL, subscribed_at = ? WHERE id = ?",
            (datetime.now(tz=timezone.utc), row["id"]),
        )
        return True


async def subscriber_exists(email: str) -> bool:
    db = get_database()
    row = await db.fetchone("SELECT 1 FROM subscribers WHERE email = ?", (email,))
    return row is not None


async def subscriber_count() -> int:
    """Active subscribers only — the honest 'current subscribers' number."""
    db = get_database()
    row = await db.fetchone(
        "SELECT COUNT(*) AS n FROM subscribers "
        "WHERE unsubscribed_at IS NULL AND suppressed_at IS NULL"
    )
    return int(row["n"]) if row else 0


async def get_all_subscribers() -> list[dict]:
    """All subscribers, most recent first — including unsubscribe state and
    feedback, for the admin panel."""
    db = get_database()
    rows = await db.fetchall(
        "SELECT id, email, subscribed_at, unsubscribed_at, unsubscribe_reason, "
        "unsubscribe_feedback, welcome_email_sent, suppressed_at, suppression_reason "
        "FROM subscribers ORDER BY subscribed_at DESC"
    )
    return [row.asdict() for row in rows]


# ── Unsubscribe ───────────────────────────────────────────────

# Categories the unsubscribe page offers. Stored verbatim; "other" pairs with
# the free-text box. Kept here so the page and the validation share one source.
UNSUBSCRIBE_REASONS = (
    "too_many_emails",
    "not_relevant",
    "didnt_signup",
    "inbox_cleanup",
    "other",
)
_MAX_FEEDBACK_CHARS = 1000


def _unsubscribe_secret() -> str:
    """The key the unsubscribe HMAC is signed with. Reuses the app's
    ``PYXLE_SECRET_KEY`` (the same secret the framework signs CSRF tokens
    with). In production it is always set; the dev fallback only keeps local
    links working when it isn't, and is never used for anything security-
    critical (an unsubscribe link reveals nothing and only toggles a flag)."""
    secret = os.environ.get("PYXLE_SECRET_KEY")
    if secret:
        return secret
    return "pyxle-dev-insecure-unsubscribe-key"  # local-dev only


def make_unsubscribe_token(subscriber_id: int) -> str:
    """A stateless, per-subscriber HMAC — no token column needed. The link
    carries the row id (not the email, keeping PII out of the URL) plus this
    signature, so it can't be forged or pointed at another subscriber."""
    digest = hmac.new(
        _unsubscribe_secret().encode("utf-8"),
        f"unsubscribe:{int(subscriber_id)}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest[:32]


def verify_unsubscribe_token(subscriber_id: int, token: str) -> bool:
    """Constant-time check that *token* matches *subscriber_id*."""
    try:
        expected = make_unsubscribe_token(int(subscriber_id))
    except (TypeError, ValueError):
        return False
    return hmac.compare_digest(expected, token or "")


async def get_subscriber(subscriber_id: int) -> dict | None:
    db = get_database()
    row = await db.fetchone(
        "SELECT id, email, unsubscribed_at, welcome_email_sent "
        "FROM subscribers WHERE id = ?",
        (int(subscriber_id),),
    )
    return row.asdict() if row else None


async def mark_welcome_email_sent(subscriber_id: int) -> None:
    """Flip the flag once the welcome email has actually gone out, so it's
    sent at most once per subscriber even across retries or a backfill."""
    db = get_database()
    await db.execute(
        "UPDATE subscribers SET welcome_email_sent = 1 WHERE id = ?",
        (int(subscriber_id),),
    )


async def unsubscribe(subscriber_id: int) -> bool:
    """Mark a subscriber unsubscribed. Idempotent — re-unsubscribing is a
    no-op and still returns ``True``. Returns ``False`` only if the id is
    unknown."""
    db = get_database()
    row = await get_subscriber(subscriber_id)
    if row is None:
        return False
    if row["unsubscribed_at"] is None:
        await db.execute(
            "UPDATE subscribers SET unsubscribed_at = ? WHERE id = ?",
            (datetime.now(tz=timezone.utc), int(subscriber_id)),
        )
    return True


async def resubscribe(subscriber_id: int) -> bool:
    """Undo an unsubscribe — clears the flag and any recorded reason/feedback."""
    db = get_database()
    row = await get_subscriber(subscriber_id)
    if row is None:
        return False
    await db.execute(
        "UPDATE subscribers SET unsubscribed_at = NULL, unsubscribe_reason = NULL, "
        "unsubscribe_feedback = NULL WHERE id = ?",
        (int(subscriber_id),),
    )
    return True


async def record_unsubscribe_feedback(
    subscriber_id: int, reason: str, feedback: str = ""
) -> bool:
    """Store optional why-they-left feedback on an unsubscribed row. Ignores
    an unknown reason category and caps the free text."""
    db = get_database()
    row = await get_subscriber(subscriber_id)
    if row is None:
        return False
    clean_reason = reason if reason in UNSUBSCRIBE_REASONS else None
    clean_feedback = (feedback or "").strip()[:_MAX_FEEDBACK_CHARS] or None
    await db.execute(
        "UPDATE subscribers SET unsubscribe_reason = ?, unsubscribe_feedback = ? "
        "WHERE id = ?",
        (clean_reason, clean_feedback, int(subscriber_id)),
    )
    return True


# ── Delivery suppression (Resend webhooks) ────────────────────

# A hard bounce means the address rejected mail; a spam complaint means the
# recipient flagged us. Both stop further sends; a complaint also unsubscribes.
# Suppression is sticky — it is NOT cleared by re-subscribing (a dead or
# complaining address staying suppressed protects sender reputation); clearing
# it is a deliberate admin action.
SUPPRESSION_REASONS = ("hard_bounce", "spam_complaint")


async def suppress_email(email: str, reason: str) -> bool:
    """Mark an address undeliverable from a Resend bounce/complaint webhook.

    Idempotent: the original ``suppressed_at`` is preserved on repeat events. A
    spam complaint also sets ``unsubscribed_at`` (the recipient has opted out).
    Returns ``True`` if a subscriber row matched — unknown addresses are a no-op,
    since pyxle.dev only ever mails its own subscribers.
    """
    if reason not in SUPPRESSION_REASONS:
        raise ValueError(f"Unknown suppression reason: {reason!r}")
    db = get_database()
    now = datetime.now(tz=timezone.utc)
    email = email.strip().lower()
    if reason == "spam_complaint":
        affected = await db.execute(
            "UPDATE subscribers SET suppressed_at = COALESCE(suppressed_at, ?), "
            "suppression_reason = ?, unsubscribed_at = COALESCE(unsubscribed_at, ?) "
            "WHERE email = ?",
            (now, reason, now, email),
        )
    else:
        affected = await db.execute(
            "UPDATE subscribers SET suppressed_at = COALESCE(suppressed_at, ?), "
            "suppression_reason = ? WHERE email = ?",
            (now, reason, email),
        )
    return affected > 0


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
