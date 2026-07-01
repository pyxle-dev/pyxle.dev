"""Root AI hooks for pyxle.dev.

``wrap_markdown`` frames every ``.md`` response (docs and marketing pages alike)
with a short header/footer telling an AI agent how to read, navigate, and search
the site. Pyxle calls it after resolving a page's markdown.
"""

BASE = "https://pyxle.dev"


def wrap_markdown(ctx, markdown):
    """Prepend/append agent navigation + search instructions to a page's markdown."""
    canonical = f"{BASE}{ctx.path}"
    header = (
        "<!-- Pyxle · Markdown for AI agents -->\n"
        f"> This is the Markdown rendition of {canonical}, served for AI agents and assistants.\n"
        "> Append `.md` to any pyxle.dev URL to fetch its Markdown; the links below already do.\n"
        f"> Index of every page: {BASE}/llms.txt · Whole docs in one file: {BASE}/llms-full.txt\n"
        f"> Search the docs: {BASE}/api/docs-search?q=YOUR+QUERY (returns matching pages as Markdown links)\n"
    )
    footer = (
        "\n---\n"
        f"> Human (HTML) version of this page: {canonical}\n"
        f"> Keep exploring: {BASE}/llms.txt (index) · {BASE}/llms-full.txt (everything) · "
        f"{BASE}/api/docs-search?q= (search)\n"
    )
    return f"{header}\n{markdown.rstrip()}\n{footer}"
