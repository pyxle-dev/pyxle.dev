"""Server-side syntax highlighting for the docs' code frames.

The docs pipeline (pages/docs/[[...slug]].pyxl) renders generated article
HTML server-side; every fenced code block passes through here on its way
into a frame. Highlighting therefore costs nothing in the browser — the
SSR document already carries the finished token spans and the client
ships no tokenizer for the docs.

One contract: ``highlight_block(code, lang)`` takes RAW (unescaped)
source and returns escaped HTML, or ``None`` for languages it does not
own (the caller keeps its quiet comment treatment for those — bash and
the config formats).

Three engines behind it:

* Python runs through the stdlib's own ``tokenize`` module — the same
  lexer the interpreter trusts — so keywords, strings (f-strings
  included), numbers, decorators, def/class names, builtins and comments
  are exact, never regex approximations. A snippet the lexer cannot
  finish (elided code) keeps every token up to the point it broke and
  renders the rest plain.
* JS/JSX runs a small stateful scanner, a Python port of the client
  playground's tokenizer (pages/components/code-highlighter.jsx) grown
  attribute, comment and template-literal awareness. It tracks four
  contexts — code, tag, element children, expression braces — so prose
  inside JSX children stays plain ink while tags, attributes and the
  expressions between braces take real token classes.
* JSON tells property keys from string values by the colon that follows.

A ``pyxl`` block is one file with two domains. The compiler's own
boundary rule (find_largest_python_at in miniature: the last blank-line
run whose prefix parses as real Python ends the Python half) splits it,
and each half runs through the exact engine a separate ```python /
```jsx fence would get — token-class parity with split fences holds by
construction, because the halves go through the same functions. Files
that interleave several segments (the parser docs illustrate them) fall
back to a segment walker driven by the same boundary shapes; a block
with no boundary at all is a single-domain excerpt and is tokenized
whole.

Token classes are styled in pages/styles/docs.css, scoped there under
``.docs-page .dcode`` — the homepage hero specimen and the playground keep
their own bespoke coloring.
"""

from __future__ import annotations

import ast
import builtins
import io
import keyword
import re
import tokenize

__all__ = ["highlight_block"]


