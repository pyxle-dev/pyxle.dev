"""Email templates for pyxle.dev, as plain Python functions.

pyxle-mail is transport only — it sends rendered ``html``/``text`` and has no
template engine (by design). So the markup lives here, in the repo, as a
function returning ``(subject, html, text)``. It is hand-written, inline-styled,
and table-based **on purpose**: email clients (Outlook's Word engine, Gmail
stripping ``<style>`` blocks, no reliable flexbox/grid) are a hostile, separate
rendering target from the site's Tailwind/React, so none of that is reused here.

Light background, generous spacing, one accent — deliberately plain and robust,
which also reads less like spam than a heavy dark template. The welcome email is
written as a personal note from the founder; the sender identity (from address,
display name, reply-to) is set via ``PYXLE_MAIL_*`` env vars, not here, so the
copy stays domain-agnostic.
"""

from __future__ import annotations

_ACCENT = "#059669"
_INK = "#141915"
_INK2 = "#5b625a"
_PAPER = "#faf9f6"
_CARD = "#ffffff"
_RULE = "#e7e5df"

# Paragraph and link styles, kept as constants so the long f-string below stays
# readable. Email clients need these inline on every element.
_P = (
    f"margin:0 0 18px 0;font-family:-apple-system,Helvetica,Arial,sans-serif;"
    f"font-size:16px;line-height:1.7;color:{_INK2};"
)
_LINK = f"color:{_ACCENT};text-decoration:underline;"


def welcome_email(unsubscribe_url: str) -> tuple[str, str, str]:
    """The subscriber welcome email — a personal note from the founder.

    Returns ``(subject, html, text)``. The only dynamic input is the
    unsubscribe URL: it goes in the visible footer link here, and the caller
    also puts it in the ``List-Unsubscribe`` header for one-click unsubscribe.
    The "reply straight to me" line is honoured by the ``PYXLE_MAIL_REPLY_TO``
    (shivam@pyxle.dev) the service sets on the message.
    """
    subject = "A quick note from me — welcome to Pyxle"

    html = f"""\
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Welcome to Pyxle</title>
</head>
<body style="margin:0;padding:0;background:{_PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

  <tr><td style="padding:8px 8px 24px 8px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding-right:9px;vertical-align:middle;">
        <img src="https://pyxle.dev/branding/pyxle-mark.png" width="30" height="30" alt="" style="display:block;border:0;outline:none;text-decoration:none;" />
      </td>
      <td style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:{_INK};letter-spacing:-0.01em;">Pyxle<span style="color:{_ACCENT};">.</span></td>
    </tr></table>
  </td></tr>

  <tr><td style="background:{_CARD};border:1px solid {_RULE};border-radius:12px;padding:32px;">
    <p style="{_P}">Hi there,</p>

    <p style="{_P}">
      I'm Shivam — I built Pyxle, and I wanted to say thanks personally for
      signing up. It genuinely means a lot this early on.
    </p>

    <p style="{_P}">
      Pyxle came out of a frustration I could never shake. Building a web app in
      Python always meant a compromise I didn't like: stay in Python with Django
      or Flask and bolt a separate JavaScript frontend on top — two languages,
      two toolchains, a pile of glue code — or leave Python behind entirely for
      the JS world. So I set out to build a third option:
      <span style="color:{_INK};font-weight:600;">write your Python and your React in the same file.</span>
    </p>

    <p style="{_P}">
      Your data loading and mutations (<code style="font-family:ui-monospace,Menlo,monospace;font-size:14px;color:{_INK};">@server</code>,
      <code style="font-family:ui-monospace,Menlo,monospace;font-size:14px;color:{_INK};">@action</code>)
      sit right next to the component that uses them, in one
      <code style="font-family:ui-monospace,Menlo,monospace;font-size:14px;color:{_INK};">.pyxl</code> file —
      server-rendered, hot-reloading, on plain ASGI. No magic, no lock-in, and it
      still feels like real Python and real React.
    </p>

    <p style="{_P}">
      It's early and fully open source (MIT), and it's getting better every week.
      I'll only email you when there's something genuinely worth your time — a
      real release, a benchmark, a new plugin. Never noise.
    </p>

    <p style="{_P}">
      If you want to poke around, the quickstart takes about five minutes:
      <a href="https://pyxle.dev/docs/getting-started/installation" style="{_LINK}">pyxle.dev/docs</a>.
    </p>

    <p style="margin:0 0 8px 0;font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.7;color:{_INK2};">
      And one real thing: this isn't a no-reply address. If you build something
      with Pyxle, hit a rough edge, or just want to say hi —
      <span style="color:{_INK};">just reply to this email.</span> It comes straight to me.
    </p>

    <p style="margin:28px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:{_INK};">Shivam</p>
    <p style="margin:2px 0 0 0;font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:13px;color:{_INK2};">Shivam Saini &middot; Founder, Pyxle</p>
  </td></tr>

  <tr><td style="padding:24px 8px 8px 8px;">
    <p style="margin:0;font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:{_INK2};">
      You're getting this because you subscribed at
      <a href="https://pyxle.dev" style="color:{_INK2};">pyxle.dev</a>. Not for you?
      <a href="{unsubscribe_url}" style="color:{_INK2};text-decoration:underline;">Unsubscribe in one click</a>
      — no hard feelings.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""

    text = (
        "Hi there,\n\n"
        "I'm Shivam — I built Pyxle, and I wanted to say thanks personally for "
        "signing up. It genuinely means a lot this early on.\n\n"
        "Pyxle came out of a frustration I could never shake. Building a web app "
        "in Python always meant a compromise I didn't like: stay in Python with "
        "Django or Flask and bolt a separate JavaScript frontend on top — two "
        "languages, two toolchains, a pile of glue code — or leave Python behind "
        "entirely for the JS world. So I set out to build a third option: write "
        "your Python and your React in the same file.\n\n"
        "Your data loading and mutations (@server, @action) sit right next to the "
        "component that uses them, in one .pyxl file — server-rendered, "
        "hot-reloading, on plain ASGI. No magic, no lock-in, and it still feels "
        "like real Python and real React.\n\n"
        "It's early and fully open source (MIT), and it's getting better every "
        "week. I'll only email you when there's something genuinely worth your "
        "time — a real release, a benchmark, a new plugin. Never noise.\n\n"
        "If you want to poke around, the quickstart takes about five minutes:\n"
        "https://pyxle.dev/docs/getting-started/installation\n\n"
        "And one real thing: this isn't a no-reply address. If you build something "
        "with Pyxle, hit a rough edge, or just want to say hi — just reply to this "
        "email. It comes straight to me.\n\n"
        "Shivam\n"
        "Shivam Saini · Founder, Pyxle\n\n"
        "--\n"
        "You're getting this because you subscribed at pyxle.dev.\n"
        f"Unsubscribe in one click: {unsubscribe_url}\n"
    )
    return subject, html, text
