"""Admin endpoint to view and export newsletter subscribers.

Protected by HTTP Basic Auth.
"""

from __future__ import annotations

import base64
import csv
import hmac
import io
import os
from html import escape

from starlette.requests import Request
from starlette.responses import HTMLResponse, PlainTextResponse, Response

_USERNAME = os.environ.get("PYXLE_ADMIN_USERNAME", "admin")
_PASSWORD = os.environ.get("PYXLE_ADMIN_PASSWORD", "")


def _check_auth(request: Request) -> bool:
    if not _PASSWORD:
        return False  # no password configured — always reject
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(auth[6:]).decode("utf-8")
        user, password = decoded.split(":", 1)
    except Exception:
        return False
    # Constant-time comparison defeats remote timing attacks against the
    # credential check. Must evaluate BOTH comparisons every call (no short-
    # circuit) so the total time is independent of which field is wrong.
    user_ok = hmac.compare_digest(user, _USERNAME)
    password_ok = hmac.compare_digest(password, _PASSWORD)
    return user_ok and password_ok


def _require_auth() -> Response:
    return PlainTextResponse(
        "Unauthorized",
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="Pyxle Admin"'},
    )


async def _get_subscribers() -> list[dict]:
    from db import get_all_subscribers
    return await get_all_subscribers()


# Human labels for the stored unsubscribe reason categories
# (db.UNSUBSCRIBE_REASONS). Unknown values fall back to the raw value, escaped.
_REASON_LABELS = {
    "too_many_emails": "Too many emails",
    "not_relevant": "Not relevant",
    "didnt_signup": "Didn't sign up",
    "inbox_cleanup": "Inbox cleanup",
    "other": "Other",
}


def _csv_safe(value: object) -> str:
    """Neutralise spreadsheet formula injection in an exported cell.

    Subscriber feedback is attacker-influenced free text, and a cell that
    begins with ``= + - @`` (or a leading control char) is run as a formula
    when the CSV is opened in Excel or Google Sheets. Prefixing a single quote
    forces the value to be treated as literal text. Harmless for normal data.
    """
    text = "" if value is None else str(value)
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


_STATUS_COLORS = {
    "active": "#4ade80",
    "unsubscribed": "#f87171",
    "bounced": "#fb923c",
    "complained": "#f87171",
}


def _status(sub: dict) -> str:
    """Coarse delivery status for a subscriber, most-severe first. A spam
    complaint also flags unsubscribed; a hard bounce is a suppression."""
    if sub.get("suppression_reason") == "spam_complaint":
        return "complained"
    if sub.get("suppression_reason") == "hard_bounce":
        return "bounced"
    if sub["unsubscribed_at"]:
        return "unsubscribed"
    return "active"


async def endpoint(request: Request) -> Response:
    if not _check_auth(request):
        return _require_auth()

    fmt = request.query_params.get("format", "html")

    subscribers = await _get_subscribers()

    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "id", "email", "status", "subscribed_at", "unsubscribed_at",
            "unsubscribe_reason", "unsubscribe_feedback", "welcome_email_sent",
            "suppressed_at", "suppression_reason",
        ])
        for sub in subscribers:
            writer.writerow([
                _csv_safe(sub["id"]),
                _csv_safe(sub["email"]),
                _status(sub),
                _csv_safe(sub["subscribed_at"]),
                _csv_safe(sub["unsubscribed_at"]),
                _csv_safe(sub["unsubscribe_reason"]),
                _csv_safe(sub["unsubscribe_feedback"]),
                _csv_safe(sub["welcome_email_sent"]),
                _csv_safe(sub["suppressed_at"]),
                _csv_safe(sub["suppression_reason"]),
            ])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=pyxle-subscribers.csv"},
        )

    total = len(subscribers)
    suppressed = sum(1 for s in subscribers if s["suppressed_at"])
    unsubscribed = sum(1 for s in subscribers if s["unsubscribed_at"] and not s["suppressed_at"])
    active = total - suppressed - unsubscribed

    td = "padding:8px 16px;border-bottom:1px solid #222;vertical-align:top"
    rows_html = ""
    for sub in subscribers:
        is_unsubbed = bool(sub["unsubscribed_at"])
        st = _status(sub)
        status = f'<span style="color:{_STATUS_COLORS[st]}">{st.capitalize()}</span>'
        welcome = "✓" if sub["welcome_email_sent"] else "—"
        unsubbed_at = escape(sub["unsubscribed_at"]) if is_unsubbed else "—"
        reason_raw = sub["unsubscribe_reason"]
        reason = escape(_REASON_LABELS.get(reason_raw, reason_raw)) if reason_raw else "—"
        feedback = escape(sub["unsubscribe_feedback"]) if sub["unsubscribe_feedback"] else "—"
        rows_html += (
            f"<tr>"
            f'<td style="{td}">{sub["id"]}</td>'
            f'<td style="{td}">{escape(sub["email"])}</td>'
            f'<td style="{td}">{status}</td>'
            f'<td style="{td};text-align:center">{welcome}</td>'
            f'<td style="{td};color:#a1a1aa;white-space:nowrap">{escape(sub["subscribed_at"])}</td>'
            f'<td style="{td};color:#a1a1aa;white-space:nowrap">{unsubbed_at}</td>'
            f'<td style="{td}">{reason}</td>'
            f'<td style="{td};max-width:280px;word-break:break-word;color:#d4d4d8">{feedback}</td>'
            f"</tr>"
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Subscribers - Pyxle Admin</title>
  <meta name="robots" content="noindex, nofollow" />
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0b; color: #e4e4e7; padding: 32px; }}
    h1 {{ font-size: 24px; font-weight: 600; margin-bottom: 8px; }}
    .meta {{ color: #71717a; margin-bottom: 24px; }}
    .actions {{ margin-bottom: 24px; display: flex; gap: 12px; }}
    .btn {{ display: inline-block; padding: 8px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; }}
    .btn-primary {{ background: #22c55e; color: #000; }}
    .btn-secondary {{ background: #27272a; color: #e4e4e7; border: 1px solid #3f3f46; }}
    table {{ width: 100%; border-collapse: collapse; background: #18181b; border-radius: 8px; overflow: hidden; }}
    th {{ padding: 12px 16px; text-align: left; background: #27272a; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa; }}
    td {{ font-size: 14px; }}
    .empty {{ text-align: center; padding: 48px; color: #71717a; }}
  </style>
</head>
<body>
  <h1>Newsletter Subscribers</h1>
  <p class="meta">{active} active &middot; {unsubscribed} unsubscribed &middot; {suppressed} suppressed &middot; {total} total</p>
  <div class="actions">
    <a href="/api/subscribers?format=csv" class="btn btn-primary">Download CSV</a>
    <a href="/api/subscribers" class="btn btn-secondary">Refresh</a>
  </div>
  <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Email</th>
          <th>Status</th>
          <th style="text-align:center">Welcome</th>
          <th>Subscribed</th>
          <th>Unsubscribed</th>
          <th>Reason</th>
          <th>Feedback</th>
        </tr>
      </thead>
      <tbody>
        {rows_html if rows_html else '<tr><td colspan="8" class="empty">No subscribers yet.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>"""

    return HTMLResponse(html)