def _esc(text: str) -> str:
    """Escape for HTML text content (the same three entities the docs
    generator emits, ampersand first)."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _span(cls: str | None, text: str) -> str:
    if not text:
        return ""
    if cls is None:
        return _esc(text)
    return f'<span class="{cls}">{_esc(text)}</span>'


# ═══ Python — the stdlib's own lexer ═════════════════════════════════

_PY_CONSTANTS = frozenset({"True", "False", "None"})
# ``self``/``cls`` ride with the builtins: pseudo-names every reader
# scans for, same ink as print/len.
_PY_BUILTINS = frozenset(
    name for name in dir(builtins) if not name.startswith("_")
) | {"self", "cls"}

# STRING covers plain/raw/byte strings; the FSTRING_*/TSTRING_* types
# (newer interpreters) carry the literal parts of f- and t-strings while
# the interpolated expressions inside arrive as ordinary tokens — which
# is exactly right: the expression gets expression classes.
_PY_STRING_TYPES = frozenset(
    t
    for t in (
        tokenize.STRING,
        *(
            getattr(tokenize, name, None)
            for name in (
                "FSTRING_START", "FSTRING_MIDDLE", "FSTRING_END",
                "TSTRING_START", "TSTRING_MIDDLE", "TSTRING_END",
            )
        ),
    )
    if t is not None
)

# Tokens that never take part in neighbour classification (a NAME's
# "previous token" should be the ``def`` before it, not the NEWLINE).
_PY_STRUCTURAL = frozenset(
    t
    for t in (
        tokenize.NL, tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT,
        tokenize.COMMENT, tokenize.ENDMARKER,
        getattr(tokenize, "ENCODING", None),
    )
    if t is not None
)


def _src_slice(lines: list[str], r1: int, c1: int, r2: int, c2: int) -> str:
    """Source text between two 1-based (row, col) positions, clamped —
    the lexer synthesizes an end-of-file newline past the last line."""
    last = len(lines)
    if r1 > last:
        return ""
    r2 = min(r2, last)
    if r1 == r2:
        return lines[r1 - 1][c1:c2]
    parts = [lines[r1 - 1][c1:]]
    parts.extend(lines[r] for r in range(r1, r2 - 1))
    parts.append(lines[r2 - 1][:c2])
    return "\n".join(parts)


def highlight_python(src: str) -> str:
    lines = src.split("\n")
    toks = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            toks.append(tok)
    except (tokenize.TokenError, IndentationError, SyntaxError, ValueError):
        pass  # keep what the lexer produced; the tail renders plain

    # Neighbour maps over significant tokens only.
    sig = [i for i, t in enumerate(toks) if t.string and t.type not in _PY_STRUCTURAL]
    prev_of: dict[int, tokenize.TokenInfo] = {}
    next_of: dict[int, tokenize.TokenInfo] = {}
    for k, i in enumerate(sig):
        if k:
            prev_of[i] = toks[sig[k - 1]]
        if k + 1 < len(sig):
            next_of[i] = toks[sig[k + 1]]

    out: list[str] = []
    row, col = 1, 0
    line_start = True   # the next significant token opens a logical line
    dec_mode = False    # inside a decorator's dotted name
    for i, tok in enumerate(toks):
        ttype, tstr = tok.type, tok.string
        if ttype in (tokenize.NEWLINE, tokenize.NL):
            line_start = True
            dec_mode = False
        if not tstr:
            continue
        (sr, sc), (er, ec) = tok.start, tok.end
        if (sr, sc) < (row, col):
            continue  # synthesized token the cursor already passed
        out.append(_esc(_src_slice(lines, row, col, sr, sc)))
        text = _src_slice(lines, sr, sc, er, ec)

        cls = None
        if ttype == tokenize.COMMENT:
            cls = "cm"
        elif ttype in _PY_STRING_TYPES:
            cls = "tk-str"
        elif ttype == tokenize.NUMBER:
            cls = "tk-num"
        elif ttype == tokenize.OP:
            if tstr == "@" and line_start:
                dec_mode = True
                cls = "tk-dec"
            elif dec_mode and tstr == ".":
                cls = "tk-dec"
            elif dec_mode:
                dec_mode = False  # arguments opened — back to plain ink
        elif ttype == tokenize.NAME:
            prev = prev_of.get(i)
            nxt = next_of.get(i)
            prev_s = prev.string if prev is not None else ""
            next_s = nxt.string if nxt is not None else ""
            if tstr in _PY_CONSTANTS:
                cls = "tk-cn"
            elif keyword.iskeyword(tstr):
                cls = "tk-kw"
            elif dec_mode:
                cls = "tk-dec"
            elif prev_s in ("def", "class"):
                cls = "tk-fn"
            elif prev_s == ".":
                # attribute access: plain, unless it is being called
                cls = "tk-fn" if next_s == "(" else None
            elif (
                keyword.issoftkeyword(tstr)
                and line_start
                and next_s not in ("=", ".", "(", "[", ",")
            ):
                cls = "tk-kw"
            elif tstr in _PY_BUILTINS:
                cls = "tk-bi"
            elif next_s == "(":
                cls = "tk-fn"

        out.append(_span(cls, text))
        if tok.string and ttype not in _PY_STRUCTURAL:
            line_start = False
        row, col = er, ec

    out.append(_esc(_src_slice(lines, row, col, len(lines), len(lines[-1]))))
    return "".join(out)


# ═══ JS/JSX — the playground scanner, ported and grown ═══════════════

_JS_KEYWORDS = frozenset("""
    import from export default function const let var return if else for
    of in while do switch case break continue new this class extends
    super typeof instanceof throw try catch finally async await yield
    void delete static get set
