"""Resend webhook receiver — list hygiene from delivery events.

Resend POSTs signed events here (configured in the Resend dashboard). We act on
the two that protect sender reputation:

  email.bounced     → the address rejected mail permanently  → suppress it
  email.complained  → the recipient marked us as spam         → suppress + unsubscribe

Every request is verified against the endpoint's Svix signing secret
(``PYXLE_RESEND_WEBHOOK_SECRET``, ``whsec_…``) before we touch the database —
an unsigned or stale request is rejected, so a missing secret fails closed.
The endpoint is CSRF-exempt (see ``pyxle.config.json``); the signature *is* the
authentication. Handling is idempotent, so Resend's at-least-once retries are
safe.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time

from starlette.requests import Request
from starlette.responses import JSONResponse, Response

_logger = logging.getLogger("pyxle_dev")

_SECRET = os.environ.get("PYXLE_RESEND_WEBHOOK_SECRET", "")
# Reject events whose timestamp is more than this far from now (replay defence).
_TOLERANCE_SECONDS = 300

# Resend event type → our suppression reason (db.SUPPRESSION_REASONS).
_SUPPRESS_EVENTS = {
    "email.bounced": "hard_bounce",
    "email.complained": "spam_complaint",
}


def _signing_key(secret: str) -> bytes:
    """The raw HMAC key from a Svix secret (``whsec_<base64>`` or bare base64)."""
    raw = secret.split("_", 1)[1] if secret.startswith("whsec_") else secret
    return base64.b64decode(raw)


def _expected_signature(secret: str, svix_id: str, svix_timestamp: str, body: str) -> str:
    """Svix v1 signature: base64(HMAC-SHA256(key, "id.timestamp.body"))."""
    signed = f"{svix_id}.{svix_timestamp}.{body}".encode("utf-8")
    digest = hmac.new(_signing_key(secret), signed, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def verify_signature(
    secret: str,
    svix_id: str,
    svix_timestamp: str,
    svix_signature: str,
    body: str,
    *,
    now: float | None = None,
    tolerance: int = _TOLERANCE_SECONDS,
) -> bool:
    """Constant-time Svix verification with timestamp tolerance.

    ``svix_signature`` is a space-separated list of ``v<n>,<b64sig>`` tokens; we
    accept if any ``v1`` signature matches. Returns ``False`` (never raises) for
    any malformed input, so a bad request is simply rejected.
    """
    if not (secret and svix_id and svix_timestamp and svix_signature):
        return False
    try:
        ts = int(svix_timestamp)
    except (TypeError, ValueError):
        return False
    current = time.time() if now is None else now
    if abs(current - ts) > tolerance:
        return False
    try:
        expected = _expected_signature(secret, svix_id, svix_timestamp, body)
    except Exception:  # noqa: BLE001 - malformed secret/body → reject
        return False
    for token in svix_signature.split(" "):
        version, _, provided = token.partition(",")
        if version == "v1" and provided and hmac.compare_digest(provided, expected):
            return True
    return False


def _recipients(data: dict) -> list[str]:
    """The address(es) an event refers to, from the event ``data.to``."""
    to = data.get("to")
    if isinstance(to, str):
        return [to]
    if isinstance(to, list):
        return [addr for addr in to if isinstance(addr, str)]
    return []


async def endpoint(request: Request) -> Response:
    if request.method != "POST":
        return JSONResponse({"ok": False, "error": "method not allowed"}, status_code=405)

    if not _SECRET:
        # Fail closed: never process an unverifiable event.
        _logger.error("resend webhook: PYXLE_RESEND_WEBHOOK_SECRET is not set")
        return JSONResponse({"ok": False, "error": "webhook not configured"}, status_code=503)

    body = (await request.body()).decode("utf-8", "replace")
    if not verify_signature(
        _SECRET,
        request.headers.get("svix-id", ""),
        request.headers.get("svix-timestamp", ""),
        request.headers.get("svix-signature", ""),
        body,
    ):
        return JSONResponse({"ok": False, "error": "invalid signature"}, status_code=401)

    try:
        event = json.loads(body)
    except ValueError:
        return JSONResponse({"ok": False, "error": "invalid json"}, status_code=400)

    event_type = event.get("type", "")
    reason = _SUPPRESS_EVENTS.get(event_type)
    if reason:
        from db import suppress_email

        data = event.get("data") or {}
        for addr in _recipients(data):
            try:
                await suppress_email(addr, reason)
            except Exception:  # noqa: BLE001 - one bad address must not 500 the hook
                _logger.warning("resend webhook: suppress failed for an address", exc_info=True)
        _logger.info("resend webhook: %s → suppressed %d address(es)", event_type, len(_recipients(data)))

    # Always 2xx for a verified event (including types we don't act on) so Resend
    # stops retrying. Unhandled types are simply acknowledged.
    return JSONResponse({"ok": True})
