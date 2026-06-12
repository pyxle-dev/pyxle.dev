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


async def endpoint(request: Request) -> Response:
    if not _check_auth(request):
        return _require_auth()

    fmt = request.query_params.get("format", "html")

    subscribers = await _get_subscribers()

    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "email", "subscribed_at"])
        for sub in subscribers:
            writer.writerow([sub["id"], sub["email"], sub["subscribed_at"]])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=pyxle-subscribers.csv"},
        )

    count = len(subscribers)
    rows_html = ""
    for sub in subscribers:
        rows_html += (
            f"<tr>"
            f'<td style="padding:8px 16px;border-bottom:1px solid #222">{sub["id"]}</td>'
            f'<td style="padding:8px 16px;border-bottom:1px solid #222">{escape(sub["email"])}</td>'
            f'<td style="padding:8px 16px;border-bottom:1px solid #222">{escape(sub["subscribed_at"])}</td>'
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
  <p class="meta">{count} subscriber{"s" if count != 1 else ""} total</p>
  <div class="actions">
    <a href="/api/subscribers?format=csv" class="btn btn-primary">Download CSV</a>
    <a href="/api/subscribers" class="btn btn-secondary">Refresh</a>
  </div>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Email</th>
        <th>Subscribed At</th>
      </tr>
    </thead>
    <tbody>
      {rows_html if rows_html else '<tr><td colspan="3" class="empty">No subscribers yet.</td></tr>'}
    </tbody>
  </table>
</body>
</html>"""

    return HTMLResponse(html)