""".split())
_JS_CONSTANTS = frozenset({"true", "false", "null", "undefined", "NaN", "Infinity"})

_JS_WORD_RE = re.compile(r"[A-Za-z_$][\w$]*")
_JS_NUM_RE = re.compile(r"\d[\w.]*")
_TAG_NAME_RE = re.compile(r"[A-Za-z_][\w.:-]*")
_ATTR_NAME_RE = re.compile(r"[A-Za-z_][\w-]*")
_JSX_TEXT_RE = re.compile(r"[^<{]+")
_TPL_TEXT_RE = re.compile(r"(?:\\.|\$(?!\{)|[^`$\\])+")
_TAG_PREV_WORD_RE = re.compile(r"\b(?:return|yield|case|default|do|else)$")
_NUM_PREV = " \t\n=+-*/%(,[{:;<>&|!?"


def _tag_opens_here(src: str, i: int) -> bool:
    """Is the ``<`` at ``i`` a JSX tag, not a comparison? The char after
    it must begin a name (or close a fragment), and what precedes must
    be a place an expression can start."""
    j = i + 1
    if j < len(src) and src[j] == "/":
        j += 1
    if j >= len(src) or not (src[j].isalpha() or src[j] in "_>"):
        return False
    before = src[:i].rstrip()
    if not before:
        return True
    if before[-1] in "([{,;=:?!&|>":
        return True
    return bool(_TAG_PREV_WORD_RE.search(before))


def _scan_js_string(src: str, i: int, out: list[str]) -> int:
    """A quoted string from ``i``; stops at the closing quote or an
    unescaped end of line (elided snippets stay well-formed)."""
    quote = src[i]
    j = i + 1
    n = len(src)
    while j < n and src[j] not in (quote, "\n"):
        if src[j] == "\\":
            j += 1
        j += 1
    if j < n and src[j] == quote:
        j += 1
    out.append(_span("tk-str", src[i:j]))
    return j


def _enter_tag(src: str, i: int, out: list[str], ctx: list[list]) -> int:
    closing = src.startswith("</", i)
    head = "</" if closing else "<"
    j = i + len(head)
    m = _TAG_NAME_RE.match(src, j)
    if m is None and not (j < len(src) and src[j] == ">"):
        out.append(_esc(src[i]))
        return i + 1
    out.append(_span("tk-tag", head))
    if m is not None:
        name = m.group()
        out.append(_span("tk-cp" if name[0].isupper() else "tk-el", name))
        j = m.end()
    ctx.append(["tag", closing])
    return j


def highlight_jsx(src: str) -> str:
    out: list[str] = []
    # The context stack: "js" code, a "tag" being written (True when it
    # is a closing tag), "jsx" element children, an "expr" inside braces
    # (with its nested plain-brace depth), a "tpl" template literal.
    ctx: list[list] = [["js"]]
    word_prev = ""
    i, n = 0, len(src)
    while i < n:
        top = ctx[-1]
        kind = top[0]
        ch = src[i]

        if kind == "tag":
            if ch in "'\"":
                i = _scan_js_string(src, i, out)
            elif ch == "{":
                out.append(_span("tk-br", "{"))
                ctx.append(["expr", 0])
                i += 1
            elif ch == "/" and src.startswith("/>", i):
                out.append(_span("tk-tag", "/>"))
                ctx.pop()
                i += 2
            elif ch == ">":
                out.append(_span("tk-tag", ">"))
                closing = top[1]
                ctx.pop()
                if closing:
                    if ctx and ctx[-1][0] == "jsx":
                        ctx.pop()
                else:
                    ctx.append(["jsx"])
                i += 1
            else:
                m = _ATTR_NAME_RE.match(src, i)
                if m is not None:
                    out.append(_span("tk-at", m.group()))
                    i = m.end()
                else:
                    out.append(_esc(ch))
                    i += 1
            continue

        if kind == "jsx":
            if ch == "<":
                i = _enter_tag(src, i, out, ctx)
            elif ch == "{":
                out.append(_span("tk-br", "{"))
                ctx.append(["expr", 0])
                i += 1
            else:
                m = _JSX_TEXT_RE.match(src, i)
                out.append(_esc(m.group()))
                i = m.end()
            continue

        if kind == "tpl":
            if ch == "`":
                out.append(_span("tk-str", "`"))
                ctx.pop()
                i += 1
            elif src.startswith("${", i):
                out.append(_span("tk-br", "${"))
                ctx.append(["expr", 0])
                i += 2
            else:
                m = _TPL_TEXT_RE.match(src, i)
                out.append(_span("tk-str", m.group()))
                i = m.end()
            continue

        # "js" and "expr" — real code.
        if ch == "}" and kind == "expr":
            if top[1] == 0:
                out.append(_span("tk-br", "}"))
                ctx.pop()
            else:
                top[1] -= 1
                out.append(_esc("}"))
            i += 1
            continue
        if ch == "{":
            if kind == "expr":
                top[1] += 1
            out.append(_esc("{"))
            i += 1
            continue
        if src.startswith("//", i):
            j = src.find("\n", i)
            j = n if j == -1 else j
            out.append(_span("cm", src[i:j]))
            i = j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append(_span("cm", src[i:j]))
            i = j
            continue
        if ch in "'\"":
            i = _scan_js_string(src, i, out)
            continue
        if ch == "`":
            out.append(_span("tk-str", "`"))
            ctx.append(["tpl"])
            i += 1
            continue
        if ch == "<" and _tag_opens_here(src, i):
            i = _enter_tag(src, i, out, ctx)
            continue
        if ch.isdigit() and (i == 0 or src[i - 1] in _NUM_PREV):
            m = _JS_NUM_RE.match(src, i)
            out.append(_span("tk-num", m.group()))
            i = m.end()
            continue
        m = _JS_WORD_RE.match(src, i)
        if m is not None:
            word = m.group()
            j = m.end()
            while j < n and src[j] in " \t":
                j += 1
            called = j < n and src[j] == "("
            if word in _JS_CONSTANTS:
                cls = "tk-cn"
            elif word in _JS_KEYWORDS:
                cls = "tk-kw"
            elif word_prev in ("function", "class", "extends", "new"):
                cls = "tk-fn"
            elif called:
                cls = "tk-fn"
            else:
                cls = None
            out.append(_span(cls, word))
            word_prev = word
            i = m.end()
            continue
        out.append(_esc(ch))
        i += 1
    return "".join(out)


# ═══ JSON ════════════════════════════════════════════════════════════

_JSON_NUM_RE = re.compile(r"-?\d[\d.eE+-]*")
_JSON_CONST_RE = re.compile(r"(?:true|false|null)\b")


def highlight_json(src: str) -> str:
    out: list[str] = []
    i, n = 0, len(src)
    while i < n:
        ch = src[i]
        if src.startswith("//", i):  # jsonc
            j = src.find("\n", i)
            j = n if j == -1 else j
            out.append(_span("cm", src[i:j]))
            i = j
            continue
        if ch == '"':
            j = i + 1
            while j < n and src[j] not in ('"', "\n"):
                if src[j] == "\\":
                    j += 1
                j += 1
            if j < n and src[j] == '"':
                j += 1
            k = j
            while k < n and src[k] in " \t":
                k += 1
            cls = "tk-at" if k < n and src[k] == ":" else "tk-str"
            out.append(_span(cls, src[i:j]))
            i = j
            continue
        if ch.isdigit() or (ch == "-" and i + 1 < n and src[i + 1].isdigit()):
            m = _JSON_NUM_RE.match(src, i)
            out.append(_span("tk-num", m.group()))
            i = m.end()
            continue
        m = _JSON_CONST_RE.match(src, i)
        if m is not None:
            out.append(_span("tk-cn", m.group()))
            i = m.end()
            continue
        out.append(_esc(ch))
        i += 1
    return "".join(out)


# ═══ pyxl — one file, two domains ════════════════════════════════════

# The JS half's first line, kept in lockstep with the playground's
# PYXL_JS_BOUNDARY (pages/components/code-highlighter.jsx).
_JS_BOUNDARY_RE = re.compile(
    r"^import\b.*\bfrom\s+['\"]|^export\s+(default|function|const|class|async|let|var)\b"
)
# Python shapes at column 0 — seen BELOW a proposed boundary they mean
# the file interleaves sections, where one two-domain split would lie.
_PY_SEGMENT_RE = re.compile(
    r"^(@server\b|@action\b|async def |def |from [\w.]+ import |class [A-Za-z_]\w*[(:])"
)


def _pyxl_split_at(lines: list[str]) -> int | None:
    """Index of the first line of the JSX half, or ``None``.

    Primary rule is the compiler's own (find_largest_python_at in
    miniature): the LAST blank-line run whose prefix ``ast.parse``s as
    real Python ends the Python half. Fallback (illustrative or elided
    code): the first JS-shaped import/export line, taking any blank run
    directly above it. Python shapes below the boundary (an interleaved
    file) → no split, the segment walker takes over.
    """
    runs: list[tuple[int, int]] = []  # maximal runs of blank lines
    for i, line in enumerate(lines):
        if line.strip():
            continue
        if runs and i == runs[-1][1] + 1:
            runs[-1] = (runs[-1][0], i)
        else:
            runs.append((i, i))
    seam = None
    for start, end in runs:
        try:
            mod = ast.parse("\n".join(lines[:start]))
        except SyntaxError:
            continue
        if mod.body:  # real statements above, not just comments/blank
            seam = (start, end)
    if seam is None:
        for i, line in enumerate(lines):
            if _JS_BOUNDARY_RE.match(line):
                j = i
                while j > 0 and not lines[j - 1].strip():
                    j -= 1
                seam = (j, i - 1)
                break
    if seam is None:
        return None
    below = [line for line in lines[seam[1] + 1:] if line.strip()]
    if not below or any(_PY_SEGMENT_RE.match(line) for line in below):
        return None
    return seam[0]


def _pyxl_segments(lines: list[str]) -> list[tuple[str, list[str]]]:
    """Interleaved files: contiguous runs of one domain, switched by the
    same boundary shapes the split rule uses."""
    segments: list[tuple[str, list[str]]] = []
    mode, buf = "python", []
    for line in lines:
        if mode == "python" and _JS_BOUNDARY_RE.match(line):
            segments.append((mode, buf))
            mode, buf = "jsx", [line]
        elif mode == "jsx" and _PY_SEGMENT_RE.match(line):
            segments.append((mode, buf))
            mode, buf = "python", [line]
        else:
            buf.append(line)
    segments.append((mode, buf))
    return [(m, b) for m, b in segments if b]


def highlight_pyxl(src: str) -> str:
    """Two tokenization domains, one frame: the Python half is colorized
    with exactly the ```python rules, the JSX half with exactly the
    ```jsx rules — token-class parity with separate fences, by
    construction. Nothing is drawn at the boundary; its blank line
    renders as a plain blank line."""
    lines = src.split("\n")
    split_at = _pyxl_split_at(lines)
    if split_at is not None:
        if split_at <= 0:
            return highlight_jsx(src)
        return (
            highlight_python("\n".join(lines[:split_at]))
            + "\n"
            + highlight_jsx("\n".join(lines[split_at:]))
        )
    if any(_JS_BOUNDARY_RE.match(line) for line in lines):
        return "\n".join(
            highlight_python("\n".join(seg)) if mode == "python"
            else highlight_jsx("\n".join(seg))
            for mode, seg in _pyxl_segments(lines)
        )
    # Single-domain excerpt: no boundary anywhere.
    head = next((line for line in lines if line.strip()), "")
    if re.match(r"^\s*(<[A-Za-z/]|//)", head):
        return highlight_jsx(src)
    return highlight_python(src)


# ═══ dispatch ════════════════════════════════════════════════════════

def highlight_block(code: str, lang: str) -> str | None:
    """Escaped HTML for a language one of the engines owns, else None."""
    lang = (lang or "").lower()
    if lang in ("python", "py"):
        return highlight_python(code)
    if lang in ("jsx", "tsx", "javascript", "js", "ts", "typescript", "html", "xml"):
        return highlight_jsx(code)
    if lang in ("json", "jsonc"):
        return highlight_json(code)
    if lang == "pyxl":
        return highlight_pyxl(code)
    return None
