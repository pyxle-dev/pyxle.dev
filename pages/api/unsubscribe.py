"""One-click unsubscribe endpoint (RFC 8058).

This is the target of the welcome email's ``List-Unsubscribe`` header with
``List-Unsubscribe-Post: List-Unsubscribe=One-Click`` — Gmail/Yahoo and other
clients POST here to unsubscribe instantly, with no page and no login. It is
CSRF-exempt (see ``pyxle.config.json``) because the caller is an external mail
provider with no session; it is protected instead by the HMAC token in the URL.

Humans who click the visible link in the email body land on the ``/unsubscribe``
page instead, which shows a confirm button (and the optional feedback prompt).
"""

from __future__ import annotations

from starlette.requests import Request
from starlette.responses import PlainTextResponse, Response


async def endpoint(request: Request) -> Response:
    if request.method not in ("POST", "GET"):
        return PlainTextResponse("Method not allowed", status_code=405)

    # id/token may arrive as query params (the header URL) or form fields.
    params = dict(request.query_params)
    if request.method == "POST":
        try:
            form = await request.form()
            params.update({k: str(v) for k, v in form.items()})
        except Exception:  # noqa: BLE001 - no/!form body is fine; use query params
            pass

    raw_id = params.get("id", "")
    token = params.get("token", "")

    from db import unsubscribe, verify_unsubscribe_token

    try:
        subscriber_id = int(raw_id)
    except (TypeError, ValueError):
        return PlainTextResponse("Invalid unsubscribe link.", status_code=400)

    if not verify_unsubscribe_token(subscriber_id, token):
        return PlainTextResponse("Invalid unsubscribe link.", status_code=400)

    await unsubscribe(subscriber_id)  # idempotent; True/False both fine here
    return PlainTextResponse("You have been unsubscribed.")
