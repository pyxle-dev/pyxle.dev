"""GET /api/docs-search?q=... — search the docs, returns Markdown for AI agents.

A lightweight ranked search over the generated docs manifest (title, headings,
keywords, path, body). Returns a Markdown list of matching pages linking their
``.md`` versions, so an agent can search and then fetch clean content. This is
the machine-readable companion to the site's in-page ⌘K search.
"""

import json
import os
import re
from pathlib import Path

from starlette.requests import Request
from starlette.responses import PlainTextResponse

DOCS_DIR = Path(os.getcwd()) / "public" / "docs-data"
BASE = "https://pyxle.dev"
MARKDOWN = "text/markdown; charset=utf-8"

_manifest = None


def _manifest_index():
    global _manifest
    if _manifest is None:
        path = DOCS_DIR / "manifest.json"
        _manifest = json.loads(path.read_text()) if path.exists() else {"searchIndex": []}
    return _manifest.get("searchIndex", [])


def _tokens(text):
    return [t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if t]


def _score(entry, terms):
    fields = (
        (10, entry.get("title")),
        (8, " ".join(entry.get("keywords") or [])),
        (6, entry.get("path")),
        (4, " ".join(entry.get("headings") or [])),
        (1, entry.get("searchText")),
    )
    lowered = [(weight, (value or "").lower()) for weight, value in fields]
    return sum(weight for term in terms for weight, value in lowered if term in value)


async def endpoint(request: Request) -> PlainTextResponse:
    query = (request.query_params.get("q") or "").strip()[:100]
    if not query:
        return PlainTextResponse(
            "# Pyxle docs search\n\n"
            f"Add a query, e.g. `{BASE}/api/docs-search?q=routing`. "
            f"Or fetch the whole docs: {BASE}/llms-full.txt\n",
            media_type=MARKDOWN,
        )

    terms = _tokens(query)
    ranked = sorted(
        ((_score(entry, terms), entry) for entry in _manifest_index()),
        key=lambda pair: pair[0],
        reverse=True,
    )
    hits = [entry for score, entry in ranked if score > 0][:10]

    lines = [f'# Search results for "{query}"', ""]
    if not hits:
        lines.append(
            f"No matching pages. Try broader terms, or read everything at {BASE}/llms-full.txt"
        )
    else:
        for entry in hits:
            desc = (entry.get("description") or "").strip()
            suffix = f" — {desc}" if desc else ""
            lines.append(f"- [{entry['title']}]({BASE}/docs/{entry['path']}.md){suffix}")
    lines.append("")
    return PlainTextResponse("\n".join(lines), media_type=MARKDOWN)
