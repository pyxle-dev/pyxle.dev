"""Directory-scoped markdown handler for the ``/docs`` subtree.

Appending ``.md`` to any docs URL (or sending ``Accept: text/markdown``) returns
the raw markdown source of that page — already stored per-page in
``public/docs-data`` by ``scripts/build-docs.mjs``. This handler covers the whole
``/docs`` route because it lives in ``pages/docs/llms.py`` (Pyxle resolves the
nearest-ancestor ``llms.py`` for a page's markdown).
"""

import json
import os
from pathlib import Path

DOCS_DIR = Path(os.getcwd()) / "public" / "docs-data"
DEFAULT_SLUG = "getting-started/introduction"
BASE = "https://pyxle.dev"


def _is_safe_slug(slug: str) -> bool:
    """Reject path-traversal attempts before joining the slug with DOCS_DIR."""
    if not slug:
        return True
    if "\\" in slug or "\0" in slug:
        return False
    if slug.startswith("/") or slug.startswith("."):
        return False
    return all(part and part != ".." for part in slug.split("/"))


def to_markdown(ctx):
    """Return a docs page's raw markdown, or ``None`` to fall through (redirect)."""
    slug = ctx.request.path_params.get("slug", "") or DEFAULT_SLUG
    if not _is_safe_slug(slug):
        return None
    page_path = DOCS_DIR / f"{slug}.json"
    try:
        page_path = page_path.resolve(strict=False)
        page_path.relative_to(DOCS_DIR.resolve())
    except (ValueError, OSError):
        return None
    if not page_path.is_file():
        return None

    data = json.loads(page_path.read_text(encoding="utf-8"))
    body = data.get("markdown")
    if body is None:
        return None

    # Docs-specific footer: previous/next pages as `.md` links so an agent can
    # walk the docs in order. (The universal agent header/footer comes from the
    # root pages/llms.py wrap_markdown hook.)
    nav = []
    prev, nxt = data.get("prev"), data.get("next")
    if prev:
        nav.append(f"- Previous: [{prev['title']}]({BASE}/docs/{prev['path']}.md)")
    if nxt:
        nav.append(f"- Next: [{nxt['title']}]({BASE}/docs/{nxt['path']}.md)")
    if nav:
        return body.rstrip() + "\n\n## Continue reading\n\n" + "\n".join(nav) + "\n"
    return body
